# Tailored Resume Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in job seeker download a job-specific DOCX version of their saved resume from any current job-result card.

**Architecture:** Save a bounded copy of the readable resume text alongside the existing private resume metadata. A protected Convex action will confirm that the requested job is in the caller’s latest brief, combine that private text with the public job description, and ask the existing Gemini integration for a factual, tailored plain-text resume. The browser will convert that response into a DOCX only when the user clicks Download; neither generated resume nor prompt is stored.

**Tech Stack:** React 19, TypeScript, Convex actions and queries, Gemini interactions API, the `docx` browser package, Vitest, Vite.

**Spec:** User request in this conversation: each result card has a “Tailored resume” button; clicking the first card produces a download whose content differs from the uploaded resume and reflects that job’s requirements.

## Global Constraints

- Keep resumes and tailored output private to the signed-in account owner.
- Accept only a job in that owner’s latest job brief; never accept an arbitrary job ID.
- Never invent work history, qualifications, employers, dates, education, certifications, metrics, or contact details.
- Send the private resume text to Gemini only after the user presses the button; do not log, persist, or reuse the tailored output.
- Offer three one-time user-provided connections—Gemini, OpenAI, and Anthropic—in addition to the existing CareerPilot Gemini connection. The selected key is passed only to the protected action for that request, is never written to Convex, browser storage, logs, analytics, or a download, and is cleared from React state immediately after completion.
- When the selected AI provider is unavailable, rejects the request, times out, or returns unusable output, generate and download a deterministic reordered version from the saved resume and selected job requirements. This fallback must not contact an AI provider or make claims the source resume does not support.
- Generate a `.docx` download on demand, while keeping `docx` out of the initial application bundle through a dynamic import.
- Existing resumes that predate the saved-text field must show an actionable re-upload message rather than failing silently.
- Preserve the existing result-card layout, native button semantics, keyboard focus, disabled state, and responsive styles.

---

### Task 1: Retain bounded, readable resume text for an explicit tailoring request

**Files:**
- Create: `src/resumeText.ts`
- Create: `src/resumeText.test.ts`
- Modify: `src/ResumeUpload.tsx`
- Modify: `convex/schema.ts`
- Modify: `convex/resumes.ts`

**Interfaces:**
- Consumes: parsed PDF/DOCX text from `readableText(file)`.
- Produces: `prepareResumeTextForStorage(text: string): string` and an optional `resumes.extractedText` field capped at 60,000 characters.

- [ ] **Step 1: Write the failing text-preparation tests**

```ts
import { describe, expect, it } from 'vitest'
import { MAX_STORED_RESUME_CHARS, prepareResumeTextForStorage } from './resumeText'

describe('prepareResumeTextForStorage', () => {
  it('normalizes whitespace without changing the resume facts', () => {
    expect(prepareResumeTextForStorage('  Priya\n\nReact engineer  ')).toBe('Priya\n\nReact engineer')
  })

  it('caps unusually long readable resumes', () => {
    expect(prepareResumeTextForStorage('a'.repeat(MAX_STORED_RESUME_CHARS + 1))).toHaveLength(MAX_STORED_RESUME_CHARS)
  })
})
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npx vitest run src/resumeText.test.ts`

Expected: FAIL because `resumeText.ts` does not exist.

- [ ] **Step 3: Add the bounded text helper**

```ts
export const MAX_STORED_RESUME_CHARS = 60_000

export function prepareResumeTextForStorage(text: string) {
  return text.trim().slice(0, MAX_STORED_RESUME_CHARS)
}
```

- [ ] **Step 4: Save the normalized text with new uploads while preserving older records**

```ts
// convex/schema.ts
extractedText: v.optional(v.string()),

// convex/resumes.ts
args: {
  storageId: v.id('_storage'),
  fileName: v.string(),
  mimeType: v.string(),
  sizeBytes: v.number(),
  extractedTextLength: v.number(),
  extractedText: v.string(),
  detectedSkills: v.array(v.string()),
},
```

In `ResumeUpload.tsx`, call `prepareResumeTextForStorage(text)` immediately after the readable-text check and pass that value as `extractedText` to `saveResume`. Keep the existing file upload and skill detection flow unchanged.

