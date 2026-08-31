# Master Resume Experience Parsing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parse an active Master Resume into stable, private experience groups and source blocks for future provenance matching.

**Architecture:** Reuse the current text extraction and profile background job, then derive a conservative experience structure directly from the Master Resume’s original extracted lines. Store it in a versioned Convex cache tied to the active Master Resume and hash; no Master content is passed to tailoring or mapped to template experiences.

**Tech Stack:** TypeScript, Convex, Vitest.

**Spec:** User request in this conversation: Master Resume experience parsing with stable provenance.

## Global Constraints

- Use `npm.cmd` for every npm command.
- Do not create a generic MasterEvidence taxonomy/database, call Gemini again, change tailoring, DOCX rendering, credits, or template parsing behavior.
- Master and template experience IDs are separate namespaces; matching is explicitly out of scope.
- Preserve source text exactly and leave uncertain paragraphs ungrouped.

---

### Task 1: Implement deterministic Master Resume parsing helpers

**Files:**
- Create: `convex/masterResumeStructure.ts`
- Create: `convex/masterResumeStructure.test.ts`

**Interfaces:**
- Produces `MasterExperienceBlock`, `MasterExperience`, `MasterResumeStructure`, and `parseMasterResumeStructure({ resumeId, text })`.

- [ ] **Step 1: Write failing tests for two experiences and ungrouped content**

```ts
expect(parseMasterResumeStructure(input).experiences[0]).toMatchObject({ experienceId: 'master_experience_0' })
expect(result.experiences[0].blocks.map((block) => block.blockId)).toEqual(['master_experience_0_block_0'])
expect(result.ungroupedBlocks).toContainEqual({ blockId: 'master_ungrouped_block_0', text: 'CERTIFICATIONS', kind: 'other' })
```

- [ ] **Step 2: Port only the existing conservative heading, date-header, and bullet detection rules; parse pipe-delimited header fields only when confident**
- [ ] **Step 3: Preserve the raw extracted line as each block’s `text`, allocate IDs by source order, and never assign ambiguous text to an experience**
- [ ] **Step 4: Run `npm.cmd test -- convex/masterResumeStructure.test.ts`**

### Task 2: Add private structure cache and owner-scoped APIs

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/masterResumeStructure.ts`

**Interfaces:**
- Adds `masterResumeStructures` with owner, source resume ID, source hash, schema version, and `structure`.
- Adds `masterResumeStructure.ensureForMaster({ resumeId })` and `masterResumeStructure.activeMine()`.

- [ ] **Step 1: Add schema validators for headers, blocks, experiences, and ungrouped blocks**
- [ ] **Step 2: Cache by owner/hash/version and rebind a reusable structure only to an active Master Resume**
- [ ] **Step 3: Use `requireOwner` and the active-master record for read access; inactive and other-owner Master Resumes return no structure**

### Task 3: Reuse the existing profile lifecycle as the background trigger

**Files:**
- Modify: `convex/resumeProfiles.ts`

**Interfaces:**
- `resumeProfiles.ensureForResume` schedules `internal.masterResumeStructure.ensureForMaster` only for the active Master Resume, after either profile reuse or generation.

- [ ] **Step 1: Preserve the existing profile behavior for normal templates**
- [ ] **Step 2: Schedule deterministic Master parsing only for `purpose === 'master' && isActiveMaster === true`**
- [ ] **Step 3: Keep all tailoring inputs and template grouping code unchanged**

### Task 4: Verify provenance, cache selection, and no-tailoring behavior

**Files:**
- Test: `convex/masterResumeStructure.test.ts`
- Test: `convex/resumeProfiles.test.ts`
- Test: `convex/tailoredResumes.test.ts`

- [ ] **Step 1: Test deterministic IDs, exact text preservation, experience boundaries, metadata extraction, inactive selection exclusion, and owner isolation**
- [ ] **Step 2: Run `npm.cmd exec convex -- codegen`**
- [ ] **Step 3: Run `npm.cmd test -- convex/masterResumeStructure.test.ts convex/resumeProfiles.test.ts convex/resumeRecords.test.ts convex/tailoredResumes.test.ts`**
- [ ] **Step 4: Run `npm.cmd run build`**
