import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireOwner } from "./owner";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireOwner(ctx, "Please sign in before uploading a resume.");
    return await ctx.storage.generateUploadUrl();
  },
});

export const save = mutation({
  args: { storageId: v.id("_storage"), fileName: v.string(), mimeType: v.string(), sizeBytes: v.number(), extractedTextLength: v.number(), extractedText: v.string(), detectedSkills: v.array(v.string()), contentHash: v.string() },
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx, "Please sign in before uploading a resume.");
    const resumeId = await ctx.db.insert("resumes", { ...args, ownerId, uploadedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.resumeProfiles.ensureForResume, { resumeId });
    await ctx.scheduler.runAfter(0, internal.searches.ensureFirstSearch, { ownerId });
    return resumeId;
  },
});

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireOwner(ctx, "Please sign in before uploading a resume.");
    const resume = await ctx.db.query("resumes").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).order("desc").first();
    return resume ? { ...resume, downloadUrl: await ctx.storage.getUrl(resume.storageId) } : null;
  },
});

export const removeMine = mutation({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireOwner(ctx, "Please sign in before uploading a resume.");
    const resumes = await ctx.db
      .query("resumes")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();

    for (const resume of resumes) {
      await ctx.storage.delete(resume.storageId);
      await ctx.db.delete(resume._id);
    }
    const profiles = await ctx.db.query("resumeProfiles").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).collect();
    for (const profile of profiles) await ctx.db.delete(profile._id);
    const matches = await ctx.db.query("resumeJobMatches").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).collect();
    for (const match of matches) await ctx.db.delete(match._id);
    const documents = await ctx.db.query("generatedResumeDocuments").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).collect();
    for (const document of documents) {
      if (document.sourceDocxStorageId) await ctx.storage.delete(document.sourceDocxStorageId);
      if (document.pdfStorageId) await ctx.storage.delete(document.pdfStorageId);
      await ctx.db.delete(document._id);
    }
  },
});
