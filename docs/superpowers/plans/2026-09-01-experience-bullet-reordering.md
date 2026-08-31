# Experience Bullet Reordering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Safely reorder all existing bullets inside one work-experience entry, without changing their text or job chronology.

**Architecture:** Gemini may return an optional `reorders` array alongside text edits. A dedicated validator will accept only full, changed permutations of the known bullet IDs for one experience. The frontend will apply accepted text replacements first, then move the original DOCX paragraph XML nodes into the validated order.

**Tech Stack:** TypeScript, Convex, React/Vite, JSZip, Vitest.

**Spec:** User request in this conversation: “Implement only safe bullet reordering within a single experience entry.”

## Global Constraints

- Use `npm.cmd` for every npm command.
- Never add, remove, merge, synthesize, or move bullets between jobs.
- Do not reorder work-experience entries or company, title, or date headers.
- Keep all existing text safety validation and the eight-edit cap unchanged.
- Do not run live Gemini evaluation.

---

### Task 1: Add an optional reorder response field

**Files:**
- Modify: `convex/ai/tailoringSchema.ts`
- Test: `convex/ai/tailoringSchema.test.ts`

**Interfaces:**
- Produces: `TailoringReorder { experienceId: string; blockIds: string[] }` and `TailoringResponse.reorders?`.

- [ ] **Step 1: Add parser tests**

```ts
expect(parseTailoringResponse('{"analysis":{"matched":[],"understated":[],"missing":[]},"edits":[],"reorders":[{"experienceId":"experience_0","blockIds":["paragraph_3","paragraph_2"]}]}')?.reorders).toEqual([
  { experienceId: 'experience_0', blockIds: ['paragraph_3', 'paragraph_2'] },
])
```

- [ ] **Step 2: Add the optional schema property and parser**

Reject malformed reorder objects, but keep edits-only and legacy responses valid with no reorder plan.

### Task 2: Validate pure in-experience permutations

**Files:**
- Create: `convex/ai/tailoringReorderValidation.ts`
- Create: `convex/ai/tailoringReorderValidation.test.ts`

**Interfaces:**
- Consumes: `TailoringReorder[]` and `ResumeBlock[]`.
- Produces: accepted reorders plus explicit rejection reasons.

- [ ] **Step 1: Write validator tests for valid and invalid permutations**

```ts
expect(validateTailoringReorders({
  reorders: [{ experienceId: 'experience_0', blockIds: ['paragraph_3', 'paragraph_2'] }],
  resumeBlocks,
}).acceptedReorders).toEqual([{ experienceId: 'experience_0', blockIds: ['paragraph_3', 'paragraph_2'] }])
```

- [ ] **Step 2: Implement strict group membership checks**

Require one reorder per experience, exactly every known bullet once, a changed order, and no headers or foreign bullets.

- [ ] **Step 3: Run validator tests**

Run: `npm.cmd test -- convex/ai/tailoringReorderValidation.test.ts`

### Task 3: Orchestrate reorders without changing text-edit validation

**Files:**
- Modify: `convex/tailoredResumes.ts`
- Modify: `convex/ai/tailoringPrompt.ts`
- Test: `convex/tailoredResumes.test.ts`
- Test: `convex/ai/tailoringPrompt.test.ts`

**Interfaces:**
- Produces: successful AI tailoring results with identity replacements and accepted reorders when no text edit is needed.

- [ ] **Step 1: Keep text edits first**

Call existing `validateTailoringResponse` unchanged, then validate reorder membership independently against original blocks.

- [ ] **Step 2: Explain valid reorder output to Gemini**

Allow reordering only when it materially improves JD relevance, and require an exact block-ID permutation for one experience.

- [ ] **Step 3: Test text edit and reorder coexistence**

Verify an accepted text edit remains independently safe when the same block participates in an accepted reorder.

### Task 4: Move original DOCX paragraphs after safe text replacement

**Files:**
- Modify: `src/docxTemplate.ts`
- Modify: `src/ResultsScreen.tsx`
- Test: `src/docxTemplate.test.ts`

**Interfaces:**
- Consumes: identity-or-edited replacement strings and validated reorder plans.
- Produces: same DOCX with original bullet paragraph XML moved only inside its own entry.

- [ ] **Step 1: Add a DOCX paragraph-order test**

```ts
expect(applyReplacementsToDocumentXml(xml, slots, replacements, [
  { experienceId: 'experience_0', blockIds: ['paragraph_3', 'paragraph_2'] },
])).toMatch(/second bullet[\s\S]*first bullet/)
```

- [ ] **Step 2: Implement paragraph-node movement**

Patch text as today, then replace each target bullet paragraph with the complete original paragraph node selected by its validated ID. This retains numbering, indentation, styles, and runs.

- [ ] **Step 3: Run focused tests and build**

Run: `npm.cmd test -- convex/ai/tailoringSchema.test.ts convex/ai/tailoringReorderValidation.test.ts convex/tailoredResumes.test.ts src/docxTemplate.test.ts`

Run: `npm.cmd run build`
