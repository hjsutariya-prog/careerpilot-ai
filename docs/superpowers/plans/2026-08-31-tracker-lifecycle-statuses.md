# Tracker Lifecycle Statuses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in job seeker move an applied job through Resume shortlisted and Interview from their private Tracker.

**Architecture:** Extend the existing `jobActions.status` value rather than adding a second tracking table. The Tracker query already returns each job action, so the frontend will group and render the two new statuses, and the existing save mutation will persist transitions between all statuses.

**Tech Stack:** React 19, TypeScript, Vite, Convex, Vitest.

**Spec:** `C:\Users\Harshal Sutariya\buildweek\docs\careerpilot-ai\v1-build-plan.md`

## Global Constraints

- Job actions remain private to the signed-in account owner.
- Preserve Apply, On Hold, and Reject actions and their existing Tracker behaviour.
- Use native buttons and the project’s existing Tracker styles for an accessible, responsive control.
- Do not change live job-source data or scheduled searches.

---

### Task 1: Extend Tracker status helpers

**Files:**
- Modify: `src/trackerJobs.ts`
- Modify: `src/trackerJobs.test.ts`

**Interfaces:**
- Consumes: `StoredJobAction.status: JobActionStatus`
- Produces: `JobActionStatus` containing `Apply | Reject | On Hold | Resume shortlisted | Interview` and groups for each Tracker section.

- [ ] **Step 1: Write the failing grouping test**

Add actions with statuses `Resume shortlisted` and `Interview`, then assert that each matching job appears in its matching group.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- src/trackerJobs.test.ts`

Expected: FAIL because the two statuses and groups do not yet exist.

- [ ] **Step 3: Extend the status union and groups**

Add both lifecycle values to `JobActionStatus`, define `shortlisted` and `interview` arrays in `TrackedJobGroups`, and place actions with the matching status into them.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npm test -- src/trackerJobs.test.ts`

Expected: PASS.

### Task 2: Persist lifecycle statuses privately

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/jobActions.ts`

**Interfaces:**
- Consumes: `save({ jobId: string, status: JobActionStatus })` from Tracker.
- Produces: a `jobActions` record whose `status` can be either new lifecycle status while retaining owner-based access checks.

- [ ] **Step 1: Extend both Convex status validators**

Add `v.literal('Resume shortlisted')` and `v.literal('Interview')` to `jobActions.status` in the schema and `statusValidator` in the save mutation.

- [ ] **Step 2: Regenerate Convex types**

Run: `npx convex dev --once`

Expected: generated API and schema types accept both statuses.

### Task 3: Render and transition lifecycle sections

**Files:**
- Modify: `src/TrackerScreen.tsx`

**Interfaces:**
- Consumes: `trackedJobsMine` records and all five `JobActionStatus` values.
- Produces: separate Resume shortlisted and Interview Tracker sections and valid transition buttons on each job row.

- [ ] **Step 1: Update frontend status types and transitions**

Allow both lifecycle strings in `JobActionStatus`. Replace the three-case alternate-action logic with an explicit transition map: Applied can move to Resume shortlisted, Interview, On Hold, or Reject; Shortlisted can move to Interview, On Hold, or Reject; Interview can move to On Hold or Reject; On Hold and Rejected can move back to Apply.

- [ ] **Step 2: Add lifecycle groups and sections**

Filter the queried actions into `shortlisted` and `interview`, then render `Resume shortlisted` and `Interview` sections between Applied and On Hold. Keep the existing empty state and error handling.

- [ ] **Step 3: Run validation**

Run: `npm test && npm run lint && npm run build`

Expected: all tests, linting, and the production build pass.

- [ ] **Step 4: Review the interface manually**

Run: `npm run dev`

Expected: an applied role can be promoted to either new state; each new section counts and displays it; existing actions still work; controls have visible keyboard focus and are disabled while saving.

