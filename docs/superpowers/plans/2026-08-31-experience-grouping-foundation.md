# Experience Grouping Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic, conservative work-experience grouping metadata to resume blocks without changing tailoring or DOCX output.

**Architecture:** The DOCX paragraph extractor will classify only clear experience headers and bullet paragraphs. `createResumeBlocks` will retain its existing `paragraph_<index>` IDs while attaching optional `kind`, `experienceId`, and `bulletIndex` metadata. The backend will accept and validate this metadata but will not use it to alter Gemini requests, edits, or document patching.

**Tech Stack:** TypeScript, React/Vite, Convex actions, Vitest.

**Spec:** User request in this conversation: “Implement only the experience-grouping foundation for resume tailoring.”

## Global Constraints

- Use `npm.cmd` for every npm command.
- Do not reorder, add, remove, merge, or synthesize bullets.
- Do not change Gemini prompt, response schema, request behavior, credits, or DOCX patching behavior.
- Keep existing `paragraph_<index>` block IDs stable.
- Leave uncertain paragraphs ungrouped.

---

### Task 1: Define and validate structural resume-block metadata

**Files:**
- Modify: `convex/ai/resumeBlocks.ts`
- Test: `convex/ai/resumeBlocks.test.ts`

**Interfaces:**
- Produces: `ResumeBlockKind`, enriched `ResumeBlock`, and `areResumeBlocksConsistent(blocks)` validation.

- [ ] **Step 1: Add failing integrity tests**

```ts
expect(areResumeBlocksConsistent([
  { blockId: 'paragraph_2', index: 2, text: 'Prioritized backlog', editable: true, kind: 'experience_bullet', experienceId: 'experience_0', bulletIndex: 0 },
  { blockId: 'paragraph_3', index: 3, text: 'Planned sprints', editable: true, kind: 'experience_bullet', experienceId: 'experience_0', bulletIndex: 0 },
])).toBe(false)
```

- [ ] **Step 2: Implement the optional metadata contract**

```ts
export type ResumeBlockKind = 'heading' | 'experience_header' | 'experience_bullet' | 'skills' | 'summary' | 'other'

export type ResumeBlock = {
  blockId: string
  index: number
  text: string
  editable: boolean
  kind?: ResumeBlockKind
  experienceId?: string
  bulletIndex?: number
}
```

- [ ] **Step 3: Validate group and bullet-index consistency**

Require `experience_<non-negative integer>` IDs only on editable `experience_bullet` blocks; require each group’s bullet indexes to be unique and increase in document order; require headers to be locked and carry no experience membership.

- [ ] **Step 4: Run focused tests**

Run: `npm.cmd test -- convex/ai/resumeBlocks.test.ts`

### Task 2: Conservatively identify experience headers and bullets in DOCX paragraphs

**Files:**
- Modify: `src/docxTemplate.ts`
- Test: `src/docxTemplate.test.ts`

**Interfaces:**
- Consumes: parsed DOCX paragraph slots.
- Produces: `ResumeBlock[]` with optional experience metadata through `createResumeBlocksFromDocxSlots`.

- [ ] **Step 1: Add a synthetic work-history test**

```ts
expect(createResumeBlocksFromDocxSlots(slots).filter((block) => block.kind === 'experience_bullet')).toMatchObject([
  { experienceId: 'experience_0', bulletIndex: 0 },
  { experienceId: 'experience_0', bulletIndex: 1 },
  { experienceId: 'experience_0', bulletIndex: 2 },
  { experienceId: 'experience_1', bulletIndex: 0 },
  { experienceId: 'experience_1', bulletIndex: 1 },
])
```

- [ ] **Step 2: Implement conservative classification**

Use paragraph structure and text patterns to recognize explicit `EXPERIENCE` headings, plausible role/company/date headers, and bullet paragraphs. Only attach membership after a confident header followed by a bullet; leave ordinary paragraphs as `other`.

- [ ] **Step 3: Preserve immutable headers**

Mark confidently identified role/company/date paragraphs as `experience_header` and force `editable: false` in the derived block metadata.

- [ ] **Step 4: Run focused DOCX tests**

Run: `npm.cmd test -- src/docxTemplate.test.ts convex/ai/resumeBlocks.test.ts`

### Task 3: Carry metadata to Convex without changing tailoring behavior

**Files:**
- Modify: `convex/tailoredResumes.ts`
- Test: `convex/tailoredResumes.test.ts`

**Interfaces:**
- Consumes: optional enriched `templateSlots` action argument.
- Produces: unchanged Gemini prompt and replacement-index flow.

- [ ] **Step 1: Extend the Convex argument validator**

Accept optional `kind`, `experienceId`, and `bulletIndex` fields so frontend-generated blocks pass unchanged to the backend.

- [ ] **Step 2: Keep Gemini input stable**

Project `ResumeBlock` data to the pre-existing `blockId`, `index`, `text`, and `editable` fields before it reaches the prompt builder. This preserves current model-facing behavior.

- [ ] **Step 3: Add a no-behavior-change test**

Confirm a valid enriched block list still produces the same replacement array as the legacy block list.

- [ ] **Step 4: Run the relevant tests and full build**

Run: `npm.cmd test -- convex/ai/resumeBlocks.test.ts src/docxTemplate.test.ts convex/tailoredResumes.test.ts`

Run: `npm.cmd run build`
