# CareerPilot P0 AI Implementation Audit

**Audit scope:** Read-only repository audit of CareerPilot's P0 AI, search, matching, and resume capabilities. No code was changed and no live AI calls were run.

## 1. Executive summary

| P0 capability | Status | Depth /5 | AI used? | Production-ready? |
|---|---|---:|---|---|
| Resume parsing into candidate intelligence | PARTIALLY IMPLEMENTED | 3 | Gemini | No |
| AI onboarding suggestions | PARTIALLY IMPLEMENTED | 2 | No | No |
| JD extraction / normalization | PARTIALLY IMPLEMENTED | 2 | No | No |
| Semantic candidate ↔ job matching | PARTIALLY IMPLEMENTED | 3 | Gemini | No |
| Daily Brief ranking | PARTIALLY IMPLEMENTED | 3 | Indirectly | No |
| Why-this-role explanations | PARTIALLY IMPLEMENTED | 2 | Gemini + templates | No |
| Gap / caution analysis | PARTIALLY IMPLEMENTED | 2 | Gemini | No |
| Grounded resume tailoring | IMPLEMENTED | 4 | Gemini | Mostly |
| Tailoring validation / grounding guard | IMPLEMENTED | 4 | No, deterministic | Mostly |

**Implemented:** 2/9  
**Partial:** 7/9  
**Mock:** 0/9  
**Missing:** 0/9

The strongest real AI capability is grounded resume tailoring. The weakest foundation is the missing shared candidate/job intelligence layer: resume facts, job requirements, ranking, explanations, and cautions are implemented in separate fragments rather than one consistent system.

Mock-like sub-parts found during the audit:

- The new onboarding role and skill suggestions are static frontend lists, not AI-generated or resume-derived.
- The provider-selection UI is not connected to the backend's actual model selection.
- The UI says “Strongest matches first”, but post-Gemini scores do not change job rank.

## 2. Architecture map

### Resume ingestion

```text
PDF/DOCX upload in browser
↓
Browser extracts readable text
↓
Browser detects skills with a fixed regex list
↓
Convex resumes.save
↓
resumes table stores raw extracted text + detectedSkills
↓
Async Gemini resume profile generation
↓
resumeProfiles table
↓
Used by resume matching
```

Evidence: `src/ResumeUpload.tsx:30`, `convex/resumes.ts`, `convex/resumeProfiles.ts:136`.

### Master Resume ingestion

```text
Master Resume upload → active master record → deterministic raw-text experience parser
→ masterResumeStructures → deterministic template/master experience matching
→ only matched Master blocks supplied to tailoring.
```

Evidence: `convex/masterResumeStructure.ts`, `convex/ai/experienceMatching.ts`, `convex/ai/tailoringMasterProvenance.ts:35`.

### Job ingestion

```text
Approved Greenhouse boards → Greenhouse public API → India + IT-role filtering
→ HTML stripping, city parsing, fixed skill-list scanning
→ jobs + jobSnapshots + sourceRuns.
```

Evidence: `convex/greenhouse.ts:137`, `convex/greenhouseNormalization.ts:71`, `convex/crons.ts:6`.

### Job matching / Daily Brief

```text
Preferences + active jobs → deterministic initial ranking → top 10 jobs only
→ Gemini batch match against profile + raw numbered resume
→ resumeJobMatches cache → jobSuggestions score/explanation patched
→ ResultsScreen renders original rank order.
```

Evidence: `convex/searchMatching.ts:57`, `convex/searches.ts:255`, `convex/resumeMatching.ts:167`.

### Resume tailoring

```text
Job in latest Daily Brief → browser extracts DOCX slots → tailoredResumes.generate
→ template resume + JD + matched Master evidence → Gemini structured response
→ schema/grounding/rewrite/reorder/merge validation → preview
→ browser patches original DOCX → DOCX/PDF download.
```

Evidence: `src/ResultsScreen.tsx:102`, `convex/tailoredResumes.ts:314`, `convex/ai/tailoringPrompt.ts:40`, `src/docxTemplate.ts:165`.

## 3. Detailed capability analysis

### P0.1 Resume parsing into candidate intelligence

