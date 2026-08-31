# Material Content Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow useful same-length experience edits while rejecting deterministic removal of material responsibilities, scope, and domain evidence.

**Architecture:** Keep the existing validator and all factual protections. Replace the experience-only strict-shorter check with 110% character and word ceilings, then add a deterministic extractor for responsibility-list items, capitalized domain terms, named organizational concepts, and explicit scope phrases. A replacement must retain each extracted concept exactly or through one of three controlled responsibility equivalences.

**Tech Stack:** TypeScript, Convex, Vitest.

**Spec:** User request in this conversation, 2026-08-31.

## Global Constraints

- Do not alter Gemini, credits, DOCX rendering, block IDs, the eight-edit cap, or existing number, acronym, leadership, and named-technology protections.
- Skills-line reordering remains exact and unchanged.
- Use `npm.cmd` for all npm commands.

---

### Task 1: Add bounded experience length and material concept extraction

**Files:**
- Modify: `convex/ai/tailoringValidation.ts:111-143`
- Test: `convex/ai/tailoringValidation.test.ts`

**Interfaces:**
- Produces `isSafeExperienceRewrite(source, replacement): boolean` with a 110% character and word limit.
- Produces rejection reason `material_content_removed` when a protected source concept is absent.

- [ ] **Step 1: Write failing tests**

```ts
expect(isSafeExperienceRewrite(productOwnerOriginal, destructiveReplacement)).toBe(false)
expect(isSafeExperienceRewrite('Owned backlog prioritization.', 'Prioritized backlog.')).toBe(true)
```

- [ ] **Step 2: Implement deterministic extractors**

Extract comma-separated responsibility list items after ownership/action verbs, capitalized domain and stakeholder terms, named `X of Y` organizational concepts, explicit numeric role scope, location-team scope, and quantified platform scope. Match only exact normalized phrases plus the three specified responsibility equivalences.

- [ ] **Step 3: Apply the bounded length check**

```ts
replacement.length <= Math.ceil(source.length * 1.1)
wordCount(replacement) <= Math.ceil(wordCount(source) * 1.1)
```

- [ ] **Step 4: Run focused tests**

Run: `npm.cmd test -- convex/ai/tailoringValidation.test.ts`

### Task 2: Preserve validator diagnostics and verify the application

**Files:**
- Modify: `convex/ai/tailoringValidation.ts`
- Test: `convex/tailoredResumes.test.ts`

**Interfaces:**
- Existing `validateTailoringResponse` emits `material_content_removed` through its current rejected-edit result.

- [ ] **Step 1: Verify existing safety tests**

Run: `npm.cmd test -- convex/ai/tailoringValidation.test.ts convex/tailoredResumes.test.ts`

- [ ] **Step 2: Verify full build**

Run: `npm.cmd run build`