- [ ] **Step 5: Run the focused test and regenerate Convex types**

Run: `npx vitest run src/resumeText.test.ts` and `npx convex dev --once`

Expected: the helper test passes and generated API types accept `extractedText`.

- [ ] **Step 6: Commit the private-resume input work**

```bash
git add src/resumeText.ts src/resumeText.test.ts src/ResumeUpload.tsx convex/schema.ts convex/resumes.ts convex/_generated
git commit -m "feat: retain readable resume text for tailoring"
```

### Task 2: Generate a factual tailored resume only for a job in the current brief

**Files:**
- Create: `convex/tailoredResumes.ts`
- Create: `convex/tailoredResumes.test.ts`
- Modify: `convex/_generated/api.d.ts` (generated by Convex)

**Interfaces:**
- Consumes: `generate({ jobId: Id<'jobs'> })` from the signed-in user, that user’s saved `resumes.extractedText`, and the matching current-brief job description.
- Produces: `Promise<{ fileName: string; resumeText: string }>` without writing generated content to Convex storage or tables.

- [ ] **Step 1: Write failing pure-function tests for safety and response validation**

```ts
import { describe, expect, it } from 'vitest'
import { isUsableTailoredResume, makeTailoredResumeFileName } from './tailoredResumes'

describe('tailored resume helpers', () => {
  it('rejects a model response that only repeats the uploaded resume', () => {
    expect(isUsableTailoredResume('Priya\nReact engineer', 'Priya\nReact engineer')).toBe(false)
  })

  it('creates a safe, readable DOCX name for the selected role', () => {
    expect(makeTailoredResumeFileName('Priya Shah', 'Senior React Engineer', 'Northstar')).toBe('priya-shah-senior-react-engineer-northstar-tailored-resume.docx')
  })
})
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npx vitest run convex/tailoredResumes.test.ts`

Expected: FAIL because `tailoredResumes.ts` does not exist.

- [ ] **Step 3: Add a protected, minimal input query**

Create an `internalQuery` named `inputForGeneration` that receives `ownerId` and `jobId`. It must:

```ts
const resume = await ctx.db.query('resumes').withIndex('by_owner', (q) => q.eq('ownerId', args.ownerId)).order('desc').first()
const latestSearch = (await ctx.db.query('searchRuns').withIndex('by_owner_requested', (q) => q.eq('ownerId', args.ownerId)).order('desc').collect())[0]
const isInBrief = latestSearch && (await ctx.db.query('jobSuggestions').withIndex('by_search_rank', (q) => q.eq('searchRunId', latestSearch._id)).collect()).some((item) => item.jobId === args.jobId)
```

Return only the saved extracted text plus the selected job’s title, company, and description when `isInBrief` is true. Return `null` otherwise. Do not return storage IDs, file metadata, full search history, or other users’ data.

- [ ] **Step 4: Add the public action and Gemini prompt**

The `generate` action must authenticate with `requireOwner`, call the internal query, reject missing/stale resume text with `Please re-upload your resume before tailoring it.`, and call the existing Gemini Interactions endpoint with the existing `GEMINI_API_KEY` and a 12-second timeout.

Use this prompt shape:

```text
Rewrite the candidate resume for this one job. Preserve every true fact from the source resume. Never invent or exaggerate experience, skills, education, employers, dates, certifications, achievements, or numbers. Prioritize and rephrase existing evidence that matches the job requirements. Return only a polished plain-text resume with clear headings and bullets; no commentary, markdown fences, or claims that are not supported by the source resume.

JOB TITLE: {title}
COMPANY: {companyName}
JOB DESCRIPTION:
{description.slice(0, 9000)}

SOURCE RESUME:
{extractedText.slice(0, 18000)}
```

Use `isUsableTailoredResume(source, candidate)` before returning the result. It must reject blank output, output shorter than 80 characters, and normalized output identical to the source. Convert all other API or validation failures to one user-safe error: `We could not tailor your resume right now. Please try again.`

- [ ] **Step 4a: Add one-time provider selection and deterministic fallback**

