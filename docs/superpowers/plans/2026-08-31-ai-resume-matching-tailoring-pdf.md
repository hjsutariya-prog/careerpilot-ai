# AI Resume Matching, Tailoring, and PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Analyse a user's unchanged master resume once, score it against the ten jobs in their private brief, and generate a factual job-specific DOCX or PDF only when the user requests it.

**Architecture:** A private resume profile is created once for each resume-content fingerprint and reused for later daily briefs. Sonnet 5 returns evidence-based requirement mappings as structured JSON; deterministic code calculates the visible score so the model cannot make up a score. Tailoring is a separate, explicit action using Sonnet 5 at high effort and a locked DOCX template. A successful PDF request converts that generated DOCX through a private CloudConvert job and saves the finished PDF in Convex storage for download.

**Tech Stack:** React 19, TypeScript, Convex queries/mutations/actions, Anthropic Messages API (`claude-sonnet-5`), CloudConvert Jobs API, Convex storage, JSZip, Vitest.

**Spec:** User requirements from this conversation on 2026-08-31; this plan supersedes `docs/superpowers/plans/2026-08-31-tailored-resume-download.md`, `docs/superpowers/plans/2026-08-31-application-kit.md`, and the AI-provider parts of `docs/superpowers/plans/2026-08-31-provider-model-effort-controls.md`.

## Global Constraints

- Store one private master resume per account; its existing file remains the source of truth.
- Generate and reuse a factual profile while the resume's normalized extracted text has the same SHA-256 hash.
- Never send an Anthropic or CloudConvert key to the browser or database.
- Use `claude-sonnet-5` at medium effort for profile extraction and ten-job matching; use high effort only for an explicit tailoring request.
- The initial ten-job match scan costs the user zero CareerPilot credits. It is one batched model request, never ten separate requests.
- A tailored DOCX or PDF costs 20 CareerPilot credits only after the requested downloadable file is ready. Failed, unsafe, expired, or cancelled work costs zero credits.
- Calculate the visible score with this fixed 100-point formula: supported required/preferred skills 40, relevant role/seniority 30, supported responsibility/achievement evidence 20, work arrangement 8, India/location 2.
- Location must never exclude an otherwise relevant India job. Non-India jobs remain outside the job-source scope.
- A tailored resume may improve only the score areas supported by existing evidence. It must never claim a missing skill, job, date, qualification, employer, number, or achievement.
- PDF conversion means conversion of the generated DOCX, not redrawing plain text in the browser. The current `jsPDF` helper must not be used for this feature.
- CloudConvert receives only a short-lived signed URL for the generated DOCX. The output PDF is copied immediately into the user's private Convex storage; no CloudConvert URL is shown to the browser.
- Update the product privacy copy before enabling CloudConvert because a requested PDF is processed by that provider.

---

## File structure

- `convex/schema.ts` — private profile, match, credit, generated-document, and conversion-job tables.
- `convex/resumeProfiles.ts` — profile types, validation, fingerprint reuse, Anthropic extraction, and profile status query.
- `convex/resumeMatching.ts` — JSON contract, deterministic 100-point score calculation, batched Sonnet matching action, and match queries.
- `convex/credits.ts` — append-only credit ledger, reservation, completion, and release helpers.
- `convex/tailoredResumes.ts` — server-owned Sonnet 5 tailoring request, factual edit validation, and generated-DOCX creation request.
- `convex/resumeDocuments.ts` — generated document ownership checks, short-lived upload/download URLs, CloudConvert conversion action, and status transitions.
- `convex/searchMatching.ts` and `convex/searches.ts` — select India jobs using preferences, then attach reusable-resume match results to the latest ten-job brief.
- `src/ResumeUpload.tsx` and `src/resumeFingerprint.ts` — calculate the content fingerprint on upload and show profile-analysis status.
- `src/ResultsScreen.tsx` and `src/ApplicationKit.css` — show evidence-based score/gaps, before/after score, credit state, DOCX/PDF choice, and conversion progress.
- `src/docxTemplate.ts` — retain locked-layout patching and add a stable generated-DOCX filename helper.
- `src/tailoredResumeDownload.ts` — retain only safe blob-download functions; remove text-to-PDF generation from this flow.

## Task 1: Define private resume-profile and deterministic-score contracts

