# Production Role-Summary Batches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh every non-manual production role summary in verified batches of at most 20 jobs.

**Architecture:** Add an optional `batchSize` input to the existing admin-only Gemini refresh mutation. The mutation will preserve manual summaries, avoid rows already in progress, and queue only the first 20 eligible jobs. A production loop will wait for each batch to finish, verify that none failed, then start the next batch.

**Tech Stack:** Convex mutations and scheduler, TypeScript, Vitest, Gemini role-summary action.

**Spec:** User request in this conversation: refresh the 269 production listings without manual summaries in successful batches of 20, stopping and reporting any failure.

## Global Constraints

- Never update a `jobRoleSummaries` record whose `origin` is `manual`.
- Run only against the production Convex deployment.
- Queue no more than 20 summaries per batch.
- Stop before the next batch if any queued record fails.
- Deploy the existing backend changes only with the user's explicit approval, which was given in this conversation.

---

### Task 1: Add the capped batch input

**Files:**
- Modify: `convex/roleSummaries.ts:246-268`
- Test: `convex/roleSummaryRefresh.test.ts`

**Interfaces:**
- Consumes: `planRoleSummaryRefresh`, which returns eligible job IDs and counts for skipped manual and in-progress summaries.
- Produces: `roleSummaries.adminQueueGeminiRefresh({ batchSize?: number })`, returning the exact count queued in the current batch.

- [ ] **Step 1: Write the failing cap test**

```ts
expect(takeRoleSummaryRefreshBatch(['one', 'two', 'three'], 20)).toEqual(['one', 'two', 'three'])
expect(takeRoleSummaryRefreshBatch(Array.from({ length: 21 }, (_, index) => String(index)), 20)).toHaveLength(20)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run convex/roleSummaryRefresh.test.ts`

Expected: FAIL because `takeRoleSummaryRefreshBatch` does not exist.

- [ ] **Step 3: Implement the cap and consume it in the mutation**

```ts
export function takeRoleSummaryRefreshBatch(jobIds: readonly string[], batchSize = 20) {
  return jobIds.slice(0, Math.min(Math.max(batchSize, 1), 20))
}

const jobIds = takeRoleSummaryRefreshBatch(plan.jobIds, args.batchSize)
```

- [ ] **Step 4: Run the focused test and TypeScript build**

Run: `npx vitest run convex/roleSummaryRefresh.test.ts` and `npm run build`

Expected: both commands pass.

### Task 2: Deploy and refresh production in verified batches

**Files:**
- Modify: deployed Convex backend generated from `convex/roleSummaries.ts`

**Interfaces:**
- Consumes: the deployed `adminQueueGeminiRefresh({ batchSize: 20 })` admin mutation.
- Produces: refreshed Gemini summaries for every eligible active job while preserving the 10 manual summaries.

- [ ] **Step 1: Deploy the approved backend changes to production**

Run: `npx convex deploy --prod`

Expected: deployment completes without errors.

- [ ] **Step 2: Queue one batch of 20 roles**

Run the admin mutation with `{ "batchSize": 20 }` against production.

Expected: it reports `queued: 20` and preserves manual rows.

- [ ] **Step 3: Verify that batch completes without failures**

Inspect production `jobRoleSummaries` until all queued or generating rows complete. Count records with `status: "failed"` created during the batch.

Expected: zero failures and 20 ready summaries with `origin: "gemini"`.

- [ ] **Step 4: Repeat the queue-and-verify cycle**

Repeat Steps 2 and 3 until the mutation returns `queued: 0`.

Expected: 14 batches total: thirteen batches of 20 and one batch of 9.

- [ ] **Step 5: Report final production counts**

Verify 279 active roles, 10 manual summaries preserved, 269 Gemini summaries refreshed, and no failed records.
