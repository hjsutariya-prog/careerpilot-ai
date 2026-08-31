# Gemini Resume Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unavailable Anthropic calls in CareerPilot's resume workflow with server-owned Gemini API calls while preserving factual validation, caching, and credit charging.

**Architecture:** Reuse the existing Gemini Interactions API integration and `GEMINI_API_KEY` server secret. Gemini 3.6 Flash handles reusable profile extraction and the ten-job batch match at medium thinking; Gemini 3.1 Pro handles the explicit final tailoring request at high thinking. Deterministic parsers and scoring remain unchanged.

**Tech Stack:** TypeScript, Convex actions, Gemini Interactions API, Vitest.

**Spec:** `docs/superpowers/plans/2026-08-31-ai-resume-matching-tailoring-pdf.md`

## Global Constraints

- Use only `GEMINI_API_KEY` from the Convex server environment; never expose it to the browser or database.
- Use `gemini-3.6-flash` with `thinking_level: 'medium'` for profile extraction and matching.
- Use `gemini-3.1-pro-preview` with `thinking_level: 'high'` only after a user explicitly requests one tailored resume.
- Keep the master-resume hash cache, the evidence-line validation, the fixed 40/30/20/8/2 score formula, and the existing credit reservation rules.
- On provider, response, or validation failure, release any tailoring reservation and retain the existing safe fallback.

---

## File structure

- `convex/gemini.ts` — shared Interactions API request and response-text extraction helpers.
- `convex/gemini.test.ts` — response extraction and JSON parsing tests.
- `convex/resumeProfiles.ts` — Gemini-backed factual profile generation.
- `convex/resumeMatching.ts` — Gemini-backed one-request batch matching.
- `convex/tailoredResumes.ts` — Gemini Pro-backed high-reasoning tailoring.
- `convex/*.test.ts` — preserve factual and fallback behaviour around provider calls.

## Task 1: Add a shared Gemini server helper

**Files:**
- Create: `convex/gemini.ts`
- Create: `convex/gemini.test.ts`

**Interfaces:**
- `geminiText(body: unknown): string` returns concatenated text from the final `model_output` step.
- `requestGeminiText(input)` reads `GEMINI_API_KEY`, calls `POST https://generativelanguage.googleapis.com/v1beta/interactions`, and throws a user-safe provider error on non-2xx responses.

- [x] **Step 1: Write failing output-extraction tests**

```ts
expect(geminiText({ steps: [{ type: 'model_output', content: [{ type: 'text', text: '{"ok":true}' }] }] })).toBe('{"ok":true}')
expect(geminiText({ steps: [] })).toBe('')
```

- [x] **Step 2: Implement the helper**

```ts
export async function requestGeminiText({ model, prompt, thinkingLevel, schema, maxOutputTokens }: GeminiRequest) {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('Gemini is not configured')
  const response = await fetch(GEMINI_INTERACTIONS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ model, input: prompt, generation_config: { thinking_level: thinkingLevel, max_output_tokens: maxOutputTokens }, ...(schema ? { response_format: { type: 'text', mime_type: 'application/json', schema } } : {}) }),
  })
  if (!response.ok) throw new Error('Gemini request failed')
  return geminiText(await response.json())
}
```

- [x] **Step 3: Run the focused test**

Run: `npm test -- convex/gemini.test.ts`

Expected: PASS.

## Task 2: Move all resume actions to Gemini

**Files:**
- Modify: `convex/resumeProfiles.ts`
- Modify: `convex/resumeMatching.ts`
- Modify: `convex/tailoredResumes.ts`
- Modify: `convex/resumeProfiles.test.ts`
- Modify: `convex/resumeMatching.test.ts`
- Modify: `convex/tailoredResumes.test.ts`

**Interfaces:**
- Profile extraction calls `requestGeminiText({ model: 'gemini-3.6-flash', thinkingLevel: 'medium' })`.
- Batch matching calls the same Flash configuration once for all stale selected jobs.
- Tailoring calls `requestGeminiText({ model: 'gemini-3.1-pro-preview', thinkingLevel: 'high' })` after the current credit reservation succeeds.

- [x] **Step 1: Replace provider-specific request parsing**

```ts
const text = await requestGeminiText({
  model: 'gemini-3.6-flash', prompt: profilePrompt(lines), thinkingLevel: 'medium',
  maxOutputTokens: 2800,
})
const profile = parseResumeProfile(jsonFromText(text), lines.length)
```

Apply the same flow to one batch-match response with a 4,500-token cap. Retain all existing JSON, evidence-line, duplicate-ID, and score checks.

- [x] **Step 2: Change final tailoring to Gemini Pro**

```ts
const text = await requestGeminiText({
  model: 'gemini-3.1-pro-preview', prompt: promptFor(input, args.templateSlots),
  thinkingLevel: 'high', maxOutputTokens: 6000,
})
```

Keep `templateReplacements`, factual rewrite checks, and the release-on-failure path unchanged.

- [x] **Step 3: Test and type-check**

Run: `npm test -- convex/gemini.test.ts convex/resumeProfiles.test.ts convex/resumeMatching.test.ts convex/tailoredResumes.test.ts && npx convex dev --once && npm run build`

Expected: all tests and the build pass; generated Convex API types contain no Anthropic-only resume action contract.

## Task 3: Configure and test the development secret

**Files:**
- Modify: `README.md` only if it already documents server secrets.

- [ ] **Step 1: Set the development secret outside source control**

```powershell
npx convex env set GEMINI_API_KEY
```

Paste the secret only into the terminal prompt. Do not save it in `.env`, git, or chat.

- [ ] **Step 2: Verify one non-sensitive test resume**

Upload a disposable resume, wait for profile status `ready`, run a ten-job brief, and tailor one selected job. Confirm the match score has evidence and the tailored download has a Gemini-generated edit before enabling production.

- [ ] **Step 3: Set production after development verification**

```powershell
npx convex env set GEMINI_API_KEY --prod
```

## Self-review

- Profile reuse stays tied to the master-resume hash; changing model provider does not regenerate an unchanged profile unless the profile schema version is deliberately raised.
- One Gemini Flash request covers stale jobs in the selected ten-job brief; it does not create tailored resumes automatically.
- Gemini Pro is used only for a user-clicked tailoring request, so expensive output is bounded.
- User secrets remain server-only and failures release reserved CareerPilot credits.
