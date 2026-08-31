# Master Resume-Aware Tailoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a template experience use factual evidence only from its deterministically matched Master Resume experience, with block-level proof for every Master-backed edit or merge.

**Architecture:** Resolve existing Template-to-Master matches in the tailoring action, then pass only the matched Master blocks beside each template experience in the existing prompt. Extend Gemini’s response with optional Master block provenance and add a dedicated provenance validator before existing factual validation; no Master data reaches unrelated experiences.

**Tech Stack:** TypeScript, Convex, Gemini structured output, Vitest, existing resume block/matching/validation modules.

**Spec:** User request in this conversation: “Implement Master Resume-aware Gemini tailoring using matched experience evidence.”

## Global Constraints

- Use `npm.cmd` for every npm command.
- Do not add new bullets, remove bullets, move bullets between experiences, or reorder experience entries.
- Do not change DOCX mechanics, credits, Gemini call count, or existing factual protections.
- The JD is relevance-only; Template plus the one matched Master experience are the only candidate evidence.
- No Master match means exact existing Template-only behavior.

---

### Task 1: Add typed Master evidence context and response provenance

**Files:**
- Modify: `convex/ai/tailoringSchema.ts`
- Modify: `convex/ai/tailoringPrompt.ts`
- Modify: `convex/ai/tailoringSchema.test.ts`
- Modify: `convex/ai/tailoringPrompt.test.ts`

**Interfaces:**
- Consumes: matched `MasterExperience` blocks keyed by Template experience ID.
- Produces: `sourceMasterBlockIds?: string[]` on edits and merges plus prompt context for each template experience.

- [ ] **Step 1: Write failing response and prompt tests**

```ts
expect(parsed.response.edits[0]).toMatchObject({
  blockId: 'paragraph_4',
  sourceMasterBlockIds: ['master_experience_0_block_0'],
})
expect(prompt).toContain('MATCHED MASTER EXPERIENCE')
```

- [ ] **Step 2: Run focused tests to verify failure**

Run: `npm.cmd test -- convex/ai/tailoringSchema.test.ts convex/ai/tailoringPrompt.test.ts`
Expected: FAIL because Master provenance is not modelled.

- [ ] **Step 3: Implement optional provenance fields and per-experience Master prompt sections**

```ts
type TailoringEdit = { blockId: string; text: string; sourceMasterBlockIds?: string[] }
type TailoringMerge = { /* existing fields */ sourceMasterBlockIds?: string[] }
```

- [ ] **Step 4: Rerun focused tests**

Run: `npm.cmd test -- convex/ai/tailoringSchema.test.ts convex/ai/tailoringPrompt.test.ts`
Expected: PASS.

### Task 2: Resolve matched Master context in the tailoring action

**Files:**
- Modify: `convex/tailoredResumes.ts`
- Modify: `convex/tailoredResumes.test.ts`

**Interfaces:**
- Consumes: `templateExperiencesFromBlocks`, active owner-scoped Master structure, and deterministic matching.
- Produces: `MasterEvidenceContext` sent only to `buildTailoringUserPrompt` and validation.

- [ ] **Step 1: Write failing tests for matched, unmatched, and no-Master context**

```ts
expect(masterContextForTemplate(blocks, activeStructure).byTemplateExperience.experience_0?.masterExperienceId)
  .toBe('master_experience_0')
expect(masterContextForTemplate(blocks, null).byTemplateExperience).toEqual({})
```

- [ ] **Step 2: Run the test to verify failure**

Run: `npm.cmd test -- convex/tailoredResumes.test.ts`
Expected: FAIL because the resolver does not exist.

- [ ] **Step 3: Implement owner-scoped active Master loading and dynamic matching without modifying fallback behavior**

```ts
const context = await masterEvidenceContextForTailoring(ctx, ownerId, templateSlots)
const prompt = buildTailoringUserPrompt({ ..., masterEvidence: context })
```

- [ ] **Step 4: Rerun action tests**

Run: `npm.cmd test -- convex/tailoredResumes.test.ts`
Expected: PASS.

### Task 3: Validate Master provenance before applying existing operations

**Files:**
- Create: `convex/ai/tailoringMasterProvenance.ts`
- Create: `convex/ai/tailoringMasterProvenance.test.ts`
- Modify: `convex/ai/tailoringValidation.ts`
- Modify: `convex/ai/tailoringMergeValidation.ts`

**Interfaces:**
- Consumes: approved Template block identities, matched Master blocks, and optional `sourceMasterBlockIds`.
- Produces: accepted/rejected Master provenance with `unknown_master_source_block`, `master_source_cross_experience`, `master_source_without_match`, `master_source_wrong_template_experience`, and `master_provenance_required` reasons.

- [ ] **Step 1: Write failing provenance tests**

```ts
expect(validateMasterSources(edit, context).rejectedReason).toBe('master_source_cross_experience')
expect(validateMasterSources(masterBackedEditWithoutSources, context).rejectedReason).toBe('master_provenance_required')
```

- [ ] **Step 2: Run focused tests to verify failure**

Run: `npm.cmd test -- convex/ai/tailoringMasterProvenance.test.ts`
Expected: FAIL because the validator module does not exist.

- [ ] **Step 3: Implement conservative source checks and combined factual source validation**

```ts
const allowedMasterBlocks = context.byTemplateExperience[templateExperienceId]?.blocks ?? []
// Every new factual token beyond template source must appear in a cited allowed Master block.
```

- [ ] **Step 4: Rerun validator tests**

Run: `npm.cmd test -- convex/ai/tailoringMasterProvenance.test.ts convex/ai/tailoringValidation.test.ts convex/ai/tailoringMergeValidation.test.ts`
Expected: PASS.

### Task 4: Verify backwards compatibility and build

**Files:**
- Test: `convex/tailoredResumes.test.ts`
- Test: `convex/ai/tailoringSchema.test.ts`
- Test: `convex/ai/tailoringMasterProvenance.test.ts`

**Interfaces:**
- Consumes: Master-aware and Template-only responses.
- Produces: confirmation that operations remain edits, merges, and reorders only.

- [ ] **Step 1: Run focused tailoring, matching, and Master structure tests**

Run: `npm.cmd test -- convex/ai/tailoringSchema.test.ts convex/ai/tailoringPrompt.test.ts convex/ai/tailoringMasterProvenance.test.ts convex/ai/tailoringValidation.test.ts convex/ai/tailoringMergeValidation.test.ts convex/tailoredResumes.test.ts convex/ai/experienceMatching.test.ts convex/masterResumeStructure.test.ts`
Expected: PASS.

- [ ] **Step 2: Generate Convex types and build the production client**

Run: `npm.cmd exec convex -- codegen && npm.cmd run build`
Expected: PASS.

- [ ] **Step 3: Inspect scope before handoff**

```bash
git diff -- convex/ai/tailoringPrompt.ts convex/ai/tailoringSchema.ts convex/ai/tailoringValidation.ts convex/ai/tailoringMasterProvenance.ts convex/ai/tailoringMergeValidation.ts convex/tailoredResumes.ts src/docxTemplate.ts
```

Expected: no change to DOCX rendering; no new insertion operation; Master context only affects prompt and validation.
