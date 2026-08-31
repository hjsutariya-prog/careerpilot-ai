# Evidence-Backed Bullet Merging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permit one validated merged bullet to replace exactly two overlapping bullets inside a single work-experience entry.

**Architecture:** Gemini will return optional merge plans. A merge validator will use only the two source paragraphs as evidence and enforce material-content, number, acronym, technology, leadership, and bounded-compression checks. The orchestration flow will validate text edits, then merges, derive the surviving bullet set, validate reorders against that set, and apply the accepted operations in Word XML.

**Tech Stack:** TypeScript, Convex, React/Vite, JSZip, Vitest.

**Spec:** User request in this conversation: “Implement only evidence-backed bullet merging within a single experience.”

## Global Constraints

- Use `npm.cmd` for every npm command.
- Never create an arbitrary new bullet, remove an unrelated bullet, move content across jobs, or reorder job entries.
- Preserve existing text validation and credit handling.
- Do not run live Gemini evaluation.

---

### Task 1: Add optional merge data to the structured response

**Files:**
- Modify: `convex/ai/tailoringSchema.ts`
- Test: `convex/ai/tailoringSchema.test.ts`

**Interfaces:**
- Produces: `TailoringMerge { experienceId; sourceBlockIds: [string, string]; targetBlockId; text }`.

- [ ] **Step 1: Test canonical merge parsing**

```ts
expect(parseTailoringResponse(raw)?.merges).toEqual([
  { experienceId: 'experience_0', sourceBlockIds: ['paragraph_2', 'paragraph_3'], targetBlockId: 'paragraph_2', text: 'Merged text' },
])
```

- [ ] **Step 2: Add optional JSON schema and runtime shape validation**

Require exactly two string source IDs; preserve old responses without `merges`.

### Task 2: Validate evidence-backed two-bullet merges

**Files:**
- Create: `convex/ai/tailoringMergeValidation.ts`
- Create: `convex/ai/tailoringMergeValidation.test.ts`

**Interfaces:**
- Consumes: merge plans, original resume blocks, and accepted ordinary-edit IDs.
- Produces: accepted merges plus precise rejection reasons.

- [ ] **Step 1: Test a valid project-delivery merge**

```ts
expect(validateTailoringMerges({ merges: [merge], resumeBlocks }).acceptedMerges).toEqual([merge])
```

- [ ] **Step 2: Implement source-only evidence checks**

Use only the two source texts. Require same-experience editable bullets, target membership, non-duplicate sources, responsibility relatedness, combined-material preservation, no unsupported named technology, no changed numbers or acronyms, no leadership upgrade, and bounded combined length.

- [ ] **Step 3: Run focused merge tests**

Run: `npm.cmd test -- convex/ai/tailoringMergeValidation.test.ts`

### Task 3: Validate operation order and post-merge reorders

**Files:**
- Modify: `convex/tailoredResumes.ts`
- Modify: `convex/ai/tailoringPrompt.ts`
- Test: `convex/tailoredResumes.test.ts`
- Test: `convex/ai/tailoringPrompt.test.ts`

**Interfaces:**
- Produces: results with accepted `merges` and reorders that reference only surviving bullets.

- [ ] **Step 1: Validate ordinary text edits before merges**

Reject a merge with `merge_conflict` when either source already has an accepted normal text edit.

- [ ] **Step 2: Derive surviving bullets before reorder validation**

Remove only the non-target source from a cloned block list, then run the existing reorder validator on that post-merge set.

- [ ] **Step 3: Add prompt rules**

Make merging the lowest-priority structural option and require exact source IDs, source-only evidence, and no lost material facts.

### Task 4: Replace one paragraph and remove the other in the DOCX

**Files:**
- Modify: `src/docxTemplate.ts`
- Modify: `src/ResultsScreen.tsx`
- Test: `src/docxTemplate.test.ts`

**Interfaces:**
- Consumes: accepted replacements, merges, and post-merge reorder plans.
- Produces: target paragraph with merged text, other source paragraph deleted, then surviving paragraphs reordered.

- [ ] **Step 1: Test target formatting and source-node removal**

```ts
expect(xmlAfterMerge).toContain('<w:rPr><w:b/></w:rPr><w:t>Merged text</w:t>')
expect(xmlAfterMerge).not.toContain('Second source bullet')
```

- [ ] **Step 2: Patch DOCX in operation order**

Apply normal replacements, override target content with validated merge text, remove only the non-target paragraph node, then move surviving original paragraph nodes for accepted reorders.

- [ ] **Step 3: Run focused tests and production build**

Run: `npm.cmd test -- convex/ai/tailoringMergeValidation.test.ts convex/ai/tailoringReorderValidation.test.ts convex/tailoredResumes.test.ts src/docxTemplate.test.ts`

Run: `npm.cmd run build`
