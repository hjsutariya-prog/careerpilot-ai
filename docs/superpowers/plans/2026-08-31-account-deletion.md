# Account Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in user permanently delete their CareerPilot account, private data, uploaded files, and active sign-in sessions after an explicit confirmation, then receive a confirmation email.

**Architecture:** A protected Convex mutation accepts only the literal text `DELETE`. While it still has the verified account email, it queues a Resend confirmation, then removes user-owned data, file-storage objects, Convex Auth sessions and credentials, and the Auth user record in one transaction. Preferences contains an inline two-step danger zone; only its disabled-until-confirmed final button invokes deletion.

**Tech Stack:** React 19, TypeScript, Vite, Convex, Convex Auth, `@convex-dev/resend`, Vitest, oxlint.

**Spec:** `C:\Users\Harshal Sutariya\buildweek\docs\careerpilot-ai\v1-build-plan.md`

## Global Constraints

- Delete only data owned by the authenticated account; preserve all shared jobs, source runs, snapshots, and role summaries.
- Require exact, case-sensitive `DELETE` before enabling the destructive button.
- Delete stored resume files as well as their database records.
- Delete job suggestions before search runs and connections before connection imports.
- Delete all account sessions, refresh tokens, provider accounts, verification codes, and OAuth verifiers before deleting the Auth user.
- Queue the confirmation email before deleting the Auth user, using that user's verified email.
- Keep `RESEND_API_KEY` and `CAREERPILOT_EMAIL_FROM` only in Convex deployment settings.
- If a verified sender or recipient email is missing, reject the request without deleting data.

---

### Task 1: Configure the confirmation-email sender

**Files:**
- Create: `convex/convex.config.ts`
- Create: `convex/emails.ts`

**Interfaces:**
- Consumes: `RESEND_API_KEY` and `CAREERPILOT_EMAIL_FROM` in the Convex deployment environment.
- Produces: `sendAccountDeletionConfirmation(ctx, email): Promise<void>` for the deletion mutation.

- [ ] **Step 1: Add the official Resend component**

Create `convex/convex.config.ts`:

```ts
import { defineApp } from 'convex/server'
import resend from '@convex-dev/resend/convex.config.js'

const app = defineApp()
app.use(resend)

export default app
```

- [ ] **Step 2: Add the email helper**

Create `convex/emails.ts`:

```ts
import { Resend } from '@convex-dev/resend'
import { components } from './_generated/api'
import type { MutationCtx } from './_generated/server'

const resend = new Resend(components.resend, { testMode: false })

export async function sendAccountDeletionConfirmation(ctx: MutationCtx, email: string) {
  const from = process.env.CAREERPILOT_EMAIL_FROM
  if (!from) throw new Error('Account deletion email is not configured. Please contact support.')
  await resend.sendEmail(ctx, {
    from,
    to: email,
    subject: 'Your CareerPilot account was deleted',
    text: 'Your CareerPilot account and its private data have been permanently deleted.',
  })
}
```

- [ ] **Step 3: Configure the required deployment values**

After creating a Resend API key and verifying its sender domain, run:

```powershell
npx convex env set RESEND_API_KEY '<Resend API key>'
npx convex env set CAREERPILOT_EMAIL_FROM 'CareerPilot <verified-sender@your-domain.com>'
```

- [ ] **Step 4: Generate component types**

Run:

```powershell
npx convex dev --once
```

Expected: `convex/_generated/api.d.ts` contains `components.resend` and the helper type-checks.

### Task 2: Delete all private records and the Auth account

**Files:**
- Create: `convex/accountDeletion.ts`
- Create: `convex/accountDeletion.test.ts`

**Interfaces:**
- Consumes: `deleteMine({ confirmation: 'DELETE' })` from Preferences.
- Produces: a protected mutation that queues the email and removes the caller's private data and authentication records.

- [ ] **Step 1: Write the failing deletion-scope test**

Create `convex/accountDeletion.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { privateDeletionTables } from './accountDeletion'

describe('account deletion', () => {
  it('deletes all private CareerPilot tables and not shared jobs', () => {
    expect(privateDeletionTables).toEqual([
      'jobSuggestions', 'searchRuns', 'searchSchedules', 'jobActions',
      'connections', 'connectionImports', 'preferences', 'resumes',
    ])
  })
})
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```powershell
npm test -- convex/accountDeletion.test.ts
```

Expected: FAIL because `accountDeletion.ts` does not exist.

- [ ] **Step 3: Add the deletion mutation**

Create `convex/accountDeletion.ts`. Export this tested table order:

```ts
export const privateDeletionTables = [
  'jobSuggestions', 'searchRuns', 'searchSchedules', 'jobActions',
  'connections', 'connectionImports', 'preferences', 'resumes',
] as const
```

Implement `deleteMine` as a `mutation` with `args: { confirmation: v.literal('DELETE') }`. Get the owner through `requireOwner`, get the matching `users` document, require `user.email`, and call `sendAccountDeletionConfirmation(ctx, user.email)` before deletion. Delete matching `jobSuggestions`, `searchRuns`, `searchSchedules`, `jobActions`, `connections`, `connectionImports`, and `preferences` using their owner indexes. For every `resumes` record, call `ctx.storage.delete(record.storageId)` before deleting the record.

For Auth rows, query sessions by `userId` and delete each session's refresh tokens by `sessionId`; query accounts by `userIdAndProvider` and delete their verification codes by `accountId`; delete OAuth verifiers whose `sessionId` is one of the deleted sessions; then delete sessions, accounts, and the `users` record. Do not touch `jobs`, `jobSnapshots`, `jobRoleSummaries`, or `sourceRuns`.

- [ ] **Step 4: Run the focused test to verify it passes**

Run:

```powershell
npm test -- convex/accountDeletion.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run backend validation**

