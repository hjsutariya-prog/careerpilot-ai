# High-Value Tailoring Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make template tailoring choose the strongest supported job-alignment opportunity before cosmetic word substitutions.

**Architecture:** Change only Gemini’s system and template instruction text. The model ranks understated requirements by JD importance, evidence strength, relevance gain, and factual risk before proposing edits; the API response and backend validator are unchanged.

**Tech Stack:** TypeScript, Gemini prompt text, Vitest.

**Spec:** User request in this conversation, 2026-08-31.

## Global Constraints

- Do not change validation, Gemini configuration, DOCX rendering, credits, blocks, cap, schema, or frontend.
- Keep the resume as the only evidence source.
- Use `npm.cmd` for all npm commands.

---

### Task 1: Add high-value edit selection rules

**Files:**
- Modify: `convex/ai/tailoringPrompt.ts`
- Test: `convex/ai/tailoringPrompt.test.ts`

**Interfaces:**
- Preserves `tailoringSystemInstruction` and `buildTailoringUserPrompt` exports.
- Adds ranking and anti-cosmetic instructions without changing JSON output.

- [ ] **Step 1: Add failing prompt assertions**

```ts
expect(tailoringSystemInstruction).toMatch(/JD importance[\s\S]*strength of resume evidence/i)
expect(tailoringSystemInstruction).toMatch(/cosmetic synonym/i)
expect(prompt).toMatch(/similar length is acceptable/i)
```

- [ ] **Step 2: Add rank-first instruction and examples**

The prompt ranks understated opportunities and makes supported ownership, sprint, release, and cross-functional delivery evidence higher value than synonym-only changes. It reiterates that banking and reconciliation cannot be added without evidence.

- [ ] **Step 3: Replace the stale strict-shorter prompt text**

The template instruction permits concise similar-length rewrites and requires material responsibilities, scope, stakeholders, and domain terms to remain.

- [ ] **Step 4: Run focused tests and production build**

Run: `npm.cmd test -- convex/ai/tailoringPrompt.test.ts`
Run: `npm.cmd run build`