Extend the action input with `connection: { provider: 'careerpilot' | 'gemini' | 'openai' | 'anthropic'; apiKey?: string; model?: string }`. Require a nonempty `apiKey` only for the three user-provided providers, and never pass that key into an internal query, database mutation, exception text, or log statement.

Use the provider’s server-side text endpoint with its required authentication header: Gemini uses `x-goog-api-key`; OpenAI uses `Authorization: Bearer`; Anthropic uses `x-api-key` plus its required API-version header. Use a provider-specific output reader and return the same `{ fileName, resumeText }` shape for every successful response.

On any provider error, return `{ fileName, resumeText: reorderResumeForJob(sourceResume, jobDescription), mode: 'reordered' }` instead of throwing. `reorderResumeForJob` must score existing nonempty resume paragraphs by case-insensitive overlap with unique job-description terms, keep the contact/header paragraph first, retain all paragraphs exactly as written, and use their original order as the tie-breaker. It must not add text, delete text, or send any request outside Convex.

- [ ] **Step 5: Run the focused test and regenerate Convex types**

Run: `npx vitest run convex/tailoredResumes.test.ts` and `npx convex dev --once`

Expected: helper tests pass and `api.tailoredResumes.generate` is generated.

- [ ] **Step 6: Commit the secure generation action**

```bash
git add convex/tailoredResumes.ts convex/tailoredResumes.test.ts convex/_generated
git commit -m "feat: generate factual tailored resumes"
```

### Task 3: Download the tailored result from every job card

**Files:**
- Create: `src/tailoredResumeDownload.ts`
- Create: `src/tailoredResumeDownload.test.ts`
- Modify: `src/ResultsScreen.tsx`
- Modify: `src/App.css`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `api.tailoredResumes.generate`, `{ fileName: string; resumeText: string }`, and the selected result card’s `job.id`.
- Produces: `downloadTailoredResume({ fileName, resumeText })`, a browser-only DOCX download, plus accessible loading/error state on the selected card.

- [ ] **Step 1: Add the DOCX dependency**

Run: `npm install docx`

Expected: `package.json` and `package-lock.json` contain the dependency; no document library is loaded during initial page render.

- [ ] **Step 2: Write failing filename and content tests**

```ts
import { describe, expect, it } from 'vitest'
import { splitResumeIntoParagraphs } from './tailoredResumeDownload'

describe('splitResumeIntoParagraphs', () => {
  it('keeps headings and bullets from the tailored content', () => {
    expect(splitResumeIntoParagraphs('PRIYA SHAH\n\nEXPERIENCE\n- Built React dashboards')).toEqual([
      'PRIYA SHAH',
      'EXPERIENCE',
      '- Built React dashboards',
    ])
  })
})
```

- [ ] **Step 3: Run the focused test to verify it fails**

Run: `npx vitest run src/tailoredResumeDownload.test.ts`

Expected: FAIL because `tailoredResumeDownload.ts` does not exist.

- [ ] **Step 4: Create the lazy DOCX downloader**

`splitResumeIntoParagraphs` must remove empty lines and trim each remaining line. In `downloadTailoredResume`, dynamically import `docx`, convert uppercase heading lines into bold paragraph headings, convert leading `- ` lines into bullet paragraphs, and render every other line as a normal paragraph. Then use `Packer.toBlob`, `URL.createObjectURL`, a temporary native `<a download>`, and `URL.revokeObjectURL` after the click.

```ts
const { Document, Packer, Paragraph, TextRun } = await import('docx')
const blob = await Packer.toBlob(new Document({ sections: [{ children }] }))
```

- [ ] **Step 5: Connect the card control without blocking other cards**

In `ResultsScreen.tsx`, add `useAction(api.tailoredResumes.generate)`, `tailoringJobId`, and a per-card `tailorResume(job)` event handler. The handler must await the action, call `downloadTailoredResume`, report errors through the existing `actionError` message, and clear only the selected job’s loading state.

Place this native button in each card’s footer before the Apply link:

```tsx
<button
  className="tailor-resume"
  disabled={tailoringJobId === job.id}
  onClick={() => void tailorResume(job)}
  type="button"
>
  {tailoringJobId === job.id ? 'Tailoring resume…' : 'Tailored resume'}
</button>
```

