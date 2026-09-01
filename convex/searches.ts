import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { getLiveSuggestions } from "./searchMatching";
import { dueSchedules, istDateAt, nextRunAtForIst, planFirstSearch } from "./searchScheduling";
export type SuggestionInput = {
  jobId: string;
  rank: number;
  matchScore: number;
  matchExplanation: string;
  isRelatedMatch: boolean;
  preferenceAlignment?: { location: 'aligned' | 'mismatch' | 'not_set'; workStyle: 'aligned' | 'mismatch' | 'not_set'; salary: 'unknown' };
};

export function dedupeSuggestionInputs<T extends SuggestionInput>(suggestions: readonly T[]) {
  const strongestByJob = new Map<string, T>();

  for (const suggestion of suggestions) {
    const current = strongestByJob.get(suggestion.jobId);
    if (!current || suggestion.rank < current.rank) strongestByJob.set(suggestion.jobId, suggestion);
  }

  return [...strongestByJob.values()].sort((first, second) => first.rank - second.rank);
}

import { requireOwner } from "./owner";
import { selectLatestTemplateResume } from "./resumeRecords";

const suggestionValidator = v.object({
  jobId: v.id("jobs"),
  rank: v.number(),
  matchScore: v.number(),
  matchExplanation: v.string(),
  isRelatedMatch: v.boolean(),
  preferenceAlignment: v.optional(v.object({
    location: v.union(v.literal('aligned'), v.literal('mismatch'), v.literal('not_set')),
    workStyle: v.union(v.literal('aligned'), v.literal('mismatch'), v.literal('not_set')),
    salary: v.literal('unknown'),
  })),
});

export const latestMine = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireOwner(ctx, "Please sign in before viewing a job brief.");
    const latestSearch = (await ctx.db
      .query("searchRuns")
      .withIndex("by_owner_requested", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .collect())[0] ?? null;

    if (!latestSearch) return { search: null, suggestions: [], sourceHealth: [] };

    const suggestionRows = await ctx.db
      .query("jobSuggestions")
      .withIndex("by_search_rank", (q) => q.eq("searchRunId", latestSearch._id))
      .collect();
    const suggestions = await Promise.all(suggestionRows.map(async (suggestion) => ({ ...suggestion, job: await ctx.db.get(suggestion.jobId) })));

    const latestBySource = new Map<string, { status: "success" | "failed"; completedAt: number | undefined; error: string | undefined }>();
    const sourceRuns = await ctx.db.query("sourceRuns").collect();
    for (const sourceRun of sourceRuns) {
      const current = latestBySource.get(sourceRun.sourceToken);
      if (!current || (sourceRun.completedAt ?? 0) > (current.completedAt ?? 0)) {
        latestBySource.set(sourceRun.sourceToken, { status: sourceRun.status === "success" ? "success" : "failed", completedAt: sourceRun.completedAt, error: sourceRun.error });
      }
    }

    return { search: latestSearch, suggestions, sourceHealth: [...latestBySource.entries()].map(([sourceToken, source]) => ({ sourceToken, ...source })) };
  },
});

export const trackedJobsMine = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireOwner(ctx, "Please sign in before viewing a job brief.");
    const actions = await ctx.db.query("jobActions").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).collect();
    const tracked = await Promise.all(actions.map(async (action) => {
      try {
        const job = await ctx.db.get(action.jobId as Id<"jobs">);
        return job ? { action, job } : null;
      } catch {
        return null;
      }
    }));
    return tracked.filter((item): item is NonNullable<typeof item> => item !== null);
  },
});

export const createRun = internalMutation({
  args: { ownerId: v.string(), kind: v.union(v.literal("first"), v.literal("daily")) },
  handler: async (ctx, args) => {
    return await ctx.db.insert("searchRuns", { ...args, status: "queued", requestedAt: Date.now() });
  },
});

export const saveSuggestions = internalMutation({
  args: { ownerId: v.string(), searchRunId: v.id("searchRuns"), suggestions: v.array(suggestionValidator), sourceWarning: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const searchRun = await ctx.db.get(args.searchRunId);
    if (!searchRun || searchRun.ownerId !== args.ownerId) throw new Error("This search run is not available for that user.");

    const uniqueSuggestions = dedupeSuggestionInputs(args.suggestions.map((suggestion) => ({ ...suggestion, jobId: String(suggestion.jobId) })));
    for (const suggestion of uniqueSuggestions) {
      const jobId = suggestion.jobId as typeof args.suggestions[number]["jobId"];
      const existing = await ctx.db
        .query("jobSuggestions")
        .withIndex("by_search_job", (q) => q.eq("searchRunId", args.searchRunId).eq("jobId", jobId))
        .unique();
      if (!existing) await ctx.db.insert("jobSuggestions", { ...suggestion, jobId, ownerId: args.ownerId, searchRunId: args.searchRunId });
    }

  },
});

