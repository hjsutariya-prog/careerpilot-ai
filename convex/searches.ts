import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

export type SuggestionInput = {
  jobId: string;
  rank: number;
  matchScore: number;
  matchExplanation: string;
  isRelatedMatch: boolean;
};

export function dedupeSuggestionInputs<T extends SuggestionInput>(suggestions: readonly T[]) {
  const strongestByJob = new Map<string, T>();

  for (const suggestion of suggestions) {
    const current = strongestByJob.get(suggestion.jobId);
    if (!current || suggestion.rank < current.rank) strongestByJob.set(suggestion.jobId, suggestion);
  }

  return [...strongestByJob.values()].sort((first, second) => first.rank - second.rank);
}

async function requireOwner(ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Please sign in before viewing a job brief.");
  return identity.subject;
}

const suggestionValidator = v.object({
  jobId: v.id("jobs"),
  rank: v.number(),
  matchScore: v.number(),
  matchExplanation: v.string(),
  isRelatedMatch: v.boolean(),
});

export const latestMine = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireOwner(ctx);
    const latestSearch = (await ctx.db
      .query("searchRuns")
      .withIndex("by_owner_requested", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .collect())[0] ?? null;

    if (!latestSearch) return { search: null, suggestions: [] };

    const suggestions = await ctx.db
      .query("jobSuggestions")
      .withIndex("by_search_rank", (q) => q.eq("searchRunId", latestSearch._id))
      .collect();

    return { search: latestSearch, suggestions };
  },
});

export const createRun = internalMutation({
  args: { ownerId: v.string(), kind: v.union(v.literal("first"), v.literal("daily")) },
  handler: async (ctx, args) => {
    return await ctx.db.insert("searchRuns", { ...args, status: "queued", requestedAt: Date.now() });
  },
});

export const saveSuggestions = internalMutation({
  args: { ownerId: v.string(), searchRunId: v.id("searchRuns"), suggestions: v.array(suggestionValidator) },
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

    await ctx.db.patch(args.searchRunId, { status: "complete", completedAt: Date.now(), resultCount: uniqueSuggestions.length });
  },
});
