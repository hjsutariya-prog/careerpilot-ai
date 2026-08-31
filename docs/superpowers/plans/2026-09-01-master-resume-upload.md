# Master Resume Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional, private Master Resume upload that is stored separately from the selected tailoring resume without changing tailoring behavior.

**Architecture:** Reuse the current browser extraction and Convex storage upload flow. Add optional purpose and active-master fields to resume records, make the backend enforce one active master per owner, and keep every existing "current resume" lookup limited to template resumes.

**Tech Stack:** React, TypeScript, Convex, Vitest, PDF.js, Mammoth.

**Spec:** User request in this conversation: first usable Master Resume upload feature.

## Global Constraints

- Use `npm.cmd` for every npm command.
- Do not pass Master Resume text to Gemini or change Gemini prompts, validators, reorder/merge logic, DOCX output, or credits.
- A user may have zero or one active Master Resume; old records with no purpose remain normal template resumes.
- Keep uploaded files private and scope all reads, replacement, and removal to the signed-in owner.

---

### Task 1: Add backward-compatible resume purpose helpers and tests

**Files:**
- Create: `convex/resumeRecords.ts`
- Create: `convex/resumeRecords.test.ts`

**Interfaces:**
- Produces `ResumePurpose`, `isMasterResume`, `isTemplateResume`, `selectActiveMaster`, and `selectLatestTemplateResume`.

- [ ] **Step 1: Write failing tests**

```ts
expect(selectLatestTemplateResume([master, legacyTemplate])).toBe(legacyTemplate)
expect(selectActiveMaster([inactiveMaster, activeMaster])).toBe(activeMaster)
expect(isTemplateResume({ purpose: undefined })).toBe(true)
```

- [ ] **Step 2: Implement pure selection helpers**

```ts
export type ResumePurpose = 'template' | 'master'
export const isMasterResume = (resume: { purpose?: ResumePurpose }) => resume.purpose === 'master'
export const isTemplateResume = (resume: { purpose?: ResumePurpose }) => !isMasterResume(resume)
```

- [ ] **Step 3: Run `npm.cmd test -- convex/resumeRecords.test.ts`**

### Task 2: Persist and enforce one active Master Resume

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/resumes.ts`
- Test: `convex/resumeRecords.test.ts`

**Interfaces:**
- `resumes.save({ ..., purpose?: 'template' | 'master' })`
- `resumes.activeMaster()` returns only the requesting owner’s active master.
- `resumes.removeActiveMaster()` removes only that owner’s active master.

- [ ] **Step 1: Extend the schema with optional `purpose` and `isActiveMaster` fields plus an owner-purpose-active index**
- [ ] **Step 2: Make `save` deactivate any active Master Resume for the owner before inserting the new active Master Resume**
- [ ] **Step 3: Keep missing `purpose` records as templates, and keep `mine` and `removeMine` limited to templates**
- [ ] **Step 4: Add owner-scoped active-master lookup and removal; never remove normal resumes while replacing/removing a master**
- [ ] **Step 5: Schedule profile extraction for a master but trigger initial search only for templates**

### Task 3: Prevent Master Resume selection by existing product flows

**Files:**
- Modify: `convex/resumeProfiles.ts`
- Modify: `convex/resumeMatching.ts`
- Modify: `convex/searches.ts`
- Modify: `convex/tailoredResumes.ts`

**Interfaces:**
- All existing "latest/current resume" paths select `isTemplateResume(resume)`.

- [ ] **Step 1: Replace latest-resume reads with owner-scoped collection followed by `selectLatestTemplateResume`**
- [ ] **Step 2: Keep Master Resume profile generation independent but do not consume it in matching or tailoring**
- [ ] **Step 3: Run focused existing matching/profile/tailoring tests**

### Task 4: Add optional Master Resume controls to the existing upload screen

**Files:**
- Modify: `src/ResumeUpload.tsx`

**Interfaces:**
- Existing `readableText` and file checks are shared for `template` and `master` uploads.

- [ ] **Step 1: Generalize the existing file upload handler to accept a resume purpose**
- [ ] **Step 2: Add the optional Master Resume card, explanatory copy, filename/date, replace control, and remove control**
- [ ] **Step 3: Keep the normal resume card and continuation button independent from master upload state**

### Task 5: Verify safety and backward compatibility

**Files:**
- Test: `convex/resumeRecords.test.ts`
- Test: existing matching/profile/tailoring tests

- [ ] **Step 1: Test first Master Resume activation, supersession, no-master state, legacy template selection, and owner-scoped selection**
- [ ] **Step 2: Test normal templates remain selected after a Master Resume exists**
- [ ] **Step 3: Run `npm.cmd test -- convex/resumeRecords.test.ts convex/resumeProfiles.test.ts convex/resumeMatching.test.ts convex/tailoredResumes.test.ts`**
- [ ] **Step 4: Run `npm.cmd run build`**