**Status:** PARTIALLY IMPLEMENTED  
**Depth:** 3/5

CareerPilot extracts PDF/DOCX text and creates a reusable Gemini profile, cached by resume hash and profile schema version. The stored profile has skills, role titles, years per role, achievements, education, total years, and source line numbers.

Evidence: `convex/resumeProfiles.ts:11`, `convex/schema.ts:21`.

Flow: browser PDF.js/Mammoth extraction → fixed regex skills → `resumes.save` → asynchronous profile action → Gemini numbered-line JSON → type/range parser → `resumeProfiles` storage → matching consumer.

The model is `gemini-3.6-flash`, medium thinking, 2,800 maximum output tokens, 30-second timeout: `convex/resumeProfiles.ts:152`. The prompt says to extract factual data only and cite source line numbers: `convex/resumeProfiles.ts:78`.

Missing structured intelligence: employment/company/date records, experience-level responsibilities, projects, domains, technology versus skill distinction, leadership evidence, product/engineering/data classification, and claim-to-source verification.

Risk: citations are range-checked, but the code does not verify that a claimed fact appears on the cited line. `profile` is stored as `v.any()`. `convex/resumeProfiles.test.ts` covers parser/reuse logic, not live model accuracy or claim-to-line proof.

### P0.2 AI-assisted onboarding suggestions

**Status:** PARTIALLY IMPLEMENTED  
**Depth:** 2/5

The browser saves regex-detected skills from an uploaded resume. The older preferences flow can prefill from this deterministic data. The new onboarding page does not query `resumeProfiles.mine`; its role and skill suggestions are static literals.

Evidence: `src/OnboardingScreen.tsx:13`, `src/OnboardingScreen.tsx:270`, `src/resumeSkills.ts`.

Not implemented: AI/profile-derived years of experience, target roles, domains, specializations, or priority skills. Any “AI suggested from your resume” copy would be inaccurate for the current new onboarding UI.

### P0.3 Job description extraction and normalization

**Status:** PARTIALLY IMPLEMENTED  
**Depth:** 2/5

Jobs arrive from approved Greenhouse boards. CareerPilot filters India and IT roles, strips HTML, detects cities, and scans a fixed skill list. The `jobs` table stores title, company, normalized company, location, cities, plain/HTML description, fixed-list skills, URL, timestamps, and active state.

Evidence: `convex/greenhouseNormalization.ts:29`, `convex/greenhouse.ts:49`, `convex/greenhouse.ts:137`, `convex/schema.ts:154`.

No AI is used in ingestion. Missing normalized Job Intelligence includes role, seniority, required years, work style, responsibilities, required/preferred skills, hard requirements, domain, education/certification, job type, and salary. `jobRoleSummaries` is a separate on-demand job-only summary and is not used in matching/ranking.

### P0.4 Semantic candidate ↔ job matching

**Status:** PARTIALLY IMPLEMENTED  
**Depth:** 3/5

CareerPilot uses a hybrid approach: deterministic filtering/initial ranking, Gemini batch matching for only the top 10 candidates, then deterministic numeric scoring. No embeddings, vector database, or vector similarity implementation was found.

Actual hard filters: avoided company, remote work preference, and India filtering at ingestion. Salary, job type, notice period, required experience, seniority, domain, education, and city-as-a-filter are not enforced. Evidence: `convex/searchMatching.ts:61`.

Gemini receives the profile, raw numbered resume, and up to 10 raw job descriptions. It returns required/preferred support and gaps, role/responsibility fit, and resume-line references: `convex/resumeMatching.ts:118`.

Score: skills coverage up to 40; role fit up to 30; responsibility fit up to 20; work arrangement up to 8; India location 2. Evidence: `convex/resumeMatching.ts:37`.

Critical gap: Gemini updates `matchScore` but does not update `rank`; the Daily Brief query still orders by the original deterministic rank. Evidence: `convex/resumeMatching.ts:161`, `convex/searches.ts:49`.

### P0.5 Daily Brief ranking

**Status:** PARTIALLY IMPLEMENTED  
**Depth:** 3/5

