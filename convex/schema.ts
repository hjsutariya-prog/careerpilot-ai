import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,
  resumes: defineTable({
    ownerId: v.string(),
    storageId: v.id("_storage"),
    fileName: v.string(),
    mimeType: v.string(),
    sizeBytes: v.number(),
    extractedTextLength: v.number(),
    uploadedAt: v.number(),
  }).index("by_owner", ["ownerId"]),
});
