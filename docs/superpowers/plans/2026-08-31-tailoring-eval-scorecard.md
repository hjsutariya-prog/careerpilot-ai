# Tailoring Evaluation Scorecard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Report model analysis quality, edit quality, and final safety independently while supporting repeated, sequential live evaluation runs.

**Architecture:** Extend evaluator summaries with three dimensions and retain the current strict overall result as their conjunction. Aggregate individual results into a suite scorecard and per-case stability records; the runner will invoke existing prompt, schema, and validator code sequentially for each run.

**Tech Stack:** TypeScript, Vitest, Node.js CLI, Gemini evaluation runner.

**Spec:** User request dated 2026-08-31 in this conversation.

## Global Constraints

- Use `npm.cmd` for every npm command.
- Do not modify production prompt, schema, validation, Gemini configuration, DOCX behavior, credits, or resume block IDs.
- Do not send live Gemini requests concurrently.
- The output file must never contain API keys or HTTP headers.

---

### Task 1: Add separate evaluator dimensions and hard safety gate

**Files:**
- Modify: `convex/ai/evals/tailoringEval.ts`
- Test: `convex/ai/evals/tailoringEval.test.ts`

**Interfaces:**
- Consumes: existing `TailoringValidationResult` and evaluation expectations.
- Produces: `analysisPass`, `editQualityPass`, `safetyPass`, `overallPass`, and `productionSafetyGate`.

- [ ] Define analysis pass as all expected requirement classifications being recognized.
- [ ] Define edit-quality pass as no unnecessary, invalid, over-limit, or validator-rejected proposed edit.
- [ ] Define safety pass as no accepted unsafe edit or accepted protected/unknown/evidence-bypassing/named-technology edit.
- [ ] Define the suite safety gate as true only when all safety metrics are zero.
- [ ] Test model analysis/edit failures that are safely rejected, and a genuine accepted safety failure.

### Task 2: Aggregate repeated results and stability

**Files:**
- Modify: `convex/ai/evals/tailoringEval.ts`
- Test: `convex/ai/evals/tailoringEval.test.ts`

**Interfaces:**
- Consumes: flat `TailoringEvalSummary[]` and a positive run count.
- Produces: multi-run summary with rates, total calls, and `stablePass`, `flaky`, or `stableFailure` for every synthetic case.

- [ ] Aggregate all dimensions across every invocation.
- [ ] Group outcomes by case ID and classify stability.
- [ ] Test stable pass, flaky, stable failure, and multi-run totals.

### Task 3: Add sequential runner support and JSON/report output

**Files:**
- Modify: `scripts/runTailoringEval.ts`
- Modify: `scripts/tailoringEvalRunner.ts`
- Test: `scripts/tailoringEvalRunner.test.ts`

**Interfaces:**
- Consumes: `--runs=<positive integer>` from `process.argv`.
- Produces: JSON `{ runs, summary, cases }` and terminal scorecard output.

- [ ] Parse `--runs`, with one as the default and a clear error for invalid values.
- [ ] Run cases sequentially for each requested run.
- [ ] Print analysis, edit-quality, safety, overall, and safety-gate outcomes.
- [ ] Print each case's multi-run pass counts and stability classification.
- [ ] Test default and explicit run parsing.

### Task 4: Verify the reporting-only change

**Files:**
- Test: evaluator and runner tests.

- [ ] Run targeted tests using `npm.cmd test -- ...`.
- [ ] Run `npm.cmd run build`.
- [ ] Run the live evaluation only if `GEMINI_API_KEY` is available.