**Files:**
- Create: `convex/resumeProfiles.ts`
- Create: `convex/resumeProfiles.test.ts`
- Create: `convex/resumeMatching.ts`
- Create: `convex/resumeMatching.test.ts`
- Modify: `convex/schema.ts`

**Interfaces:**
- Produces `ResumeProfile`, `JobEvidenceMap`, `scoreResumeMatch(input)`, and `SCORE_VERSION = 1`.
- Consumes normalized resume lines and one job's existing title, location, skills, and description.
- Produces a score and score breakdown; no component may total more than its declared weight.

- [ ] **Step 1: Write failing profile and score tests**

```ts
expect(scoreResumeMatch({
  skillCoverage: { requiredSupported: 3, requiredTotal: 3, preferredSupported: 1, preferredTotal: 2 },
  roleFit: 'strong', responsibilityFit: 'partial', workArrangementFits: true, isIndiaRole: true,
})).toEqual({ score: 88, skills: 36, role: 30, responsibilities: 10, workArrangement: 8, location: 2 })

expect(scoreResumeMatch({
  skillCoverage: { requiredSupported: 0, requiredTotal: 2, preferredSupported: 0, preferredTotal: 0 },
  roleFit: 'none', responsibilityFit: 'none', workArrangementFits: false, isIndiaRole: true,
}).score).toBe(2)

expect(isReusableProfile({ sourceHash: 'same', schemaVersion: 1 }, 'same', 1)).toBe(true)
expect(isReusableProfile({ sourceHash: 'old', schemaVersion: 1 }, 'new', 1)).toBe(false)
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npm test -- convex/resumeProfiles.test.ts convex/resumeMatching.test.ts`

Expected: FAIL because the profile and score helpers do not exist.

- [ ] **Step 3: Implement the contracts and the fixed calculation**

```ts
export const PROFILE_SCHEMA_VERSION = 1
export const SCORE_VERSION = 1
export type FitLevel = 'none' | 'partial' | 'strong'

export type JobEvidenceMap = {
  requiredSupported: number; requiredTotal: number
  preferredSupported: number; preferredTotal: number
  roleFit: FitLevel; responsibilityFit: FitLevel
  workArrangementFits: boolean; isIndiaRole: boolean
  matchedEvidence: { requirement: string; resumeLine: number }[]
  gaps: string[]
}

const fitPoints = (fit: FitLevel, maximum: number) => fit === 'strong' ? maximum : fit === 'partial' ? maximum / 2 : 0

export function scoreResumeMatch(input: Omit<JobEvidenceMap, 'matchedEvidence' | 'gaps'>) {
  const required = input.requiredTotal ? Math.min(1, input.requiredSupported / input.requiredTotal) : 1
  const preferred = input.preferredTotal ? Math.min(1, input.preferredSupported / input.preferredTotal) : 1
  const skills = Math.round(40 * (required * 0.7 + preferred * 0.3))
  const role = fitPoints(input.roleFit, 30)
  const responsibilities = fitPoints(input.responsibilityFit, 20)
  const workArrangement = input.workArrangementFits ? 8 : 0
  const location = input.isIndiaRole ? 2 : 0
  return { score: skills + role + responsibilities + workArrangement + location, skills, role, responsibilities, workArrangement, location }
}
```

Define `ResumeProfile` as roles, skills, years of experience, achievements, education, and `evidenceLineNumbers`. Every value must be supported by one or more line numbers from normalized extracted text.

- [ ] **Step 4: Add schema tables and indexes**

```ts
resumeProfiles: defineTable({
  ownerId: v.string(), sourceResumeId: v.id('resumes'), sourceHash: v.string(), schemaVersion: v.number(),
  status: v.union(v.literal('queued'), v.literal('generating'), v.literal('ready'), v.literal('failed')),
  profile: v.optional(v.any()), failureMessage: v.optional(v.string()), createdAt: v.number(), updatedAt: v.number(),
}).index('by_owner_hash_version', ['ownerId', 'sourceHash', 'schemaVersion']).index('by_owner', ['ownerId']),
resumeJobMatches: defineTable({
  ownerId: v.string(), sourceHash: v.string(), jobId: v.id('jobs'), jobLastUpdatedAt: v.number(), scoreVersion: v.number(),
  score: v.number(), skillsScore: v.number(), roleScore: v.number(), responsibilitiesScore: v.number(), workArrangementScore: v.number(), locationScore: v.number(),
  evidence: v.array(v.object({ requirement: v.string(), resumeLine: v.number() })), gaps: v.array(v.string()), createdAt: v.number(),
}).index('by_owner_hash_job', ['ownerId', 'sourceHash', 'jobId']).index('by_source_hash', ['sourceHash']),
```

