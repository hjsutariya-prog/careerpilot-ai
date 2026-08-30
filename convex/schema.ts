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
    detectedSkills: v.optional(v.array(v.string())),
    uploadedAt: v.number(),
  }).index("by_owner", ["ownerId"]),
  preferences: defineTable({
    ownerId: v.string(),
    roles: v.array(v.string()),
    skills: v.string(),
    experience: v.number(),
    city: v.optional(v.string()),
    cities: v.optional(v.array(v.string())),
    workPreference: v.optional(v.string()),
    workPreferences: v.optional(v.array(v.string())),
    salaryMin: v.number(),
    salaryMax: v.number(),
    jobType: v.string(),
    noticePeriod: v.string(),
    companiesToAvoid: v.string(),
    dailyTime: v.string(),
    updatedAt: v.number(),
  }).index("by_owner", ["ownerId"]),
});
