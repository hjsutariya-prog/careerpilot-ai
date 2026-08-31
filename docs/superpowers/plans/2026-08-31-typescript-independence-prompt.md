# TypeScript Independence Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Gemini classify TypeScript as missing when a resume only establishes React.

**Architecture:** Add one targeted named-technology independence section and one direct React/TypeScript classification example to the existing Gemini system instruction. Add prompt tests that assert the new policy text; no validator, schema, runner, or document behavior changes.

**Tech Stack:** TypeScript, Vitest, Gemini prompt string.

**Spec:** User request dated 2026-08-31 in this conversation.

## Global Constraints

- Use `npm.cmd` for every npm command.
- Do not modify tailoring validation, DOCX behavior, credits, block IDs, Gemini call count, edit limit, or evaluator expectations.
- Do not add unrelated prompt examples.

---

### Task 1: Add the narrow technology-independence clarification

**Files:**
- Modify: `convex/ai/tailoringPrompt.ts`
- Test: `convex/ai/tailoringPrompt.test.ts`

**Interfaces:**
- Consumes: existing `tailoringSystemInstruction`.
- Produces: explicit independent evaluation of named technology requirements and a React/TypeScript classification example.

- [ ] Add a failing prompt test for React-only resumes, explicit TypeScript evidence, and non-evidence from technology pairings.
- [ ] Add the targeted independence rule and direct classification example to the system instruction.
- [ ] Run the focused prompt test and confirm it passes.

### Task 2: Verify no broader behavior changes

**Files:**
- Test: existing prompt test.

- [ ] Run `npm.cmd test -- convex/ai/tailoringPrompt.test.ts`.
- [ ] Run `npm.cmd run build`.
