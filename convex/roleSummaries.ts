import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const GEMINI_MODEL = "gemini-3.6-flash";

const roleSummarySchema = {
  type: "object",
  properties: {
    summary: { type: "string", description: "A two or three sentence, plain-English description of the role. Do not repeat company marketing." },
    responsibilities: { type: "array", items: { type: "string" }, description: "Three to five specific things the person will work on." },
    skills: { type: "array", items: { type: "string" }, description: "Up to six skills or tools explicitly named in the listing." },
    suitableFor: { type: "string", description: "One concise sentence describing the candidate the role seems intended for, only from the listing." },
  },
  required: ["summary", "responsibilities", "skills", "suitableFor"],
  additionalProperties: false,
} as const;

type GeminiInteractionResponse = {
  steps?: Array<{ type?: unknown; content?: Array<{ type?: unknown; text?: unknown }> }>;
};

export function interactionOutputText(body: GeminiInteractionResponse) {
  const lastModelOutput = [...(body.steps ?? [])].reverse().find((step) => step.type === "model_output");
  return lastModelOutput?.content
    ?.filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("") ?? "";
}

type GeminiRoleSummary = {
  summary: string;
  responsibilities: string[];
  skills: string[];
  suitableFor: string;
};

function cleanText(value: unknown, limit: number) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, limit);
}

export function parseGeminiRoleSummary(value: string): GeminiRoleSummary | null {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const summary = cleanText(parsed.summary, 650);
    const suitableFor = cleanText(parsed.suitableFor, 300);
    const responsibilities = Array.isArray(parsed.responsibilities)
      ? parsed.responsibilities.map((item) => cleanText(item, 260)).filter(Boolean).slice(0, 5)
      : [];
    const skills = Array.isArray(parsed.skills)
      ? parsed.skills.map((item) => cleanText(item, 80)).filter(Boolean).slice(0, 6)
      : [];
    if (!summary || !suitableFor || responsibilities.length === 0) return null;
    return { summary, responsibilities, skills, suitableFor };
  } catch {
    return null;
  }
}

async function requireOwner(ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Please sign in before viewing an AI role summary.");
  return identity.subject;
}

async function jobIsInLatestBrief(ctx: { db: any }, ownerId: string, jobId: Id<"jobs">) {
  const latestSearch = (await ctx.db
    .query("searchRuns")
    .withIndex("by_owner_requested", (index: any) => index.eq("ownerId", ownerId))
    .order("desc")
    .collect())[0] ?? null;
  if (!latestSearch) return false;
  const suggestions = await ctx.db
    .query("jobSuggestions")
    .withIndex("by_search_rank", (index: any) => index.eq("searchRunId", latestSearch._id))
    .collect();
  return suggestions.some((suggestion: { jobId: Id<"jobs"> }) => suggestion.jobId === jobId);
}

export const mine = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx);
    if (!await jobIsInLatestBrief(ctx, ownerId, args.jobId)) throw new Error("That role is not in your current job brief.");
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;
    const existing = await ctx.db.query("jobRoleSummaries").withIndex("by_job", (index) => index.eq("jobId", args.jobId)).unique();
    if (!existing || existing.jobLastUpdatedAt !== job.lastUpdatedAt) return null;
    return existing;
  },
});

export const request = mutation({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx);
    if (!await jobIsInLatestBrief(ctx, ownerId, args.jobId)) throw new Error("That role is not in your current job brief.");
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("This role is no longer available.");
    const existing = await ctx.db.query("jobRoleSummaries").withIndex("by_job", (index) => index.eq("jobId", args.jobId)).unique();
    const generatingRecently = existing?.status === "generating" && existing.startedAt && Date.now() - existing.startedAt < 15_000;
    if (existing && existing.jobLastUpdatedAt === job.lastUpdatedAt && (existing.status === "ready" || existing.status === "queued" || generatingRecently)) return { status: existing.status };

    const summaryId = existing
      ? (await ctx.db.patch(existing._id, { jobLastUpdatedAt: job.lastUpdatedAt, status: "queued", summary: undefined, responsibilities: undefined, skills: undefined, suitableFor: undefined, startedAt: undefined, generatedAt: undefined, failureMessage: undefined }), existing._id)
      : await ctx.db.insert("jobRoleSummaries", { jobId: args.jobId, jobLastUpdatedAt: job.lastUpdatedAt, status: "queued" });
    await ctx.scheduler.runAfter(0, internal.roleSummaries.generate, { summaryId });
    return { status: "queued" as const };
  },
});