Add `contentHash: v.optional(v.string())` to `resumes` so old resumes remain readable until re-uploaded.

- [ ] **Step 5: Run focused tests and type generation**

Run: `npm test -- convex/resumeProfiles.test.ts convex/resumeMatching.test.ts && npx convex dev --once`

Expected: PASS; generated Convex types include the new tables.

- [ ] **Step 6: Commit the independently testable domain layer**

```bash
git add convex/schema.ts convex/resumeProfiles.ts convex/resumeProfiles.test.ts convex/resumeMatching.ts convex/resumeMatching.test.ts convex/_generated
git commit -m "feat: add reusable resume matching contracts"
```

## Task 2: Create and reuse the factual profile after resume upload

**Files:**
- Modify: `src/ResumeUpload.tsx`
- Create: `src/resumeFingerprint.ts`
- Create: `src/resumeFingerprint.test.ts`
- Modify: `convex/resumes.ts`
- Modify: `convex/resumeProfiles.ts`

**Interfaces:**
- `sha256Text(text: string): Promise<string>` returns lowercase hex for normalized extracted resume text.
- `resumes.save` accepts `contentHash` and queues `internal.resumeProfiles.ensureForResume({ resumeId })`.
- `resumeProfiles.ensureForResume` returns an existing ready/queued profile for the same owner, hash, and schema version; it creates only a needed new profile. Re-uploading identical text therefore reuses the earlier profile.

- [ ] **Step 1: Write failing fingerprint and reuse tests**

```ts
await expect(sha256Text('Built APIs\n')).resolves.toBe(await sha256Text(' built   APIs '))
expect(planProfileGeneration({ existing: 'ready', sameHash: true, sameVersion: true })).toEqual({ action: 'reuse' })
expect(planProfileGeneration({ existing: 'ready', sameHash: false, sameVersion: true })).toEqual({ action: 'generate' })
```

- [ ] **Step 2: Run focused tests to verify they fail**

Run: `npm test -- src/resumeFingerprint.test.ts convex/resumeProfiles.test.ts`

Expected: FAIL because upload fingerprints and reuse planning are missing.

- [ ] **Step 3: Implement content hashing and upload handoff**

```ts
export async function sha256Text(text: string) {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim()
  const bytes = new TextEncoder().encode(normalized)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('')
}
```

In `ResumeUpload`, calculate `contentHash` after successful text extraction and pass it to `resumes.save`. In `resumes.save`, add `contentHash` to the resume row and schedule `ensureForResume` after inserting the resume.

- [ ] **Step 4: Implement profile generation with strict evidence validation**

Use the server-only `ANTHROPIC_API_KEY` and this fixed model configuration:

```ts
{ model: 'claude-sonnet-5', max_tokens: 2800, output_config: { effort: 'medium' } }
```

The request must ask for JSON only. Before saving it, validate every evidence line number is an integer within the normalized resume-line array, deduplicate strings, reject a profile with no roles and no skills, and mark the row `failed` with a user-safe message on any provider or parse error. Never store Anthropic request IDs, hidden reasoning, or a raw model response.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- src/resumeFingerprint.test.ts convex/resumeProfiles.test.ts && npx convex dev --once`

Expected: PASS; a second request for an unchanged resume reuses the existing profile and does not schedule another model call.

- [ ] **Step 6: Commit profile reuse**

```bash
git add src/ResumeUpload.tsx src/resumeFingerprint.ts src/resumeFingerprint.test.ts convex/resumes.ts convex/resumeProfiles.ts convex/_generated
git commit -m "feat: reuse factual profile for unchanged resumes"
```

## Task 3: Add one batched, evidence-based match scan for the ten-job brief

**Files:**
- Modify: `convex/searchMatching.ts`
- Modify: `convex/searchMatching.test.ts`
- Modify: `convex/searches.ts`
- Modify: `convex/resumeMatching.ts`
- Modify: `convex/resumeMatching.test.ts`

**Interfaces:**
- `getLiveSuggestions` returns ten India-scoped preference candidates but no longer treats a matching city as an eligibility requirement.
- `resumeMatching.matchBrief({ ownerId, resumeId, jobIds })` sends the ready profile and all ten jobs in exactly one Anthropic request.
- `resumeJobMatches` is reused only when `sourceHash`, `jobId`, `jobLastUpdatedAt`, and `SCORE_VERSION` are unchanged.

- [ ] **Step 1: Write failing tests for low location weight and cache reuse**

```ts
expect(getLiveSuggestions(preferences, [indiaJobInAnotherCity])).toHaveLength(1)
expect(scoreResumeMatch(strongEvidenceWithNoCityMatch).location).toBe(2)
expect(matchCacheKey({ sourceHash: 'same-resume', jobId: 'j1', jobLastUpdatedAt: 9, scoreVersion: 1 }))
  .toBe(matchCacheKey({ sourceHash: 'same-resume', jobId: 'j1', jobLastUpdatedAt: 9, scoreVersion: 1 }))
