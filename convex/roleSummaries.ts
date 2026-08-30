import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { isAllowedAdminEmail } from "./adminAccess";
import { requireOwner } from "./owner";
import { planRoleSummaryRefresh, takeRoleSummaryRefreshBatch } from "./roleSummaryRefresh";

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

type ListingSummaryInput = {
  title: string;
  companyName: string;
  locationLabel: string;
  description: string;
  skills: string[];
};

function cleanText(value: unknown, limit: number) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, limit);
}

function listingSentences(value: string) {
  return cleanText(value, 12_000)
    .split(/(?<=[.!?])\s+(?=[A-Z])|\s+(?=(?:Responsibilities|Key Responsibilities|What You'll Do|What You Will Do|Requirements|Qualifications|Skills)\b)/i)
    .map((sentence) => cleanText(sentence, 260))
    .filter((sentence) => sentence.length >= 35);
}

/** A clear, non-AI fallback saved from facts already present in a public listing. */
export function createListingRoleSummary(job: ListingSummaryInput): GeminiRoleSummary {
  const namedSkills = job.skills.map((skill) => cleanText(skill, 80)).filter(Boolean).slice(0, 6);
  const sentences = listingSentences(job.description);
  const responsibilityStart = sentences.findIndex((sentence) => /(?:responsibilities|what you(?:'|’)ll do|what you will do|your impact|you will)/i.test(sentence));
  const firstResponsibility = sentences[responsibilityStart] ?? "";
  const startsWithHeading = /^(?:responsibilities|key responsibilities|what you(?:'|’)ll do|what you will do|your impact)\b[:\-]?$/i.test(firstResponsibility);
  const responsibilitySource = responsibilityStart >= 0 ? sentences.slice(responsibilityStart + (startsWithHeading ? 1 : 0)) : sentences;
  const responsibilities = responsibilitySource.slice(0, 5);
  const focus = namedSkills.length > 0 ? namedSkills.join(", ") : "the responsibilities described in the listing";
  const location = cleanText(job.locationLabel, 120);

  return {
    summary: `${cleanText(job.title, 180)} at ${cleanText(job.companyName, 180)} is a role${location ? ` based in ${location}` : ""}. The listing focuses on ${focus}.`,
    responsibilities: responsibilities.length > 0
      ? responsibilities
      : ["Review the original company listing for the day-to-day responsibilities of this role."],
    skills: namedSkills,
    suitableFor: namedSkills.length > 0
      ? `It suits candidates whose experience matches the stated role requirements, including ${namedSkills.slice(0, 3).join(", ")}.`
      : "It suits candidates whose experience matches the responsibilities and requirements in the original listing.",
  };
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

async function requireAdmin(ctx: { auth: { getUserIdentity: () => Promise<{ email?: string } | null> } }) {
  const identity = await ctx.auth.getUserIdentity();
  const environment = globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } };
  if (!isAllowedAdminEmail(identity?.email, environment.process?.env?.CAREERPILOT_ADMIN_EMAIL)) throw new Error("Admin access required.");
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
    const ownerId = await requireOwner(ctx, "Please sign in before viewing an AI role summary.");
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
    const ownerId = await requireOwner(ctx, "Please sign in before viewing an AI role summary.");
    if (!await jobIsInLatestBrief(ctx, ownerId, args.jobId)) throw new Error("That role is not in your current job brief.");
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("This role is no longer available.");
    const existing = await ctx.db.query("jobRoleSummaries").withIndex("by_job", (index) => index.eq("jobId", args.jobId)).unique();
    if (existing?.origin === "manual") return { status: existing.status };
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
    await ctx.db.patch(args.summaryId, { status: "ready", origin: "gemini", ...args.result, generatedAt: Date.now(), failureMessage: undefined });
  },
});

const manualResultValidator = v.object({ summary: v.string(), responsibilities: v.array(v.string()), skills: v.array(v.string()), suitableFor: v.string() });

export const adminSaveManual = mutation({
  args: { jobId: v.id("jobs"), result: manualResultValidator },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("This role no longer exists.");
    const existing = await ctx.db.query("jobRoleSummaries").withIndex("by_job", (index) => index.eq("jobId", args.jobId)).unique();
    const values = { jobLastUpdatedAt: job.lastUpdatedAt, status: "ready" as const, origin: "manual" as const, ...args.result, generatedAt: Date.now(), failureMessage: undefined, startedAt: undefined };
    if (existing) await ctx.db.patch(existing._id, values);
    else await ctx.db.insert("jobRoleSummaries", { jobId: args.jobId, ...values });
  },
});

/**
 * Saves a readable fallback for every active role that is not protected as a
 * manually written summary. This cancels any queued Gemini work for those rows
 * because `generate` only processes rows whose status is still `queued`.
 */
export const adminSaveListingFallbacks = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const jobs = await ctx.db.query("jobs").withIndex("by_active_updated", (index) => index.eq("isActive", true)).collect();
    const saved = await ctx.db.query("jobRoleSummaries").collect();
    const byJobId = new Map(saved.map((summary) => [String(summary.jobId), summary]));
    let created = 0;
    let updated = 0;
    let skippedManual = 0;

    for (const job of jobs) {
      const existing = byJobId.get(String(job._id));
      if (existing?.origin === "manual") {
        skippedManual += 1;
        continue;
      }
      const result = createListingRoleSummary(job);
      const values = {
        jobLastUpdatedAt: job.lastUpdatedAt,
        status: "ready" as const,
        origin: "default" as const,
        ...result,
        generatedAt: Date.now(),
        failureMessage: undefined,
        startedAt: undefined,
      };
      if (existing) {
        await ctx.db.patch(existing._id, values);
        updated += 1;
      } else {
        await ctx.db.insert("jobRoleSummaries", { jobId: job._id, ...values });
        created += 1;
      }
    }
    return { created, updated, skippedManual };
  },
});

export const adminQueueGeminiRefresh = mutation({
  args: { batchSize: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const jobs = await ctx.db.query("jobs").withIndex("by_active_updated", (index) => index.eq("isActive", true)).collect();
    const summaries = await ctx.db.query("jobRoleSummaries").collect();
    const plan = planRoleSummaryRefresh(
      jobs.map((job) => ({ id: String(job._id), lastUpdatedAt: job.lastUpdatedAt, isActive: job.isActive })),
      summaries.map((summary) => ({ jobId: String(summary.jobId), jobLastUpdatedAt: summary.jobLastUpdatedAt, status: summary.status, origin: summary.origin })),
    );
    const jobsById = new Map(jobs.map((job) => [String(job._id), job]));
    const summariesByJob = new Map(summaries.map((summary) => [String(summary.jobId), summary]));

    const jobIds = takeRoleSummaryRefreshBatch(plan.jobIds, args.batchSize);
    for (const [position, jobId] of jobIds.entries()) {
      const job = jobsById.get(jobId)!;
      const existing = summariesByJob.get(jobId);
      const summaryId = existing
        ? (await ctx.db.patch(existing._id, { jobLastUpdatedAt: job.lastUpdatedAt, status: "queued", summary: undefined, responsibilities: undefined, skills: undefined, suitableFor: undefined, startedAt: undefined, generatedAt: undefined, failureMessage: undefined }), existing._id)
        : await ctx.db.insert("jobRoleSummaries", { jobId: job._id, jobLastUpdatedAt: job.lastUpdatedAt, status: "queued" });
      await ctx.scheduler.runAfter(position * 3_000, internal.roleSummaries.generate, { summaryId });
    }

    return { queued: jobIds.length, skippedManual: plan.skippedManual, skippedInProgress: plan.skippedInProgress };
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
