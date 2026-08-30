import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

async function requireOwner(ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Please sign in before uploading a resume.");
  return identity.subject;
}

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireOwner(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const save = mutation({
  args: { storageId: v.id("_storage"), fileName: v.string(), mimeType: v.string(), sizeBytes: v.number(), extractedTextLength: v.number() },
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx);
    return await ctx.db.insert("resumes", { ...args, ownerId, uploadedAt: Date.now() });
  },
});

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireOwner(ctx);
    return await ctx.db.query("resumes").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).order("desc").first();
  },
});

export const removeMine = mutation({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireOwner(ctx);
    const resumes = await ctx.db
      .query("resumes")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();

    for (const resume of resumes) {
      await ctx.storage.delete(resume.storageId);
      await ctx.db.delete(resume._id);
    }
  },
});
