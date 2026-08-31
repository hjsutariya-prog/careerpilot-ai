# Master Resume-Aware Tailoring Evaluation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add synthetic live-evaluation cases that measure Master-backed tailoring and allow one case to be run through Gemini on demand.

**Architecture:** Extend the existing evaluator’s case model with optional Master Resume structure, derive matched evidence using the production matcher, and pass that exact context to the existing prompt, parser, and validator. The live runner will accept `--case=<id>` before running its normal sequential evaluation loop.

**Tech Stack:** TypeScript, Vitest, existing tailoring eval runner, Gemini eval-only client, production matching and provenance modules.

**Spec:** User request in this conversation: “Add a targeted live evaluation case for Master Resume-aware tailoring.”

## Global Constraints

- Use `npm.cmd` for every npm command.
- Do not modify production prompts, validators, DOCX rendering, credits, or bullet insertion behavior.
- Use synthetic data only and do not run the full live suite automatically.
- Every Master-backed assertion must reuse production matching and provenance validation.

---

### Task 1: Extend eval inputs with optional Master structures

**Files:**
- Modify: `convex/ai/evals/tailoringEvalCases.ts`
- Modify: `convex/ai/evals/tailoringEval.ts`
- Modify: `convex/ai/evals/tailoringEval.test.ts`

**Interfaces:**
- Consumes: `MasterResumeStructure` and `masterEvidenceForTemplateSlots`.
- Produces: case-specific Master evidence passed to the existing production prompt and validator.

- [ ] **Step 1: Write failing deterministic Master-aware case tests**

```ts
expect(buildEvalInput(masterCase).masterEvidence.byTemplateExperience.experience_0).toBeDefined()
expect(scoreMasterCase(...).missingRequirementLeakage).toBe(false)
```

- [ ] **Step 2: Run focused tests to verify failure**

Run: `npm.cmd test -- convex/ai/evals/tailoringEval.test.ts`
Expected: FAIL because eval cases do not carry Master structures.

- [ ] **Step 3: Add the project-delivery, cross-experience, JD-only banking, metric, leadership, and no-Master cases**

```ts
type TailoringEvalCase = {
  masterResumeStructure?: MasterResumeStructure
  // existing fields remain unchanged
}
```

- [ ] **Step 4: Rerun focused evaluator tests**

Run: `npm.cmd test -- convex/ai/evals/tailoringEval.test.ts`
Expected: PASS.

### Task 2: Pass Master evidence through the isolated live runner

**Files:**
- Modify: `scripts/runTailoringEval.ts`
- Test: `scripts/runTailoringEval.test.ts` or existing runner parsing tests if present

**Interfaces:**
- Consumes: selected synthetic cases and production `masterEvidenceForTemplateSlots`.
- Produces: a one-case live request whose prompt/validation exactly follow production Master-aware behavior.

- [ ] **Step 1: Write failing CLI selection tests**

```ts
expect(parseRunOptions(['--case=master-backed-project-delivery'])).toMatchObject({ caseId: 'master-backed-project-delivery', runs: 1 })
```

- [ ] **Step 2: Run selection tests to verify failure**

Run: `npm.cmd test -- scripts/runTailoringEval.test.ts`
Expected: FAIL because `--case` is not parsed.

- [ ] **Step 3: Add exact case filtering and use case Master evidence in prompt and validation calls**

```ts
const cases = options.caseId ? allCases.filter((item) => item.id === options.caseId) : allCases
```

- [ ] **Step 4: Rerun runner tests**

Run: `npm.cmd test -- scripts/runTailoringEval.test.ts`
Expected: PASS.

### Task 3: Verify no production behavior changes

**Files:**
- Test: `convex/ai/evals/tailoringEval.test.ts`
- Test: `convex/ai/tailoringMasterProvenance.test.ts`

**Interfaces:**
- Consumes: eval-only case data and production validation helpers.
- Produces: deterministic confirmation that Master provenance failures stay rejected.

- [ ] **Step 1: Run focused eval and provenance tests**

Run: `npm.cmd test -- convex/ai/evals/tailoringEval.test.ts convex/ai/tailoringMasterProvenance.test.ts`
Expected: PASS.

- [ ] **Step 2: Build the production client**

Run: `npm.cmd run build`
Expected: PASS.

- [ ] **Step 3: Inspect scope**

```bash
git diff -- convex/ai/evals scripts/runTailoringEval.ts convex/ai/tailoringPrompt.ts convex/ai/tailoringValidation.ts src/docxTemplate.ts
```

Expected: only eval/runner files change; production tailoring and DOCX files remain untouched.