The Daily Brief is real: searches are scheduled, active jobs refresh, a limited result set is stored, and the latest run is rendered. Evidence: `convex/searches.ts:121`, `convex/searches.ts:255`.

Initial ranking uses title overlap, skill text overlap, city, remote, recency, and direct-role before related-role ordering. It caps the pool at 10: `convex/searchMatching.ts:82`.

Apply/Reject history, connection strength, salary, job type, experience/seniority/domain fit, and final AI score do not rank the brief. The UI claim “Strongest matches first” is not guaranteed after Gemini score updates: `src/ResultsScreen.tsx:265`.

### P0.6 “Why this role?” explanations

**Status:** PARTIALLY IMPLEMENTED  
**Depth:** 2/5

Initial explanations use deterministic role/city/skill overlap. Gemini later changes them to a short string such as `Resume evidence: requirement A, requirement B`: `convex/searchMatching.ts:75`, `convex/resumeMatching.ts:161`. The UI displays this under “Why it fits”: `src/ResultsScreen.tsx:200`.

The product does not show source resume quotes, direct JD-to-resume mappings, or clear preference fit. The AI role summary is job-only, not candidate-specific.

### P0.7 Gap / caution analysis

**Status:** PARTIALLY IMPLEMENTED  
**Depth:** 2/5

Gemini matching stores missing requirements in `resumeJobMatches.gaps` and `jobSuggestions.matchGaps`: `convex/resumeMatching.ts:191`, `convex/schema.ts:77`.

The frontend maps `matchGaps` and `matchEvidence`, but does not render them as user-facing cautions: `src/liveJobs.ts:60`, `src/ResultsScreen.tsx:200`. There is no explicit stretch indicator, years-of-experience comparison, salary caution, or domain/education caution because those job fields are not normalized.

### P0.8 Grounded AI resume tailoring

**Status:** IMPLEMENTED  
**Depth:** 4/5

This is the most complete P0 capability. It starts from a job in the latest Daily Brief, requires the current template resume and normal UI DOCX slots, optionally receives matched Master Resume evidence, uses structured Gemini output, supports rewrite/reorder/merge, validates before preview, and patches the original DOCX rather than recreating the document.

Evidence: `src/ResultsScreen.tsx:102`, `convex/tailoredResumes.ts:314`.

The Template Resume controls structure, chronology, and layout. Master Resume content is only usable when a Master experience deterministically matches the corresponding Template experience: `convex/ai/tailoringPrompt.ts:193`, `convex/ai/tailoringMasterProvenance.ts:35`.

Gemini receives job title/company/JD, full template text capped at 18,000 characters, structured resume blocks, 120% limits, and matched Master blocks only: `convex/ai/tailoringPrompt.ts:208`.

Canonical response:

```json
{
  "analysis": { "matched": [], "understated": [], "missing": [] },
  "edits": [],
  "reorders": [],
  "merges": []
}
```

Evidence: `convex/ai/tailoringSchema.ts:1`.

The browser moves original paragraph XML nodes for reorders and removes only a non-target paragraph for merges: `src/docxTemplate.ts:130`.

Limits: no new bullets, no arbitrary bullet removal, no job chronology changes, only latest-Daily-Brief jobs, and normal UI requires a DOCX. Risks: edited paragraphs are flattened into a first text node, legacy no-slot code remains, malformed output can trigger a second Gemini repair call, and “only original resume” wording slightly conflicts with later Master evidence instructions.

### P0.9 Resume-tailoring validation / grounding guard

**Status:** IMPLEMENTED  
**Depth:** 4/5

Guard sequence:

```text
Gemini structured output → JSON parser/repair → response schema → analysis consistency
→ text rewrite validation → Master provenance → merge validation
→ reorder validation → accepted operations only.
```

Evidence: `convex/ai/tailoringSchema.ts:215`, `convex/ai/tailoringValidation.ts:345`.

Normal replacements enforce stable ID, editable target, duplicate protection, first 8 edits only, evidence links, 120% word/character limit, action-verb tense, numbers, acronyms, sentence count, material content, named technology rules, and protected metadata.

Master-backed edits require same-experience matched Master source IDs. Reorders must be exact permutations within an experience. Merges must be two same-experience bullets with overlap and factual preservation.

