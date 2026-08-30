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
  jobActions: defineTable({
    ownerId: v.string(),
    jobId: v.string(),
    status: v.union(v.literal("Apply"), v.literal("Reject"), v.literal("On Hold")),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_job", ["ownerId", "jobId"]),
  connectionImports: defineTable({
    ownerId: v.string(),
    fileName: v.string(),
    totalRows: v.number(),
    importedRows: v.number(),
    errors: v.array(v.object({ rowNumber: v.number(), message: v.string() })),
    status: v.union(v.literal("uploading"), v.literal("complete")),
    importedAt: v.number(),
  }).index("by_owner", ["ownerId"]),
  connections: defineTable({
    ownerId: v.string(),
    importId: v.id("connectionImports"),
    firstName: v.string(),
    lastName: v.string(),
    profileUrl: v.string(),
    email: v.string(),
    company: v.string(),
    normalizedCompany: v.string(),
    position: v.string(),
    connectedOn: v.string(),
  })
    .index("by_import", ["importId"])
    .index("by_owner", ["ownerId"]),
});
