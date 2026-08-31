# Tailoring JSON Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover from a malformed Gemini tailoring response with one small schema-constrained repair request, without changing resume safety rules or product credits.

**Architecture:** The first tailoring request remains unchanged. Only a response that cannot be parsed as any supported tailoring format triggers one low-cost retry using the original task at lower thinking and output limits. The retry response uses the existing schema and then proceeds through the existing parser and semantic validator.

**Tech Stack:** TypeScript, Convex actions, Gemini Interactions API, Vitest.

**Spec:** User request in this conversation, 2026-08-31.

## Global Constraints

- Do not alter DOCX rendering, credits, block IDs, factual validation, or the eight-edit cap.
- Do not make a second request for valid-but-rejected tailoring output.
- The retry must remain limited to one additional Gemini call with lower thinking and output limits.
- Use `npm.cmd` for all npm commands.

---

### Task 1: Isolate malformed-output detection and repair prompt

**Files:**
- Create: `convex/ai/tailoringRepair.ts`
- Test: `convex/ai/tailoringRepair.test.ts`

**Interfaces:**
- Produces `requiresTailoringJsonRepair(raw: string): boolean`.
- Produces `buildTailoringJsonRepairPrompt(malformedOutput: string): string`.

- [ ] **Step 1: Write failing tests**

```ts
expect(requiresTailoringJsonRepair('{"edits":')).toBe(true)
expect(requiresTailoringJsonRepair('{"edits":[]}')).toBe(false)
expect(buildTailoringJsonRepairPrompt('{"edits":')).not.toContain('SOURCE RESUME')
```

- [ ] **Step 2: Implement the smallest pure helpers**

```ts
export function requiresTailoringJsonRepair(raw: string) {
  return !parseTailoringResponse(raw) && !parseLegacyIndexedTailoringResponse(raw)
}
```

The retry prompt must ask for valid JSON conforming to the supplied response schema and include the original tailoring task.

- [ ] **Step 3: Run focused test**

Run: `npm.cmd test -- convex/ai/tailoringRepair.test.ts`

### Task 2: Use one low-cost repair call only after malformed output

**Files:**
- Modify: `convex/tailoredResumes.ts`
- Modify: `convex/ai/tailoringGeminiConfig.ts`
- Test: `convex/tailoredResumes.test.ts`

**Interfaces:**
- Consumes `requiresTailoringJsonRepair` and `buildTailoringJsonRepairPrompt`.
- Uses existing `requestGeminiText`, `tailoringResponseSchema`, `templateReplacements`, and semantic validation unchanged.

- [ ] **Step 1: Add a repair-only Gemini configuration**

```ts
export const tailoringJsonRepairGeminiConfig = {
  ...tailoringGeminiConfig,
  thinkingLevel: 'low' as const,
  maxOutputTokens: 1_800,
}
```

- [ ] **Step 2: Add repair request orchestration**

```ts
const initialText = await providerText(prompt, true)
const text = requiresTailoringJsonRepair(initialText)
  ? await repairProviderText(buildTailoringJsonRepairPrompt(initialText))
  : initialText
```

The second request must pass the existing JSON schema and must run only for malformed output.

- [ ] **Step 3: Record safe diagnostics without logging resume content**

Log `repairedMalformedJson: true` and both durations/counts, but not response text.

- [ ] **Step 4: Run focused tests**

Run: `npm.cmd test -- convex/ai/tailoringRepair.test.ts convex/tailoredResumes.test.ts`

### Task 3: Verify the production build

**Files:**
- Modify only if typecheck exposes a required import/type correction.

- [ ] **Step 1: Run the full test suite**

Run: `npm.cmd test`

- [ ] **Step 2: Run the production build**

Run: `npm.cmd run build`

- [ ] **Step 3: Review the diff and report call behavior**

Confirm a normal request makes one Gemini call, a malformed response can make two, and all accepted changes still run through existing semantic validation.