export const completeSearch = internalMutation({
  args: { searchRunId: v.id("searchRuns"), sourceWarning: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const searchRun = await ctx.db.get(args.searchRunId);
    if (!searchRun) return;
    const suggestions = await ctx.db.query("jobSuggestions").withIndex("by_search_rank", (q) => q.eq("searchRunId", args.searchRunId)).collect();
    await ctx.db.patch(args.searchRunId, { status: "complete", completedAt: Date.now(), resultCount: suggestions.length, sourceWarning: args.sourceWarning });
  },
});

export const ensureFirstSearch = internalMutation({
  args: { ownerId: v.string() },
  handler: async (ctx, args) => {
    const preferences = await ctx.db.query("preferences").withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId)).first();
    const resumes = await ctx.db.query("resumes").withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId)).order("desc").collect();
    const resume = selectLatestTemplateResume(resumes);
    if (!preferences) return { firstQueued: false, reason: "preferences-missing" };
    if (resume?.extractedText) await ctx.scheduler.runAfter(0, internal.resumeProfiles.ensureForResume, { resumeId: resume._id });

    const nextRunAt = nextRunAtForIst(preferences.dailyTime, Date.now());
    const existingSchedule = await ctx.db.query("searchSchedules").withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId)).unique();
    const scheduleRecord = { dailyTime: preferences.dailyTime, nextRunAt, updatedAt: Date.now() };
    if (existingSchedule) await ctx.db.patch(existingSchedule._id, scheduleRecord);
    else await ctx.db.insert("searchSchedules", { ownerId: args.ownerId, ...scheduleRecord });

    const previousSearches = await ctx.db.query("searchRuns").withIndex("by_owner_requested", (q) => q.eq("ownerId", args.ownerId)).collect();
    const setup = planFirstSearch({ hasResume: Boolean(resume), hasPreferences: true, hasPreviousSearch: previousSearches.some((search) => search.kind === "first" && search.status !== "failed") });
    if (!setup) return { firstQueued: false, reason: resume ? "first-search-already-started" : "resume-missing" };

    const searchRunId = await ctx.db.insert("searchRuns", { ownerId: args.ownerId, kind: setup.kind, status: "queued", requestedAt: Date.now() });
    await ctx.scheduler.runAfter(setup.delayMs, internal.searches.runSearch, { searchRunId });
    return { firstQueued: true, searchRunId };
  },
});

export const requestFirstSearch = mutation({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireOwner(ctx, "Please sign in before viewing a job brief.");
    await ctx.scheduler.runAfter(0, internal.searches.ensureFirstSearch, { ownerId });
  },
});

export const queueDueDailySearches = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const currentIstDate = istDateAt(now);
    const scheduled = await ctx.db
      .query("searchSchedules")
      .withIndex("by_next_run", (q) => q.lte("nextRunAt", now))
      .take(100);
    const due = dueSchedules(scheduled, now, currentIstDate);

    for (const schedule of due) {
      const searchRunId = await ctx.db.insert("searchRuns", { ownerId: schedule.ownerId, kind: "daily", status: "queued", requestedAt: now });
      await ctx.db.patch(schedule._id, {
        lastRunIstDate: currentIstDate,
        nextRunAt: nextRunAtForIst(schedule.dailyTime, now),
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(0, internal.searches.runSearch, { searchRunId });
    }

    return { queued: due.length };
  },
});

export const refreshAllScheduledBriefs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const currentIstDate = istDateAt(now);
    const schedules = await ctx.db.query("searchSchedules").collect();

    for (const schedule of schedules) {
      const searchRunId = await ctx.db.insert("searchRuns", { ownerId: schedule.ownerId, kind: "daily", status: "queued", requestedAt: now });
      await ctx.db.patch(schedule._id, {
        lastRunIstDate: currentIstDate,
        nextRunAt: nextRunAtForIst(schedule.dailyTime, now),
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(0, internal.searches.runSearch, { searchRunId });
    }

    return { queued: schedules.length };
  },
});

export const runById = internalQuery({
  args: { searchRunId: v.id("searchRuns") },
  handler: async (ctx, args) => await ctx.db.get(args.searchRunId),
});

export const matchingInputForOwner = internalQuery({
  args: { ownerId: v.string() },
  handler: async (ctx, args) => {
    const preferences = await ctx.db.query("preferences").withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId)).first();
    if (!preferences) return null;
    return {
      roles: preferences.roles,
      skills: preferences.skills,
      cities: preferences.cities ?? (preferences.city ? [preferences.city] : []),
      workPreferences: preferences.workPreferences ?? (preferences.workPreference ? [preferences.workPreference] : []),
      companiesToAvoid: preferences.companiesToAvoid,
    };
  },
});

export const activeJobsForMatching = internalQuery({
  args: {},
  handler: async (ctx) => await ctx.db.query("jobs").withIndex("by_active_updated", (q) => q.eq("isActive", true)).order("desc").collect(),
});