```

- [ ] **Step 2: Run focused tests to verify they fail**

Run: `npm test -- convex/searchMatching.test.ts convex/resumeMatching.test.ts`

Expected: FAIL because location is still a city filter and there is no match cache.

- [ ] **Step 3: Change candidate selection without broadening beyond India**

Retain company-avoidance and India-only source checks. Keep role and entered-skill preference ranking only to select a sensible candidate set. Remove `cityMatch` from the eligibility condition; use city/work arrangement only as the 8+2 score components after resume analysis.

- [ ] **Step 4: Implement the single Sonnet match request and deterministic persistence**

Send only the structured profile and each job's title, location, listed skills, and description. The expected JSON shape is:

```ts
type BatchMatchResponse = { matches: Array<{
  jobId: string
  required: { supported: string[]; missing: string[] }
  preferred: { supported: string[]; missing: string[] }
  roleFit: 'none' | 'partial' | 'strong'
  responsibilityFit: 'none' | 'partial' | 'strong'
  evidence: { requirement: string; resumeLine: number }[]
}> }
```

Reject unknown or duplicate job IDs, unsupported evidence line numbers, and more than five visible gaps. Derive all component totals through `scoreResumeMatch`; do not accept a numeric score from the model. Save one match row per job, then patch the current `jobSuggestions` rows with its final score, short evidence-based explanation, and gap list.

- [ ] **Step 5: Make search completion wait for a usable score state**

When a ready profile is available, `runSearch` saves the ten preliminary rows, performs the one batch scan, then marks the search complete. When profile generation is still queued, mark the search `matching`, schedule a retry, and do not show a made-up resume score. On profile failure, finish with the existing preference score labelled `Preferences match` and a retryable profile-status message.

- [ ] **Step 6: Run the matching test set**

Run: `npm test -- convex/searchMatching.test.ts convex/searches.test.ts convex/resumeMatching.test.ts`

Expected: PASS; an unchanged resume/job pair, including an identical re-upload, does not make a second model request, and an updated job description does.

- [ ] **Step 7: Commit matching**

```bash
git add convex/searchMatching.ts convex/searchMatching.test.ts convex/searches.ts convex/searches.test.ts convex/resumeMatching.ts convex/resumeMatching.test.ts convex/schema.ts convex/_generated
git commit -m "feat: score job briefs from reusable resume evidence"
```

## Task 4: Add an auditable 20-credit tailoring ledger

**Files:**
- Create: `convex/credits.ts`
- Create: `convex/credits.test.ts`
- Modify: `convex/schema.ts`

**Interfaces:**
- `TAILORED_RESUME_CREDIT_COST = 20`.
- `reserveTailoring(ownerId, documentId)`, `completeReservation(reservationId)`, and `releaseReservation(reservationId)` create append-only ledger entries.
- A profile or ten-job match scan never calls the ledger.

- [ ] **Step 1: Write failing ledger tests**

```ts
expect(availableCredits([{ amount: 40, status: 'completed' }, { amount: -20, status: 'reserved' }])).toBe(20)
expect(canStartTailoring([{ amount: 20, status: 'completed' }])).toBe(true)
expect(canStartTailoring([{ amount: 19, status: 'completed' }])).toBe(false)
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- convex/credits.test.ts`

Expected: FAIL because credit helpers and a ledger table do not exist.

- [ ] **Step 3: Add the ledger schema and helpers**

```ts
creditLedger: defineTable({
  ownerId: v.string(), amount: v.number(), kind: v.union(v.literal('grant'), v.literal('tailored_resume')),
  status: v.union(v.literal('completed'), v.literal('reserved'), v.literal('released')),
  referenceId: v.string(), expiresAt: v.optional(v.number()), createdAt: v.number(),
}).index('by_owner', ['ownerId']).index('by_owner_reference', ['ownerId', 'referenceId']),
```

Use a 15-minute reservation expiry. Release expired reservations before calculating available credits, and reject duplicate active reservations for the same generated document.

- [ ] **Step 4: Run the focused test and generate types**

Run: `npm test -- convex/credits.test.ts && npx convex dev --once`

Expected: PASS; only a completed generated file converts a reservation into a completed charge.

- [ ] **Step 5: Commit the ledger**

```bash
git add convex/schema.ts convex/credits.ts convex/credits.test.ts convex/_generated
git commit -m "feat: add auditable tailored resume credits"
```

## Task 5: Replace personal AI keys with server-owned Sonnet 5 tailoring

**Files:**
- Modify: `convex/tailoredResumes.ts`
- Modify: `convex/tailoredResumes.test.ts`
- Delete: `src/tailoredResumeConnection.ts`
- Modify: `src/ResultsScreen.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- `tailoredResumes.create({ jobId, templateSlots, format })` accepts no provider, API key, model, or effort from the browser.
- It returns `{ documentId, status: 'creating' | 'ready' | 'failed', beforeScore, afterScore?: number }`.
- The model is exactly `claude-sonnet-5` with high effort; all edit safety checks remain deterministic.

