# Tailoring Evaluation Genuine Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Block unsupported named technologies in resume edits and allow only exact skills reordering when the skills are already matched.

**Architecture:** Add a narrow named-technology policy to the Gemini instruction and a deterministic validator check that prevents a missing named technology from being introduced. Keep normal edits tied to understated evidence; make a targeted exception only for exact, safe skills-line reorder operations supported by matched or understated evidence. Update synthetic evaluation expectations separately where they were incorrectly asking for unrelated positive facts.

**Tech Stack:** TypeScript, Convex validators, Vitest, Gemini structured response evaluation.

**Spec:** User request dated 2026-08-31 in this conversation.

## Global Constraints

- Use `npm.cmd` for every npm command.
- Do not change DOCX rendering, credits, resume block IDs, Gemini model/configuration, call count, or the eight-edit cap.
- Do not weaken existing factual safety checks.
- Keep evaluator-only expectation changes out of production tailoring behavior.

---

### Task 1: Add named-technology evidence protection

**Files:**
- Modify: `convex/ai/tailoringPrompt.ts`
- Modify: `convex/ai/tailoringValidation.ts`
- Test: `convex/ai/tailoringPrompt.test.ts`
- Test: `convex/ai/tailoringValidation.test.ts`

**Interfaces:**
- Consumes: `TailoringAnalysis`, `TailoringEdit`, and `ResumeBlock`.
- Produces: rejection reason `missing_named_requirement_introduced` for accepted-candidate edits that introduce a missing named technology.

- [ ] Add prompt wording that a named technology requires explicit resume evidence.
- [ ] Add four non-inference examples: React/TypeScript, Docker/Kubernetes, AWS/Terraform, SQL/PostgreSQL.
- [ ] Add a small deterministic named-technology token extractor for missing requirements and an edit-time comparison against the original resume text.
- [ ] Add tests proving unsupported named technologies are rejected and explicitly present technologies can still be safely rephrased.

### Task 2: Allow exact skills reorder supported by matched evidence

**Files:**
- Modify: `convex/ai/tailoringValidation.ts`
- Test: `convex/ai/tailoringValidation.test.ts`

**Interfaces:**
- Consumes: existing `isSafeSkillReorder`, matched and understated analysis evidence.
- Produces: accepted safe skills reorders when the target has matched or understated evidence, while ordinary paragraph edits still require understated evidence.

- [ ] Detect the exact safe-reorder condition before enforcing the evidence link.
- [ ] Permit matched or understated evidence only for this condition.
- [ ] Preserve every existing block, duplicate, protected-slot, named-technology, and semantic-rewrite check.
- [ ] Add acceptance and rejection tests for reorder variants and ordinary matched paragraphs.

### Task 3: Correct evaluator-only case expectations

**Files:**
- Modify: `convex/ai/evals/tailoringEvalCases.ts`
- Test: `convex/ai/evals/tailoringEval.test.ts`

**Interfaces:**
- Consumes: existing concept matcher and strict safety expectations.
- Produces: expectations that require only important JD requirements to appear in analysis.

- [ ] Remove unrelated positive-fact requirements from the six specified synthetic cases.
- [ ] Add conservative REST API aliases only to the eval matcher.
- [ ] Keep missing-requirement and forbidden-edit assertions unchanged.

### Task 4: Verify the isolated fixes

**Files:**
- Test: existing prompt, validation, and evaluation test files.

- [ ] Run targeted tests with `npm.cmd test -- ...`.
- [ ] Run `npm.cmd run build`.
- [ ] Run `npm.cmd run eval:tailoring` only when `GEMINI_API_KEY` is available, without changing code based on its output.