export const inventoryFreshness = internalQuery({
  args: {},
  handler: async (ctx) => {
    const sourceRuns = await ctx.db.query("sourceRuns").collect();
    const successfulRuns = sourceRuns.filter((run) => run.status === "success" && run.completedAt);
    return { latestSuccessfulRefreshAt: successfulRuns.reduce((latest, run) => Math.max(latest, run.completedAt ?? 0), 0) };
  },
});

export const setSearchStatus = internalMutation({
  args: {
    searchRunId: v.id("searchRuns"),
    status: v.union(v.literal("fetching"), v.literal("matching")),
  },
  handler: async (ctx, args) => {
    const searchRun = await ctx.db.get(args.searchRunId);
    if (!searchRun) throw new Error("This search run no longer exists.");
    await ctx.db.patch(args.searchRunId, { status: args.status, startedAt: searchRun.startedAt ?? Date.now() });
  },
});

export const failSearch = internalMutation({
  args: { searchRunId: v.id("searchRuns"), error: v.string() },
  handler: async (ctx, args) => {
    const searchRun = await ctx.db.get(args.searchRunId);
    if (!searchRun) return;
    await ctx.db.patch(args.searchRunId, { status: "failed", completedAt: Date.now(), error: args.error });
  },
});

export const runSearch = internalAction({
  args: { searchRunId: v.id("searchRuns") },
  handler: async (ctx, args) => {
    const searchRun = await ctx.runQuery(internal.searches.runById, args);
    if (!searchRun || searchRun.status === "complete" || searchRun.status === "failed") return;

    const preferences = await ctx.runQuery(internal.searches.matchingInputForOwner, { ownerId: searchRun.ownerId });
    if (!preferences) {
      await ctx.runMutation(internal.searches.failSearch, { searchRunId: args.searchRunId, error: "Your job preferences are missing. Save them and try again." });
      return;
    }

    await ctx.runMutation(internal.searches.setSearchStatus, { searchRunId: args.searchRunId, status: "fetching" });
    const freshness = await ctx.runQuery(internal.searches.inventoryFreshness, {});
    let failedSourceTokens: string[] = [];
    if (Date.now() - freshness.latestSuccessfulRefreshAt > 15 * 60 * 1000) {
      const outcomes = await ctx.runAction(internal.greenhouse.refreshInventory, { reason: searchRun.kind === "first" ? "first-search" : "daily" }) as Array<{ status: string; sourceToken: string }>;
      failedSourceTokens = outcomes.filter((outcome) => outcome.status === "failed").map((outcome) => outcome.sourceToken);
      if (failedSourceTokens.length === outcomes.length) {
        await ctx.runMutation(internal.searches.failSearch, { searchRunId: args.searchRunId, error: "We could not reach any approved Greenhouse source. Please try again later." });
        return;
      }
    }

    await ctx.runMutation(internal.searches.setSearchStatus, { searchRunId: args.searchRunId, status: "matching" });
    const jobs = await ctx.runQuery(internal.searches.activeJobsForMatching, {}) as Array<{ _id: Id<"jobs">; title: string; companyName: string; cities: string[]; locationLabel: string; skills: string[]; description: string; lastUpdatedAt: number }>;
    const jobsById = new Map(jobs.map((job) => [String(job._id), job._id]));
    const suggestions = getLiveSuggestions(preferences, jobs.map((job) => ({ id: String(job._id), title: job.title, companyName: job.companyName, cities: job.cities, locationLabel: job.locationLabel, skills: job.skills, description: job.description, lastUpdatedAt: job.lastUpdatedAt })));
    const sourceWarning = failedSourceTokens.length > 0 ? `${failedSourceTokens.length} approved Greenhouse source${failedSourceTokens.length === 1 ? " was" : "s were"} unavailable for this search.` : undefined;
    await ctx.runMutation(internal.searches.saveSuggestions, {
      ownerId: searchRun.ownerId,
      searchRunId: args.searchRunId,
      suggestions: suggestions.map((suggestion) => ({ jobId: jobsById.get(suggestion.id)!, rank: suggestion.rank, matchScore: suggestion.matchScore, matchExplanation: suggestion.matchExplanation, isRelatedMatch: suggestion.isRelatedMatch, preferenceAlignment: suggestion.preferenceAlignment })),
      sourceWarning,
    });
    const matching = await ctx.runAction(internal.resumeMatching.matchSearchRun, { searchRunId: args.searchRunId });
    if (matching.state === "pending") {
      await ctx.scheduler.runAfter(5_000, internal.searches.runSearch, { searchRunId: args.searchRunId });
      return;
    }
    const matchWarning = matching.state === "fallback" ? "Resume analysis is unavailable, so this brief uses your saved preferences for now." : undefined;
    await ctx.runMutation(internal.searches.completeSearch, { searchRunId: args.searchRunId, sourceWarning: sourceWarning ?? matchWarning });
  },
});