Run:

```powershell
npm test && npm run lint && npm run build
```

Expected: all checks pass.

### Task 3: Add the explicit Preferences danger zone

**Files:**
- Create: `src/accountDeletionUi.ts`
- Create: `src/AccountDeletion.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.css`

**Interfaces:**
- Consumes: `api.accountDeletion.deleteMine({ confirmation: 'DELETE' })`.
- Produces: a clear, accessible two-step deletion control that returns the user to signed-out landing state.

- [ ] **Step 1: Write the failing confirmation test**

Create `src/AccountDeletion.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { canDeleteAccount } from './accountDeletionUi'

describe('account deletion confirmation', () => {
  it('accepts only the exact confirmation text', () => {
    expect(canDeleteAccount('delete')).toBe(false)
    expect(canDeleteAccount('DELETE ')).toBe(false)
    expect(canDeleteAccount('DELETE')).toBe(true)
  })
})
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```powershell
npm test -- src/AccountDeletion.test.ts
```

Expected: FAIL because `accountDeletionUi.ts` does not exist.

- [ ] **Step 3: Implement the confirmation gate and action**

Create `src/accountDeletionUi.ts`:

```ts
export function canDeleteAccount(value: string) {
  return value === 'DELETE'
}
```

In `PreferencesScreen`, add `deleteConfirmation`, `isDeleting`, and `deleteError` state plus `useMutation(api.accountDeletion.deleteMine)`. At the bottom of Preferences, render a native button that reveals the danger-zone explanation, then a text input labelled `Type DELETE to permanently remove your account`. The final `Delete my account` button is disabled until `canDeleteAccount(deleteConfirmation)` returns true. On success, clear the temporary AI connection, attempt `signOut`, and show the landing screen. Show failures in a `role="alert"` paragraph.

- [ ] **Step 4: Style the danger zone with existing tokens**

In `src/App.css`, add `preferences-danger-zone` styles using the existing paper surface, coral, muted text, `Instrument Sans`, and `Manrope` values. Use a low-opacity coral top border, 8px spacing units, minimum 44px controls, a coral `:focus-visible` outline, named 150ms transform/color transitions, and a readable disabled state. Do not add a modal or a new dependency.

- [ ] **Step 5: Run the focused test to verify it passes**

Run:

```powershell
npm test -- src/AccountDeletion.test.ts
```

Expected: PASS.

- [ ] **Step 6: Verify the account flow in development**

Run:

```powershell
npm run dev
```

Expected: the final button is disabled until exact `DELETE`; deletion removes the account and returns to signed-out state; the user cannot read the deleted account's private records; the configured email address receives one confirmation.

### Task 4: Deploy the verified account-deletion feature

**Files:**
- Modify: `docs/careerpilot-ai/v1-build-plan.md`

**Interfaces:**
- Consumes: successful checks, a working Resend API key, and a verified sender address.
- Produces: a production deletion flow and updated V1 milestone status.

- [ ] **Step 1: Deploy Convex before the frontend**

Run:

```powershell
npx convex deploy
```

Expected: Resend and `accountDeletion.deleteMine` are available in production.

- [ ] **Step 2: Commit the exact validated files and deploy the frontend**

Run:

```powershell
npm run check
git add convex/convex.config.ts convex/emails.ts convex/accountDeletion.ts convex/accountDeletion.test.ts src/accountDeletionUi.ts src/AccountDeletion.test.ts src/App.tsx src/App.css convex/_generated/api.d.ts docs/superpowers/plans/2026-08-31-account-deletion.md docs/careerpilot-ai/v1-build-plan.md
git commit -m "feat: let users permanently delete their account"
git push origin main
```

Expected: deploy that committed revision to Vercel production.

- [ ] **Step 3: Verify with a disposable production account**

Expected: create a disposable account, upload a resume, save preferences and a Tracker action, delete the account with exact `DELETE`, receive one confirmation email, then confirm the old data cannot be read after signing in again.

## Plan self-review

- **Spec coverage:** Tasks 1 and 2 send confirmation and remove all private account data; Task 3 provides the guarded user action; Task 4 verifies production behavior.
- **Placeholder scan:** Every required table, secret name, file, command, and confirmation value is named.
- **Type consistency:** The browser calls `deleteMine({ confirmation: 'DELETE' })`, and `canDeleteAccount` enables that matching value only.
