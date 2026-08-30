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
  jobs: defineTable({
    sourceToken: v.string(),
    externalJobId: v.string(),
    title: v.string(),
    companyName: v.string(),
    normalizedCompany: v.string(),
    locationLabel: v.string(),
    cities: v.array(v.string()),
    description: v.string(),
    descriptionHtml: v.optional(v.string()),
    skills: v.array(v.string()),
    applyUrl: v.string(),
    lastUpdatedAt: v.number(),
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
    isActive: v.boolean(),
    closedAt: v.optional(v.number()),
  })
    .index("by_source_external", ["sourceToken", "externalJobId"])
    .index("by_active_updated", ["isActive", "lastUpdatedAt"]),
  jobSnapshots: defineTable({
    jobId: v.id("jobs"),
    snapshotDate: v.string(),
    isActive: v.boolean(),
    observedAt: v.number(),
  }).index("by_job_date", ["jobId", "snapshotDate"]),
  jobRoleSummaries: defineTable({
    jobId: v.id("jobs"),
    jobLastUpdatedAt: v.number(),
    status: v.union(v.literal("queued"), v.literal("generating"), v.literal("ready"), v.literal("failed")),
    summary: v.optional(v.string()),
    responsibilities: v.optional(v.array(v.string())),
    skills: v.optional(v.array(v.string())),
    suitableFor: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    generatedAt: v.optional(v.number()),
    failureMessage: v.optional(v.string()),
  }).index("by_job", ["jobId"]),
  sourceRuns: defineTable({
    sourceToken: v.string(),
    status: v.union(v.literal("running"), v.literal("success"), v.literal("failed")),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    recordsFetched: v.optional(v.number()),
    activeRetained: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    error: v.optional(v.string()),
  }).index("by_source_started", ["sourceToken", "startedAt"]),
  searchRuns: defineTable({
    ownerId: v.string(),
    kind: v.union(v.literal("first"), v.literal("daily")),
    status: v.union(v.literal("queued"), v.literal("fetching"), v.literal("matching"), v.literal("complete"), v.literal("failed")),
    requestedAt: v.number(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    resultCount: v.optional(v.number()),
    sourceWarning: v.optional(v.string()),
    error: v.optional(v.string()),
  }).index("by_owner_requested", ["ownerId", "requestedAt"]),
  jobSuggestions: defineTable({
    ownerId: v.string(),
    searchRunId: v.id("searchRuns"),
    jobId: v.id("jobs"),
    rank: v.number(),
    matchScore: v.number(),
    matchExplanation: v.string(),
    isRelatedMatch: v.boolean(),
  })
    .index("by_search_rank", ["searchRunId", "rank"])
    .index("by_search_job", ["searchRunId", "jobId"]),
  searchSchedules: defineTable({
    ownerId: v.string(),
    dailyTime: v.string(),
    nextRunAt: v.number(),
    lastRunIstDate: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_next_run", ["nextRunAt"]),
});
