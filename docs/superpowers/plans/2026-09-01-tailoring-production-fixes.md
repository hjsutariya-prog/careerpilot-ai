# Tailoring Production Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Gemini replacements inside the existing 110% validator limits and persist active Master Resume structures.

**Architecture:** Add deterministic per-block limits to the prompt payload and state the same limits in the Gemini policy. Remove the unsupported `text` action argument before calling the Master structure mutation so its strict Convex validator receives only its declared fields.

**Tech Stack:** TypeScript, Convex, Vitest, Vite.

**Spec:** User request in this conversation, 2026-09-01.

## Global Constraints

- Do not weaken factual safety rules or increase the 110% validator threshold.
- Do not change credits, DOCX formatting, experience matching, or provenance validation.
- Use `npm.cmd` for all npm commands.

---

### Task 1: Prompt-compatible replacement limits

**Files:**
- Modify: `convex/ai/tailoringPrompt.ts`
- Test: `convex/ai/tailoringPrompt.test.ts`

**Interfaces:**
- Consumes: `ResumeBlock[]` from the existing tailoring flow.
- Produces: prompt-only `maxCharacters` and `maxWords` metadata for each editable block.

- [ ] Add a helper that counts words and returns `Math.floor(sourceLength * 1.1)` limits.
- [ ] Serialize those limits only in the Gemini prompt payload.
- [ ] Add the explicit policy text requiring both limits while preserving material facts.
- [ ] Assert prompt policy and sample block metadata in Vitest.

### Task 2: Master structure mutation arguments

**Files:**
- Modify: `convex/masterResumeStructure.ts`
- Test: `convex/masterResumeStructure.test.ts`

**Interfaces:**
- Consumes: `inputForMaster` result including extracted `text`.
- Produces: an `upsertForActiveMaster` call containing exactly `resumeId`, `ownerId`, `sourceHash`, and `structure`.

- [ ] Add a test proving parser output is compatible with the stored structure shape.
- [ ] Destructure `text` before invoking the strict Convex mutation.
- [ ] Keep ownership and active-master checks unchanged.

### Task 3: Regression verification

**Files:**
- Test: `convex/ai/tailoringValidation.test.ts`, `convex/ai/tailoringMasterProvenance.test.ts`

**Interfaces:**
- Consumes: existing validator and Master provenance helpers.
- Produces: regression coverage for rejected over-limit edits and accepted within-limit edits with Master evidence.

- [ ] Run the focused tests with `npm.cmd test -- ...`.
- [ ] Run `npm.cmd run build`.