- [ ] **Step 1: Write failing provider-boundary and factual-rewrite tests**

```ts
expect(Object.keys(createArgsValidator.fields)).not.toContain('apiKey')
expect(Object.keys(createArgsValidator.fields)).not.toContain('model')
expect(isSafeExperienceRewrite('Led a 5-person team.', 'Managed a 10-person team.')).toBe(false)
expect(canCompleteTailoring({ mode: 'ai', docxStorageId: 'stored' })).toBe(true)
expect(canCompleteTailoring({ mode: 'layout_protected' })).toBe(false)
```

- [ ] **Step 2: Run focused tests to verify they fail**

Run: `npm test -- convex/tailoredResumes.test.ts`

Expected: FAIL because the client controls provider data and there is no generated-document state.

- [ ] **Step 3: Implement server-owned generation and document rows**

Add a `generatedResumeDocuments` table with owner, source resume, job, format, status, source DOCX storage ID, output storage ID, before/after score, failure message, and timestamps. Reserve 20 credits before the Anthropic call. Apply existing `templateReplacements` rules. Upload the patched DOCX to private Convex storage and mark it ready for DOCX requests; if every validation path fails, release the reservation and do not create a downloadable document.

The prompt must require only shorter, factual replacements and must include the match evidence/gaps for the selected job. Do not include other jobs in a tailoring prompt.

- [ ] **Step 4: Recalculate after-tailoring score honestly**

Run the same evidence matcher against the generated replacement text and selected job. Persist `afterScore` only when its evidence survives validation. If no supported score component changes, return the original score and say `Tailoring improved clarity but did not change your evidence-based match score.`

- [ ] **Step 5: Remove personal-key UX and run tests**

Remove imports, local-storage state, and the AI connection requirement. Use only `ANTHROPIC_API_KEY` in Convex. Run:

Run: `npm test -- convex/tailoredResumes.test.ts src/tailoredResumeDownload.test.ts && npx convex dev --once`

Expected: PASS; a browser request cannot select a provider or receive a secret.

- [ ] **Step 6: Commit tailoring**

```bash
git add convex/tailoredResumes.ts convex/tailoredResumes.test.ts convex/schema.ts src/ResultsScreen.tsx src/App.tsx convex/_generated
git rm src/tailoredResumeConnection.ts
git commit -m "feat: tailor one resume with CareerPilot AI"
```

## Task 6: Convert the generated DOCX to a private PDF

**Files:**
- Create: `convex/resumeDocuments.ts`
- Create: `convex/resumeDocuments.test.ts`
- Modify: `convex/schema.ts`
- Modify: `src/tailoredResumeDownload.ts`
- Modify: `src/tailoredResumeDownload.test.ts`
- Modify: `src/ResultsScreen.tsx`