Evidence: `convex/ai/tailoringValidation.ts:192`, `convex/ai/tailoringReorderValidation.ts:47`, `convex/ai/tailoringMergeValidation.ts:137`.

**Critical end-to-end mismatch:** backend accepts normal replacement up to 120%, while browser DOCX patching rejects any per-paragraph expansion and total editable-content expansion. Evidence: `convex/ai/tailoringValidation.ts:192`, `src/docxTemplate.ts:95`. A preview can therefore be accepted but fail during file generation.

Further limits: material-content validation is deterministic rather than a general semantic proof; technology protection is a finite alias list; there is no independent second-model grounding check; logs can retain resume phrases and metrics after email/phone redaction.

## 4. Actual AI call inventory

| Purpose | Provider | Model | File / function | Config | Output / validation |
|---|---|---|---|---|---|
| Resume profile extraction | Gemini | `gemini-3.6-flash` | `resumeProfiles.ensureForResume` | medium, 2,800 tokens, 30 sec | Plain JSON; type/line-range parser |
| Resume ↔ job batch matching | Gemini | `gemini-3.6-flash` | `resumeMatching.matchSearchRun` | medium, 4,500 tokens | Plain JSON; row/line-range parser |
| Job role summary | Gemini | `gemini-3.6-flash` | `roleSummaries.generate` | 12 sec timeout; direct fetch | JSON schema requested; shallow parser |
| Resume tailoring | Gemini | `gemini-3.7-flash` | `tailoredResumes.generate` | high, 6,000 tokens, 300 sec | JSON schema + parser + validators |
| Tailoring JSON repair | Gemini | `gemini-3.7-flash` | `repairedProviderText` | low, 1,800 tokens, 60 sec | only after malformed/incomplete first response |
| Tailoring live evaluation | Gemini | production tailoring model | `scripts/tailoringEvalGemini.ts` | production-style config | eval-only synthetic cases |

Shared wrapper: `convex/gemini.ts`. Important inconsistency: `convex/roleSummaries.ts:297` uses direct Gemini `fetch` instead of the shared wrapper.

## 5. Deterministic vs AI responsibilities

| Decision | Current implementation | Recommended ownership |
|---|---|---|
| Location filtering | India filter at ingestion; weak city score | Deterministic |
| Active-job validation | Greenhouse lifecycle and `isActive` | Deterministic |
| Resume understanding | Gemini profile + frontend regex | Hybrid |
| Skill relevance | Gemini matching + fixed-list scan | Hybrid |
| Job ranking | Deterministic top 10, then AI score patch | Hybrid |
| Explanation generation | Templates + Gemini requirement labels | Hybrid |
| Salary filtering | Preference stored but unused | Deterministic |
| Resume rewriting | Gemini structured edits | AI with deterministic guard |
| Grounding validation | Deterministic validators | Deterministic |

## 6. Grounding / hallucination analysis

| Area | Risk | Why |
|---|---|---|
| Resume parsing | Medium | Prompt is conservative, but citations are not claim-verified |
| Job-match explanations | High | Model labels are not verified against exact resume/JD source text |
| Gap analysis | High | Gaps come from raw-JD model interpretation without normalized requirements |
| Resume tailoring | Medium | Strong block/provenance checks, but deterministic rules cannot prove every semantic equivalence |

Tailoring has the best source controls: stable blocks, protected metadata, Master experience isolation, source Master IDs, technology/number/acronym checks, and material-content checks.

## 7. Failure handling

| Failure | Current behavior |
|---|---|
| Bad PDF/DOCX | Browser rejects unsupported, empty, too-large, unreadable files |
| Resume profile Gemini failure | Profile marked failed; matching falls back to preferences-only brief |
| Job-source failure | Per-source failure saved; total source failure fails search; partial failure warns |
| Matching Gemini failure | Search completes with preference-only warning |
| Tailoring HTTP 429 | Rate/quota classification; no credits used |
| Tailoring 401/403 | Configuration/auth failure; no credits used |
| Tailoring 5xx/timeout | Provider unavailable; no credits used |
| Empty Gemini output | Typed empty-response failure; no credits used |
| Tailoring malformed JSON | Parser repair attempt, then one Gemini repair request |
| All edits rejected | “We couldn't make safe changes”; reservation released |
| No operations | “No meaningful safe changes”; reservation released |
| Missing current job data | Tailoring rejects; job must be in latest suggestions |
| DOCX patch failure | Generic generation error; reservation may remain until cancellation/expiry |