export const inputForGeneration = internalQuery({
  args: { summaryId: v.id("jobRoleSummaries") },
  handler: async (ctx, args) => {
    const saved = await ctx.db.get(args.summaryId);
    if (!saved || saved.status !== "queued") return null;
    const job = await ctx.db.get(saved.jobId);
    if (!job || job.lastUpdatedAt !== saved.jobLastUpdatedAt) return null;
    return { saved, job: { title: job.title, companyName: job.companyName, description: job.description } };
  },
});

export const markGenerating = internalMutation({
  args: { summaryId: v.id("jobRoleSummaries") },
  handler: async (ctx, args) => {
    const saved = await ctx.db.get(args.summaryId);
    if (!saved || saved.status !== "queued") return false;
    await ctx.db.patch(args.summaryId, { status: "generating", startedAt: Date.now() });
    return true;
  },
});

export const markReady = internalMutation({
  args: { summaryId: v.id("jobRoleSummaries"), result: v.object({ summary: v.string(), responsibilities: v.array(v.string()), skills: v.array(v.string()), suitableFor: v.string() }) },
  handler: async (ctx, args) => {
    const saved = await ctx.db.get(args.summaryId);
    if (!saved) return;
    await ctx.db.patch(args.summaryId, { status: "ready", ...args.result, generatedAt: Date.now(), failureMessage: undefined });
  },
});

export const markFailed = internalMutation({
  args: { summaryId: v.id("jobRoleSummaries"), failureMessage: v.string() },
  handler: async (ctx, args) => {
    const saved = await ctx.db.get(args.summaryId);
    if (!saved) return;
    await ctx.db.patch(args.summaryId, { status: "failed", failureMessage: args.failureMessage });
  },
});

export const generate = internalAction({
  args: { summaryId: v.id("jobRoleSummaries") },
  handler: async (ctx, args) => {
    const input = await ctx.runQuery(internal.roleSummaries.inputForGeneration, args);
    if (!input) return;
    if (!await ctx.runMutation(internal.roleSummaries.markGenerating, args)) return;

    const apiKey = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.GEMINI_API_KEY;
    if (!apiKey) {
      await ctx.runMutation(internal.roleSummaries.markFailed, { ...args, failureMessage: "AI summaries are not set up yet. Showing the listing-based summary instead." });
      return;
    }

    const prompt = `Summarize this public job listing for a job seeker. Use only facts in the listing. Do not guess, add salary information, or repeat company marketing.\n\nRole: ${input.job.title}\nCompany: ${input.job.companyName}\n\nListing:\n${input.job.description.slice(0, 9000)}`;
    try {
      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          model: GEMINI_MODEL,
          input: prompt,
          response_format: { type: "text", mime_type: "application/json", schema: roleSummarySchema },
        }),
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) {
        const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 500);
        throw new Error(`Gemini returned ${response.status}: ${detail}`);
      }
      const body = await response.json() as GeminiInteractionResponse;
      const outputText = interactionOutputText(body);
      const result = parseGeminiRoleSummary(outputText);
      if (!result) throw new Error("Gemini returned an incomplete role summary");
      await ctx.runMutation(internal.roleSummaries.markReady, { ...args, result });
    } catch (error) {
      console.warn("Gemini role summary failed", error instanceof Error ? error.message : "Unknown error");
      await ctx.runMutation(internal.roleSummaries.markFailed, { ...args, failureMessage: "We could not prepare the AI summary right now. Showing the listing-based summary instead." });
    }
  },
});
