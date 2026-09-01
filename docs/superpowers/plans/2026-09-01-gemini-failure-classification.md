# Gemini Failure Classification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Gemini provider failures, malformed model output, and safe-no-change outcomes distinct in production and live evaluation.

**Architecture:** Introduce a typed Gemini request error that is derived from HTTP status before any model-output parsing. Return explicit non-credit-consuming tailoring outcomes to the frontend, and classify eval provider failures outside model-quality scoring.

**Tech Stack:** TypeScript, Convex actions, React, Gemini Interactions API, Vitest.

**Spec:** User request in this conversation, 2026-09-01.

## Global Constraints

- Do not change the prompt, response shape, validators, Master provenance, DOCX behavior, credits, or Gemini model.
- Do not parse a non-2xx provider response as tailoring JSON.
- Do not add automatic retry loops; retain the existing one malformed-JSON repair call only after a successful Gemini response.
- Use `npm.cmd` for all npm commands.

---

### Task 1: Typed Gemini transport outcomes

**Files:**
- Modify: `convex/gemini.ts`
- Test: `convex/gemini.test.ts`

- [x] Add `GeminiFailureCode` and `GeminiRequestError`.
- [x] Map 429 to rate limit, 401/403 to authentication, 5xx to provider error, aborts to timeout, and successful-empty output to empty response.
- [x] Test that non-2xx errors occur before model JSON extraction.

### Task 2: Production tailoring outcomes and messages

**Files:**
- Modify: `convex/tailoredResumes.ts`
- Modify: `src/ResultsScreen.tsx`
- Test: `convex/tailoredResumes.test.ts`, `src/ResultsScreen.test.tsx` if the project has frontend test support.

- [x] Return `provider_unavailable`, `no_safe_changes`, and `no_meaningful_changes` without a reservation ID.
- [x] Release the existing reservation for every non-success outcome.
- [x] Display distinct safe user messages without provider internals.

### Task 3: Eval transport classification and denominators

**Files:**
- Modify: `scripts/tailoringEvalGemini.ts`
- Modify: `scripts/tailoringEvalRunner.ts`
- Modify: `convex/ai/evals/tailoringEval.ts`
- Test: `scripts/tailoringEvalGemini.test.ts`, `scripts/tailoringEvalRunner.test.ts`, `convex/ai/evals/tailoringEval.test.ts`

- [x] Mark failed provider calls as `executionStatus: provider_error`.
- [x] Avoid parser diagnostics and model-quality failures for provider errors.
- [x] Report attempted calls separately from successfully evaluated model responses.

### Task 4: Verification

- [x] Run the focused Gemini, tailoring, and evaluation tests with `npm.cmd test -- ...`.
- [x] Run `npm.cmd run build`.