**Interfaces:**
- `resumeDocuments.requestPdf({ documentId })` requires the document owner and changes `ready_docx` to `pdf_queued`.
- `internal.resumeDocuments.convertPdf({ documentId })` creates one CloudConvert `import/url → convert(docx,pdf) → export/url` job, downloads the PDF to Convex storage, and returns `ready_pdf`.
- `resumeDocuments.mine({ documentId })` returns only an owner-scoped temporary download URL.

- [ ] **Step 1: Write failing conversion-state tests**

```ts
expect(nextDocumentStatus('ready_docx', 'request_pdf')).toBe('pdf_queued')
expect(nextDocumentStatus('pdf_queued', 'conversion_succeeded')).toBe('ready_pdf')
expect(nextDocumentStatus('pdf_queued', 'conversion_failed')).toBe('failed')
expect(canDownload('ready_pdf')).toBe(true)
expect(canDownload('pdf_queued')).toBe(false)
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- convex/resumeDocuments.test.ts src/tailoredResumeDownload.test.ts`

Expected: FAIL because conversion states and owner-scoped files do not exist.

- [ ] **Step 3: Implement the private conversion action**

Generate a short-lived Convex storage URL for the generated DOCX. Call CloudConvert from the Convex action with server-only `CLOUDCONVERT_API_KEY` and this three-task job:

```ts
{
  tasks: {
    import_docx: { operation: 'import/url', url: sourceUrl },
    convert_pdf: { operation: 'convert', input: 'import_docx', input_format: 'docx', output_format: 'pdf' },
    export_pdf: { operation: 'export/url', input: 'convert_pdf' },
  },
  tag: documentId,
}
```

Poll the provider job no more than once every two seconds for 30 seconds. On completion, fetch the returned PDF URL server-side, verify the response `Content-Type` begins with `application/pdf` and size is at most 10 MB, save it to Convex storage, then mark the document `ready_pdf`. On timeout, provider error, unexpected MIME type, or download error, mark failed and release the associated credit reservation.

- [ ] **Step 4: Complete credits at the correct point**

For a DOCX request, complete the reservation only after the generated DOCX is stored. For a PDF request, complete it only after the PDF is stored. A PDF conversion failure must leave the user with zero charge and no downloadable output.

- [ ] **Step 5: Remove the plain-text PDF implementation**

Delete `downloadPdf` and the `pdf` branch from `downloadTailoredResume`; keep `downloadResumeBlob` as the safe final browser download helper. This prevents a PDF that silently loses the user’s original Word layout.

- [ ] **Step 6: Run conversion tests**

Run: `npm test -- convex/resumeDocuments.test.ts src/tailoredResumeDownload.test.ts && npx convex dev --once`

Expected: PASS; only the document owner obtains a download URL, and a failed conversion is not charged.

- [ ] **Step 7: Commit PDF conversion**

```bash
git add convex/resumeDocuments.ts convex/resumeDocuments.test.ts convex/schema.ts src/tailoredResumeDownload.ts src/tailoredResumeDownload.test.ts src/ResultsScreen.tsx convex/_generated
git commit -m "feat: convert tailored DOCX resumes to PDF"
```

## Task 7: Present score evidence, tailoring potential, credits, and downloads

**Files:**
- Modify: `src/liveJobs.ts`
- Modify: `src/ResultsScreen.tsx`
- Modify: `src/ApplicationKit.css`
- Create: `src/resumeMatchView.ts`
- Create: `src/resumeMatchView.test.ts`

**Interfaces:**
- `formatMatchView(match)` returns score label, evidence, up to five gaps, and `tailoringPotential` (`low`, `medium`, `high`).
- The job card and full role view show `Resume match` only for ready evidence-based matches; fallback state says `Preferences match`.
- The application kit lets the user choose DOCX or PDF before spending credits.

- [ ] **Step 1: Write failing view-model tests**

```ts
expect(formatMatchView({ score: 72, gaps: ['Kubernetes'], evidence: [{ requirement: 'React', resumeLine: 8 }] }))
  .toMatchObject({ label: 'Good fit', tailoringPotential: 'medium', visibleGaps: ['Kubernetes'] })
expect(formatScoreChange(68, 76)).toBe('+8 points after tailoring')
expect(formatScoreChange(68, 68)).toBe('No evidence-based score change')
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- src/resumeMatchView.test.ts`