Style `.tailor-resume` as the existing card’s secondary document action: 42px minimum hit area, visible lime focus ring, subtle teal outline, calm hover fill, and disabled wait cursor. Do not add another panel, modal, or card level.

- [ ] **Step 5a: Give users a clear provider choice without storing a secret**

Place a native `<details>` panel beneath each card’s Tailored resume button. Its summary reads `Use your own AI connection`; the panel contains a provider `<select>` with Gemini, OpenAI, and Anthropic; an `apiKey` password input; an optional model input; and a `Generate with my AI` button. Keep the selected provider, model, and key only in component state; reset the key in a `finally` block. Copy must say: `Your key is used once for this resume and is not saved.`

If `mode === 'reordered'`, download the DOCX and set a visible `role="status"` message: `AI was unavailable, so we downloaded a privacy-first reordered version instead.` Do not call the fallback an AI rewrite.

- [ ] **Step 6: Run unit checks and the production build**

Run: `npm test && npm run lint && npm run build`

Expected: all tests pass, lint has no new errors, and the production build succeeds. Confirm the initial build does not include `docx` in the main ResultsScreen chunk; it should only load after the button is pressed.

- [ ] **Step 7: Manually verify the requested acceptance check**

Run: `npm run dev`

1. Sign in using an account that has a newly uploaded readable resume and a completed job brief.
2. Press **Tailored resume** on the first result card.
3. Confirm the selected button changes to **Tailoring resume…** while other cards remain usable.
4. Confirm a file named `*-tailored-resume.docx` downloads.
5. Open the document and compare it with the uploaded resume: it must not be identical, it must retain only factual candidate information, and it must foreground wording and requirements from that first job description.
6. Temporarily test a resume created before this feature’s re-upload requirement and confirm the action gives the re-upload message rather than downloading an empty or invented document.

- [ ] **Step 8: Commit the result-card download experience**

```bash
git add src/tailoredResumeDownload.ts src/tailoredResumeDownload.test.ts src/ResultsScreen.tsx src/App.css package.json package-lock.json
git commit -m "feat: download a tailored resume from job cards"
```

### Task 4: Deploy and verify the private production path

**Files:**
- Modify: generated Convex deployment from `convex/tailoredResumes.ts`

**Interfaces:**
- Consumes: the committed web app and generated Convex function.
- Produces: a production-tailored DOCX that is available only to the signed-in account owner.

- [ ] **Step 1: Deploy the Convex backend after local checks pass**

Run: `npx convex deploy --prod`

Expected: the new action deploys with no schema validation errors.

- [ ] **Step 2: Deploy the production frontend**

Run: `vercel --prod --yes`

Expected: Vercel reports a ready production deployment.

- [ ] **Step 3: Keep the official public address on the new deployment**

Run: `vercel alias set <new-production-deployment> careerpilot-jobs.vercel.app`

Expected: `careerpilot-jobs.vercel.app` resolves to this deployment.

- [ ] **Step 4: Repeat the first-card download check in production**

Use a test account and non-sensitive test resume. Confirm the downloaded DOCX is different from the test source resume, reflects the selected public job listing, and is not available after signing out or when passing a job outside the current brief.

## Plan self-review

- **Spec coverage:** Task 3 puts the named button on every result card, shows a per-card generation state, and performs the requested download check. Tasks 1 and 2 supply the private, factual source and secure job-specific generation needed for that UI.
- **Privacy and correctness:** Task 2 authorizes both resume ownership and membership in the latest job brief, does not persist generated output, avoids model-output logging, rejects unchanged output, and tells older-account users to re-upload.
- **Provider and fallback coverage:** The scope update provides Gemini, OpenAI, and Anthropic as one-time choices, keeps their secrets out of persistence, and defines the exact non-AI fallback used after an unavailable provider.
- **Placeholder scan:** Every task names exact files, interfaces, commands, tests, and expected outcomes. Production placeholders in the alias command are intentionally runtime values produced by Vercel and are not application code.
- **Type consistency:** `api.tailoredResumes.generate` returns `{ fileName, resumeText }`; `downloadTailoredResume` consumes those same fields; `tailoringJobId` is always a `JobCard.id` string.
