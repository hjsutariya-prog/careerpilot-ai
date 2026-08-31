# Application Kit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move tailored-resume generation from crowded job cards into a focused Application kit in the full job view.

**Architecture:** Keep resume generation and download code unchanged. The full-role component owns the selected file format, selected-job loading state, and feedback message, while the result grid only navigates to that component.

**Tech Stack:** React 19, TypeScript, Convex, existing CSS design tokens, Vitest.

**Spec:** `docs/superpowers/plans/2026-08-31-tailored-resume-download.md`

## Global Constraints

- Keep provider keys in the existing tab-session storage and clear them only on sign out.
- Generate content only for the signed-in user's current job brief.
- Keep DOCX and PDF downloads available.
- Do not add a new package or a new route.

---

### Task 1: Place the resume action in the full-role Application kit

**Files:**
- Modify: `src/ResultsScreen.tsx`
- Modify: `src/App.css`
- Test: existing `src/tailoredResumeDownload.test.ts`

**Interfaces:**
- Consumes: `api.tailoredResumes.generate`, `downloadTailoredResume(fileName, text, format)`, and the selected `JobCard`.
- Produces: an accessible Application kit in `FocusedRoleView`, with one selected-job loading state and DOCX/PDF selection.

- [x] **Step 1: Move the action state and handler into the focused-role component**

```tsx
const [resumeFormat, setResumeFormat] = useState<ResumeDownloadFormat>('docx')
const [tailoringJobId, setTailoringJobId] = useState<string | null>(null)
```

The handler reads the existing AI connection, invokes `api.tailoredResumes.generate`, downloads the requested format, and renders provider/fallback feedback in the focused-role view.

- [x] **Step 2: Render the Application kit before Apply**

```tsx
<section className="application-kit" aria-labelledby="application-kit-title">
  <p className="role-detail-label">Application kit</p>
  <h2 id="application-kit-title">Prepare your resume</h2>
</section>
```

Include a native format selector and a single `Tailor resume` button. Keep the final Apply, Hold, and Reject actions below it.

- [x] **Step 3: Remove tailoring controls from each result-card footer**

Leave the existing `Open full role view`, Apply, Hold, and Reject controls intact so users retain a direct path to the kit without card clutter.

- [x] **Step 4: Add focused, responsive styles**

Use the existing paper, teal, lime, coral, and deep tokens. The kit is a quiet document-work area with a teal primary action, light document-format control, visible focus style, and a status/error message.

- [x] **Step 5: Verify the change**

Run: `npm test && npm run build && npm run lint`

Expected: tests and build pass; lint has no new errors. Then inspect the full-role view at desktop and mobile widths and verify that the result-card footer no longer contains tailoring controls.

## Plan self-review

- **Spec coverage:** The kit is inside job details, preserves both download formats, and removes the crowded card action.
- **Privacy:** It reuses the existing authenticated action and session-only connection handling; no key storage behavior changes.
- **Type consistency:** `ResumeDownloadFormat`, `JobCard.id`, and `api.tailoredResumes.generate` retain their current types.