Expected: FAIL because the score view model does not exist.

- [ ] **Step 3: Build the score and download user experience**

Show the numeric score, component explanation, matched evidence, and real gaps in the full job view. Use `Tailoring potential` only for gaps that are supported elsewhere in the resume and can be surfaced by wording or ordering; never call a genuinely missing qualification tailorable.

In the application kit show: `20 credits`, a DOCX/PDF selector, a single `Tailor resume` button, an in-progress conversion state, and a `Download DOCX` or `Download PDF` action only when the owner-scoped document query is ready. Do not automatically create files for all ten jobs.

- [ ] **Step 4: Add accessibility and visual checks**

The button must announce `Creating tailored resume`, `Converting to PDF`, `Ready to download`, or the exact retry-safe error through `role="status"`. Keep keyboard focus on the action panel after a status change. Verify desktop and 390px mobile layouts manually.

- [ ] **Step 5: Run UI tests and build**

Run: `npm test -- src/resumeMatchView.test.ts src/liveJobs.test.ts && npm run build`

Expected: PASS; TypeScript has no error and a result card cannot claim a resume score before one exists.

- [ ] **Step 6: Commit the UI**

```bash
git add src/liveJobs.ts src/ResultsScreen.tsx src/ApplicationKit.css src/resumeMatchView.ts src/resumeMatchView.test.ts
git commit -m "feat: show resume match and tailored downloads"
```

## Task 8: Configure production, verify privacy, and release

**Files:**
- Modify: `.env.example` or deployment-environment documentation if present
- Modify: privacy/help copy where resume processing is described
- Modify: `README.md` only if it contains setup variables

**Interfaces:**
- Required production secrets: `ANTHROPIC_API_KEY` and `CLOUDCONVERT_API_KEY`.
- No front-end bundle, local storage entry, Convex query, or error string exposes either value.

- [ ] **Step 1: Write the release checklist in project documentation**

```md
- [ ] `ANTHROPIC_API_KEY` is set only in Convex production environment.
- [ ] `CLOUDCONVERT_API_KEY` is set only in Convex production environment.
- [ ] Privacy copy says a requested PDF is sent to CloudConvert for conversion.
- [ ] Profile scan and ten-job match scan deduct no credits.
- [ ] Successful DOCX and successful PDF requests deduct exactly 20 credits once.
```

- [ ] **Step 2: Run the complete local verification set**

Run: `npm test && npm run lint && npm run build && npx convex dev --once`

Expected: all tests pass; note existing lint warnings separately if they remain.

- [ ] **Step 3: Perform manual staging checks with a non-sensitive test resume**

1. Upload the same resume twice and confirm the second upload reuses its factual profile.
2. Open the ten-job brief and confirm every displayed score has evidence and location contributes only two points.
3. Tailor one job as DOCX and confirm one 20-credit charge appears only after download is ready.
4. Tailor one job as PDF and confirm the converted PDF opens, preserves the Word layout, and is private to the signed-in owner.
5. Force an Anthropic failure and a conversion failure; confirm neither spends credits.
6. Confirm replacing or deleting the resume removes its profiles, match rows, and generated private documents.

- [ ] **Step 4: Deploy and verify production**

Run: `git push origin main`

Then deploy the clean commit to Vercel/Convex production, set the two server secrets, and repeat the DOCX and PDF manual checks with a test account. Do not deploy unrelated uncommitted tailored-resume work with this feature.

- [ ] **Step 5: Commit release documentation**

```bash
git add .env.example README.md docs
git commit -m "docs: document private resume AI processing"
```

## Self-review

- Reusable profile: Tasks 1–2 create a content-hash-bound private profile and reuse it without a second AI call.
- Selected ten jobs: Task 3 performs one batch match request, caches unchanged resume/job pairs, and uses the agreed score formula.
- Low location impact: Task 3 removes city eligibility and Task 1 fixes location at two points.
- Tailor only on request: Tasks 4–5 create a document only from the selected job action and charge only a completed artifact.
- PDF output: Task 6 converts the actual generated DOCX instead of using the existing plain-text PDF code.
- Privacy and user clarity: Tasks 5–8 remove browser API keys, retain owner checks, document CloudConvert processing, and show evidence and status in the interface.