Tailoring outcome wording: `src/tailoringMessages.ts:4`.

## 8. Evaluation and tests

Strong tailoring tests:

- `convex/ai/tailoringSchema.test.ts`
- `convex/ai/tailoringValidation.test.ts`
- `convex/ai/tailoringMasterProvenance.test.ts`
- `convex/ai/tailoringReorderValidation.test.ts`
- `convex/ai/tailoringMergeValidation.test.ts`
- `src/docxTemplate.test.ts`
- `convex/tailoredResumes.test.ts`

There is a synthetic tailoring evaluation suite covering analysis, edit quality, safety, provider-error separation, categories, and optional live Gemini runs:

- `convex/ai/evals/tailoringEval.ts:20`
- `convex/ai/evals/tailoringEvalCases.ts:57`
- `scripts/tailoringEvalRunner.ts`

Optional live commands:

```powershell
npm.cmd run eval:tailoring
npm.cmd run eval:tailoring -- --case=master-backed-project-delivery --runs=3
```

Test gaps: no end-to-end final-rank test, no profile-driven onboarding test, no source-text verification for every profile/matching claim, no live evaluation for matching/ranking/explanations, and no browser test proving backend and DOCX length limits agree.

## 9. Duplication / architecture problems

1. Resume intelligence is fragmented between frontend regex skills, Gemini profiles, Master Resume structures, and repeated raw-resume prompts.
2. Job intelligence is fragmented between fixed-list skills, raw JDs in matching, and separate role summaries.
3. Matching and ranking are disconnected: scores change, rank does not.
4. Gemini transport is duplicated in `roleSummaries.ts`.
5. Browser DOCX and backend validators disagree on length.
6. Legacy non-slot tailoring remains alongside the safe structured path.

## 10. P0 dependency graph

### Current

```text
Raw resume text
├─ browser regex skill detection → detectedSkills
├─ Gemini profile → resumeProfiles
├─ Master raw-text parser → masterResumeStructures
└─ tailoring prompt

Preferences + active Greenhouse jobs → deterministic top 10 suggestions
→ Gemini matching only for that set → stored scores/gaps/evidence
→ Daily Brief keeps original deterministic order.

Template blocks + matched Master blocks + raw JD → Gemini tailoring
→ deterministic validation → browser DOCX patch.
```

### Recommended

```text
Resume ingestion → verified Candidate Intelligence → onboarding review suggestions
→ candidate ↔ normalized Job Intelligence matching → ranked Daily Brief
→ grounded reasons + cautions.

Template Resume structure + matched Master evidence + normalized job requirements
→ tailoring planner → grounding validator → DOCX output.
```

## 11. Highest-risk findings

### Critical

1. AI match scores do not reorder the Daily Brief.
2. Backend and browser DOCX length rules conflict.
3. Onboarding suggestion UI is static, not resume intelligence.

### High

4. Only initial deterministic top 10 jobs receive semantic evaluation.
5. Resume-profile and matching citations are not claim-to-source verified.
6. Job requirements are repeatedly inferred from raw JDs rather than stored.
7. “Why it fits” is thin and weakly grounded.
8. Gaps are stored but not shown to users.

### Medium

9. Diagnostic logs may retain resume snippets after email/phone redaction.
10. Changed DOCX paragraphs may lose inline run formatting.
11. Named-technology validation has a finite alias list.
12. Merge length code requires shorter/equal combined output, despite the intended more flexible merge threshold.

## 12. P0 gap list

### Already implemented well

- Resume ownership and storage boundaries.
- Readable resume extraction.
- Greenhouse refresh/active-job lifecycle.
- Structured tailoring output.
- Stable block IDs and protected metadata.
- Master Resume experience isolation.
- Tailoring credit reservation/release flow.
- Tailoring evaluation harness.

### Implemented but needs strengthening

