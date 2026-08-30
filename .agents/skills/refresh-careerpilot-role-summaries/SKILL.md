---
name: refresh-careerpilot-role-summaries
description: Refresh CareerPilot role summaries only when explicitly requested. Creates or updates default and Gemini-generated summaries, preserves manually created summaries, and uses Gemini only when manual ChatGPT generation is unavailable. Use when the user says "refresh AI summaries", "generate all summaries", or asks to refresh CareerPilot role summaries.
disable-model-invocation: true
---

# Refresh CareerPilot Role Summaries

Run this skill only after the user explicitly asks for a refresh. It is a manual admin workflow, not a daily automation.

## Rules

- Never update a summary whose origin is `manual`.
- A summary with origin `gemini`, `default`, or no origin may be created or replaced.
- Create summaries with the current chat model first. Use Gemini only if manual generation is unavailable.
- Use only the public job title, company, and job description. Never send resumes, preferences, connections, or user details.
- Keep the original formatted company listing available in the product.
- Do not push, deploy, or refresh production data without the user's explicit approval.

## Workflow

1. Confirm the requested deployment: development or production. If the user does not say, use development.
2. Inspect `jobs` and `jobRoleSummaries` before writing anything.
3. Build the work list from active jobs where the stored summary is missing, stale for the job's `lastUpdatedAt`, has origin `gemini` or `default`, or has no origin.
4. Exclude every row with origin `manual`, even if the job description has changed.
5. Create a concise, factual summary for each work-list job:
   - two or three sentences for the role overview;
   - three to five responsibilities;
   - up to six explicit skills;
   - one sentence on who it suits.
6. Save manual outputs with origin `manual`. Save Gemini fallback outputs with origin `gemini`. Preserve the job version and generated time.
7. Validate saved rows, report counts for created, updated, skipped-manual, and failed, and leave failed rows eligible for the next refresh.

## Safety

- Use an authenticated, admin-only server-side writer. Do not add an unauthenticated mutation or put an API key in the browser.
- If the summary-origin field or the admin writer is missing, add it with tests before processing any jobs.
- Stop and report a blocker if the chosen deployment or write permission is unclear.

## Invocation

Use: `$refresh-careerpilot-role-summaries`

Example request: `Refresh AI summaries in development.`
