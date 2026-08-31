import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireOwner } from "./owner";
import { activeMastersToDeactivate, createResumeRecord, isTemplateResume, selectActiveMaster, selectLatestTemplateResume } from "./resumeRecords";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireOwner(ctx, "Please sign in before uploading a resume.");
    return await ctx.storage.generateUploadUrl();
  },
});

export const save = mutation({
  args: { storageId: v.id("_storage"), fileName: v.string(), mimeType: v.string(), sizeBytes: v.number(), extractedTextLength: v.number(), extractedText: v.string(), detectedSkills: v.array(v.string()), contentHash: v.string(), purpose: v.optional(v.union(v.literal("template"), v.literal("master"))) },
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx, "Please sign in before uploading a resume.");
    const purpose = args.purpose ?? "template";
    if (purpose === "master") {
      const resumes = await ctx.db.query("resumes").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).collect();
      for (const resume of activeMastersToDeactivate(resumes)) await ctx.db.patch(resume._id, { isActiveMaster: false });
    }
    const resumeId = await ctx.db.insert("resumes", createResumeRecord(args, ownerId, Date.now()));
    await ctx.scheduler.runAfter(0, internal.resumeProfiles.ensureForResume, { resumeId });
    if (purpose === "template") await ctx.scheduler.runAfter(0, internal.searches.ensureFirstSearch, { ownerId });
    return resumeId;
  },
});

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireOwner(ctx, "Please sign in before uploading a resume.");
    const resumes = await ctx.db.query("resumes").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).order("desc").collect();
    const resume = selectLatestTemplateResume(resumes);
    return resume ? { ...resume, downloadUrl: await ctx.storage.getUrl(resume.storageId) } : null;
  },
});

export const activeMaster = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireOwner(ctx, "Please sign in before viewing your Master Resume.");
    const resumes = await ctx.db.query("resumes").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).order("desc").collect();
    const resume = selectActiveMaster(resumes);
    return resume ? { ...resume, downloadUrl: await ctx.storage.getUrl(resume.storageId) } : null;
  },
});

export const removeMine = mutation({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireOwner(ctx, "Please sign in before uploading a resume.");
    const resumes = (await ctx.db
      .query("resumes")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect()).filter(isTemplateResume);

    for (const resume of resumes) {
      await ctx.storage.delete(resume.storageId);
      await ctx.db.delete(resume._id);
    }
    const profiles = await ctx.db.query("resumeProfiles").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).collect();
    const removedResumeIds = new Set(resumes.map((resume) => String(resume._id)));
    for (const profile of profiles) if (removedResumeIds.has(String(profile.sourceResumeId))) await ctx.db.delete(profile._id);
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

export const removeActiveMaster = mutation({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireOwner(ctx, "Please sign in before removing your Master Resume.");
    const resumes = await ctx.db.query("resumes").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).order("desc").collect();
    const master = selectActiveMaster(resumes);
    if (!master) return false;
    await ctx.storage.delete(master.storageId);
    await ctx.db.delete(master._id);
    return true;
  },
});
