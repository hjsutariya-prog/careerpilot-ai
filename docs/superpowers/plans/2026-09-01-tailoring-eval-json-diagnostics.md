# Tailoring Eval JSON Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Explain why a live synthetic Gemini evaluation response cannot be parsed without changing production tailoring.

**Architecture:** Add an eval-only Gemini HTTP client that sends the same request payload as production and records safe response metadata. Attach a bounded parse diagnostic to the runner result when the production parser returns `null`.

**Tech Stack:** TypeScript, Gemini Interactions API, Vitest.

**Spec:** User request in this conversation, 2026-09-01.

## Global Constraints

- Do not change production prompt, validation, provenance, DOCX, credits, or eval expectations.
- Reuse the production model configuration and JSON schema.
- Store only synthetic, bounded model-output previews; never store keys or headers containing credentials.
- Use `npm.cmd` for all npm commands.

---

### Task 1: Eval-only Gemini transport diagnostics

**Files:**
- Create: `scripts/tailoringEvalGemini.ts`
- Test: `scripts/tailoringEvalGemini.test.ts`

- [ ] Send the same model, generation config, JSON MIME type, and schema as `convex/gemini.ts`.
- [ ] Record HTTP status, content type, interaction status, bounded output previews, and truncation signals.
- [ ] Unit-test empty output, fenced JSON, explanatory text, and incomplete output detection.

### Task 2: Runner parse diagnostics

**Files:**
- Modify: `scripts/tailoringEvalRunner.ts`
- Test: `scripts/tailoringEvalRunner.test.ts`

- [ ] Add an optional diagnostic field to failed live results and saved JSON results.
- [ ] Classify parser failure as empty text, malformed/truncated JSON, or valid JSON rejected by the tailoring shape parser.
- [ ] Print the bounded diagnostic with the existing runner failure section.

### Task 3: Verification

- [ ] Run focused diagnostics and evaluator tests using `npm.cmd test -- ...`.
- [ ] Run `npm.cmd run build`.
