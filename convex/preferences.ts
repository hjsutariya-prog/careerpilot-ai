import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";

async function requireOwner(ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Please sign in before saving preferences.");
  return identity.subject;
}

const preferenceArgs = {
  roles: v.array(v.string()),
  skills: v.string(),
  experience: v.number(),
  cities: v.array(v.string()),
  workPreferences: v.array(v.string()),
  salaryMin: v.number(),
  salaryMax: v.number(),
  jobType: v.string(),
  noticePeriod: v.string(),
  companiesToAvoid: v.string(),
  dailyTime: v.string(),
};

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireOwner(ctx);
    return await ctx.db
      .query("preferences")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .first();
  },
});

export const save = mutation({
  args: preferenceArgs,
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx);
    const existing = await ctx.db
      .query("preferences")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .first();
    const record = { ...args, ownerId, updatedAt: Date.now() };

    if (existing) {
      await ctx.db.patch(existing._id, record);
      await ctx.scheduler.runAfter(0, internal.searches.ensureFirstSearch, { ownerId });
      return existing._id;
    }

    const preferenceId = await ctx.db.insert("preferences", record);
    await ctx.scheduler.runAfter(0, internal.searches.ensureFirstSearch, { ownerId });
    return preferenceId;
  },
});