- Gemini resume profile depth and source verification.
- Gemini matching grounding and final reranking.
- Daily Brief use of all saved preferences.
- Evidence-backed explanations and user-facing cautions.
- Browser/backend DOCX rule alignment.
- Tailoring-log privacy controls.

### UI exists but backend/AI does not

- New onboarding role/skill suggestions are static.
- No AI-based years/role/domain/specialization prefill.
- “Strongest matches first” is not guaranteed.
- Provider-selection UI is not connected to active backend model selection.

### Completely missing

- Rich shared Candidate Intelligence entity.
- Stored normalized Job Intelligence entity.
- Embedding/vector semantic matching.
- Feedback-driven ranking from Apply/Reject history.
- User-facing gap/caution explanations.
- Real post-tailoring score recalculation.

## 13. Recommended next work

### P0-A — Fix immediately

1. **Re-rank after Gemini matching.**
   - Why: the Daily Brief keeps its pre-AI order.
   - Affected: `convex/resumeMatching.ts`, `convex/searches.ts`, `jobSuggestions`.
   - Approach: sort by final score after matching and rewrite ranks per search run.

2. **Align DOCX client constraints with backend validation.**
   - Why: a valid preview can fail during file generation.
   - Affected: `src/docxTemplate.ts`, `convex/ai/tailoringValidation.ts`.
   - Approach: one shared length contract and shared test examples.

3. **Remove or wire up static AI-like onboarding suggestions.**
   - Why: static suggestions can mislead users.
   - Affected: `src/OnboardingScreen.tsx`, `convex/resumeProfiles.ts`.
   - Approach: label them as examples or populate from the stored profile with user review.

### P0-B — Strengthen

4. **Build verified Candidate Intelligence.**
   - Why: the current profile is too shallow for onboarding, matching, explanations, and cautions.
   - Approach: add experience/company/date/responsibility/domain/project/leadership data with source spans and claim verification.

5. **Build normalized Job Intelligence during ingestion.**
   - Why: matching should not reinterpret a raw JD each run.
   - Approach: retain original JD but store role, seniority, requirements, preferred skills, domain, experience, and source evidence.

6. **Make explanations and cautions evidence-first.**
   - Why: users need clear reasons they can trust.
   - Approach: store requirement → resume source mappings and render strengths plus gaps.

### P0-C — Complete

7. **Broaden Daily Brief candidate selection before semantic scoring.**
   - Why: relevant jobs outside the deterministic top 10 are never evaluated.

8. **Add true post-tailoring match measurement.**
   - Why: the current improvement value is a heuristic, not a recalculated score.
   - Approach: evaluate accepted wording against normalized requirements without treating edited wording as new evidence.

## 14. Final implementation matrix

| Capability | UI | Backend | AI | Stored intelligence | Validation | Tests | Status |
|---|---|---|---|---|---|---|---|
| Resume parsing | Upload exists | Yes | Gemini profile | Basic profile + raw text | Shape/line range only | Basic unit tests | Partial |
| Onboarding suggestions | Yes | Preferences only | No | Static arrays / regex skills | User form validation | Limited | Partial |
| JD normalization | No dedicated UI | Greenhouse ingestion | No | Basic job fields | Input/source checks | Good deterministic tests | Partial |
| Semantic matching | Match labels | Yes | Gemini batch matching | Cached scores/gaps/evidence | Response shape/range checks | Formula/parser tests | Partial |
| Daily Brief ranking | Yes | Scheduled searches | Indirectly | Suggestions/ranks/scores | Basic filters | Scheduling/filter tests | Partial |
| Why-this-role | Yes | Stored explanation string | Indirectly | Requirement labels only | Weak evidence linkage | Limited | Partial |
| Gap/caution analysis | Not rendered | Stored gaps | Gemini | `matchGaps` | Weak evidence linkage | Limited | Partial |
| Grounded tailoring | Yes | Yes | Gemini structured output | Preview only; Master structure | Strong multi-layer validation | Strong tests/evals | Implemented |
| Tailoring validation | Hidden from UI | Yes | No | Diagnostics/logging | Strong deterministic guard | Strong tests | Implemented |
