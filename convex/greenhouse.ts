import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { GreenhouseApiJob } from "./greenhouseNormalization";
import { prepareSuccessfulSourceRefresh, buildGreenhouseJobsUrl } from "./greenhouseRefresh";
import { greenhouseSources } from "./greenhouseSources";

const normalizedJobValidator = v.object({
  sourceToken: v.string(),
  externalJobId: v.string(),
  title: v.string(),
  companyName: v.string(),
  normalizedCompany: v.string(),
  locationLabel: v.string(),
  cities: v.array(v.string()),
  description: v.string(),
  skills: v.array(v.string()),
  applyUrl: v.string(),
  lastUpdatedAt: v.number(),
  lastSeenAt: v.number(),
  isIndiaItRole: v.literal(true),
});

function utcSnapshotDate(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function readableError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 500) : "Greenhouse returned an unknown error.";
}

function isGreenhouseJob(value: unknown): value is GreenhouseApiJob {
  if (!value || typeof value !== "object") return false;
  const job = value as Record<string, unknown>;
  return (typeof job.id === "string" || typeof job.id === "number")
    && typeof job.title === "string"
    && typeof job.updated_at === "string"
    && typeof job.absolute_url === "string";
}

async function fetchBoardJobs(sourceToken: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(buildGreenhouseJobsUrl({ token: sourceToken, companyName: "" }), {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Greenhouse returned ${response.status} for ${sourceToken}.`);
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || !Array.isArray((body as { jobs?: unknown }).jobs)) throw new Error(`Greenhouse returned an invalid jobs response for ${sourceToken}.`);
    return (body as { jobs: unknown[] }).jobs.filter(isGreenhouseJob);
  } finally {
    clearTimeout(timeout);
  }
}

export const persistSourceSuccess = internalMutation({
  args: {
    sourceToken: v.string(),
    observedAt: v.number(),
    recordsFetched: v.number(),
    activeRetained: v.number(),
    jobs: v.array(normalizedJobValidator),
  },
  handler: async (ctx, args) => {
    const sourceJobs = await ctx.db
      .query("jobs")
      .withIndex("by_source_external", (q) => q.eq("sourceToken", args.sourceToken))
      .collect();
    const incomingByExternalId = new Map(args.jobs.map((job) => [job.externalJobId, job]));
    const snapshotDate = utcSnapshotDate(args.observedAt);

    for (const sourceJob of sourceJobs) {
      const incoming = incomingByExternalId.get(sourceJob.externalJobId);
      if (incoming) {
        const { isIndiaItRole: _isIndiaItRole, ...jobRecord } = incoming;
        await ctx.db.patch(sourceJob._id, { ...jobRecord, firstSeenAt: sourceJob.firstSeenAt, isActive: true, closedAt: undefined });
        const snapshot = await ctx.db
          .query("jobSnapshots")
          .withIndex("by_job_date", (q) => q.eq("jobId", sourceJob._id).eq("snapshotDate", snapshotDate))
          .unique();
        if (snapshot) await ctx.db.patch(snapshot._id, { isActive: true, observedAt: args.observedAt });
        else await ctx.db.insert("jobSnapshots", { jobId: sourceJob._id, snapshotDate, isActive: true, observedAt: args.observedAt });
        incomingByExternalId.delete(sourceJob.externalJobId);
      } else if (sourceJob.isActive) {
        await ctx.db.patch(sourceJob._id, { isActive: false, closedAt: args.observedAt });
        const snapshot = await ctx.db
          .query("jobSnapshots")
          .withIndex("by_job_date", (q) => q.eq("jobId", sourceJob._id).eq("snapshotDate", snapshotDate))
          .unique();
        if (snapshot) await ctx.db.patch(snapshot._id, { isActive: false, observedAt: args.observedAt });
        else await ctx.db.insert("jobSnapshots", { jobId: sourceJob._id, snapshotDate, isActive: false, observedAt: args.observedAt });
      }
    }

    for (const job of incomingByExternalId.values()) {
      const { isIndiaItRole: _isIndiaItRole, ...jobRecord } = job;
      const jobId = await ctx.db.insert("jobs", { ...jobRecord, firstSeenAt: args.observedAt, isActive: true });
      await ctx.db.insert("jobSnapshots", { jobId, snapshotDate, isActive: true, observedAt: args.observedAt });
    }

    await ctx.db.insert("sourceRuns", {
      sourceToken: args.sourceToken,
      status: "success",
      startedAt: args.observedAt,
      completedAt: Date.now(),
      recordsFetched: args.recordsFetched,
      activeRetained: args.activeRetained,
      durationMs: Date.now() - args.observedAt,
    });
  },
});

export const persistSourceFailure = internalMutation({
  args: { sourceToken: v.string(), startedAt: v.number(), error: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert("sourceRuns", {
      sourceToken: args.sourceToken,
      status: "failed",
      startedAt: args.startedAt,
      completedAt: Date.now(),
      durationMs: Date.now() - args.startedAt,
      error: args.error,
    });
  },
});

export const refreshInventory = internalAction({
  args: { reason: v.union(v.literal("first-search"), v.literal("daily")) },
  handler: async (ctx) => {
    const outcomes: Array<{ sourceToken: string; status: "success" | "failed" }> = [];

    for (const source of greenhouseSources) {
      const observedAt = Date.now();
      try {
        const rawJobs = await fetchBoardJobs(source.token);
        const prepared = prepareSuccessfulSourceRefresh(source, rawJobs, observedAt, observedAt);
        await ctx.runMutation(internal.greenhouse.persistSourceSuccess, { sourceToken: source.token, observedAt, ...prepared });
        outcomes.push({ sourceToken: source.token, status: "success" });
      } catch (error) {
        await ctx.runMutation(internal.greenhouse.persistSourceFailure, { sourceToken: source.token, startedAt: observedAt, error: readableError(error) });
        outcomes.push({ sourceToken: source.token, status: "failed" });
      }
    }

    return outcomes;
  },
});
