# CareerPilot Resume Credits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let signed-in users spend a fixed 20 CareerPilot credits to generate one successful tailored resume, while CareerPilot controls the AI provider, model, and effort on the backend.

**Architecture:** Remove personal-provider connections from the tailoring flow. The Convex action uses CareerPilot’s server-side Anthropic key with Claude Sonnet 5 and medium effort; it never accepts a client API key, model, or effort. A small credit ledger records grants, successful tailoring charges, and releases. The action reserves 20 credits before calling the provider and returns a reservation ID only with safe AI replacements. The browser builds the DOCX in memory, completes the reservation, and then starts the download; every provider, parsing, layout-protection, or document-preparation failure releases the reservation without charging the user. A short expiry releases abandoned reservations.

**Tech Stack:** React 19, TypeScript, Convex queries/mutations/actions, server environment variables, CSS, Vitest.

**Spec:** User request in this conversation, 2026-08-31.

## Global Constraints

- CareerPilot uses Claude Sonnet 5 at medium effort; the client cannot select a provider, model, or effort.
- Keep the CareerPilot provider key only in the Convex environment; never send it to the client or write it to the database.
- Deduct exactly 20 credits only for a successful AI-tailored DOCX.
- A failed provider request, unsafe model reply, layout-protected result, or download-preparation failure costs zero credits.
- A user cannot start tailoring unless they have at least 20 available credits.
- Store all balance changes in an append-only ledger; do not mutate a balance without an audit record.
- Credit purchase, payment-provider integration, and tax invoices are out of scope for this plan. A safe admin or seed grant is used for local verification until a separate payment plan is approved.
- Preserve the current DOCX-layout protection and safe fallback behavior.
- Reuse the existing CareerPilot paper/teal interface language and native button behavior.

---

### Task 1: Add an auditable CareerPilot credit ledger

**Files:**
- Modify: `convex/schema.ts`
- Create: `convex/credits.ts`
- Create: `convex/credits.test.ts`

**Interfaces:**
- Produces: a `creditLedger` table with `ownerId`, `amount`, `kind`, `status`, `referenceId`, `expiresAt`, and `createdAt`; `availableCredits(ownerId)`; and `TAILORED_RESUME_CREDIT_COST = 20`.
- Consumes: the authenticated owner ID from `requireOwner()` and a job ID used as a duplicate-charge reference.

- [ ] **Step 1: Write failing ledger tests**

```ts
expect(TAILORED_RESUME_CREDIT_COST).toBe(20)
expect(availableCredits(entries)).toBe(40)
expect(canStartTailoring(entries)).toBe(true)
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- convex/credits.test.ts`

Expected: FAIL because the credit constants and pure balance helpers do not exist.

- [ ] **Step 3: Add the ledger table and balance helpers**

```ts
creditLedger: defineTable({
  ownerId: v.string(),
  amount: v.number(),
  kind: v.union(v.literal('grant'), v.literal('tailored_resume')),
  status: v.union(v.literal('completed'), v.literal('reserved'), v.literal('released')),
  referenceId: v.string(),
  expiresAt: v.optional(v.number()),
  createdAt: v.number(),
}).index('by_owner', ['ownerId']).index('by_owner_reference', ['ownerId', 'referenceId'])
```

Make `availableCredits()` sum completed grants and completed charges, treating each charge as a negative amount. A reservation must reduce the available amount until it is completed, released, or expired. Add a server-side cleanup mutation that releases expired reservations before every reserve or balance calculation.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npm test -- convex/credits.test.ts`

Expected: PASS; a 20-credit charge is allowed only when the available balance is at least 20, and released reservations do not reduce the balance.

### Task 2: Make credit balance visible in the Application kit

**Files:**
- Modify: `src/ResultsScreen.tsx`
- Modify: `src/App.css`

**Interfaces:**
- Consumes: an authenticated `api.credits.balance` query and `TAILORED_RESUME_CREDIT_COST` returned by that query.
- Produces: an Application kit that states the 20-credit cost, the current balance, and a disabled, explanatory state when the balance is too low.

- [ ] **Step 1: Query the current authenticated credit balance**

```ts
const creditBalance = useQuery(api.credits.balance)
const canTailor = creditBalance !== undefined && creditBalance.available >= creditBalance.cost
```

Do not render an API-key field, provider selector, model selector, effort selector, or personal billing explanation.

- [ ] **Step 2: Render cost and insufficient-credit states**

```tsx
<p className="application-kit-credit-cost">Costs 20 credits · You have {creditBalance.available}</p>
{!canTailor && <p className="application-kit-message error" role="alert">You need 20 credits to tailor a resume.</p>}
```

State that credits are charged only when a safe tailored resume is ready to download. Keep the existing formatting and two-page protection explanation.

- [ ] **Step 3: Style the balance as supporting information**

Use the current Application kit hierarchy: the Tailor resume action remains the focal point, the credit cost is compact supporting text, and insufficient credits use the existing error treatment. Do not add a new UI package.

- [ ] **Step 4: Manually check balance states**

Run: `npm run dev`

Expected: a user with 20 or more credits can start tailoring; a user with fewer than 20 credits sees the required amount and cannot start; no AI-provider selection or key input is visible.

### Task 3: Charge credits safely around backend-managed tailoring

**Files:**
- Modify: `convex/tailoredResumes.ts`
- Modify: `convex/tailoredResumes.test.ts`
- Modify: `src/ResultsScreen.tsx`

**Interfaces:**
- Consumes: authenticated owner ID, server-side `ANTHROPIC_API_KEY`, the user’s available credit balance, and the existing safe template-replacement checks.
- Produces: one deduplicated reservation per resume-and-job generation, an AI result carrying a reservation ID only when safe replacements exist, a client-completed 20-credit charge immediately before download, or a released reservation for every no-charge outcome.

- [ ] **Step 1: Write request and settlement tests around pure helpers**

Extract a pure exported helper such as:

```ts
export function anthropicResumeRequest(prompt: string) {
  return {
    model: 'claude-sonnet-5',
    thinking: { type: 'adaptive' },
    effort: 'medium',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  }
}
```

Test these exact expectations:

```ts
expect(anthropicResumeRequest('prompt')).toMatchObject({
  model: 'claude-sonnet-5', thinking: { type: 'adaptive' }, effort: 'medium',
})
expect(settlementFor('layout_protected')).toEqual('release')
expect(settlementFor('ai')).toEqual('await_client_completion')
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- convex/tailoredResumes.test.ts`

Expected: FAIL because the fixed Anthropic request builder and settlement helper do not exist.

- [ ] **Step 3: Reserve and generate without client provider arguments**

Replace the public action arguments `provider`, `apiKey`, `model`, and `effort` with no client-controlled provider settings. Before calling Anthropic, run an internal mutation that atomically confirms 20 available credits and creates a `reserved` ledger entry with a short expiry. Use the server-only `ANTHROPIC_API_KEY`; call `claude-sonnet-5` with adaptive thinking and `medium` effort. Return its reservation ID only with a safe AI result. After every fallback or error, release the reservation. Use the owner ID and job ID as a reference so repeat clicks cannot create duplicate reservations.

- [ ] **Step 4: Build the DOCX, settle the reservation, then download**

```ts
const result = await generateTailoredResume({
  jobId: job.id as Id<'jobs'>,
  templateSlots,
})
const file = await createTailoredResumeDocx(result.fileName, slots, result.replacements)
await completeTailoredResumeCredit({ reservationId: result.reservationId })
downloadPreparedDocx(file, result.fileName)
```

If document creation throws, call `releaseTailoredResumeCredit({ reservationId })`, show the existing safe error message, and do not start a download. Never call the completion mutation for a layout-protected or local-reorder result because neither result is a paid AI-tailored resume.

- [ ] **Step 5: Run focused tests to verify the behavior**

Run: `npm test -- convex/tailoredResumes.test.ts convex/credits.test.ts`

Expected: PASS; the fixed provider request uses Sonnet 5 at medium effort, an unsafe or failed result releases credits, a successful DOCX creation completes exactly one 20-credit charge, and no test output contains a real API key.

### Task 4: Retire personal AI-connection settings and verify the credit lifecycle

**Files:**
- Rename: `src/AiConnectionScreen.tsx` to `src/CreditsScreen.tsx`
- Delete: `src/tailoredResumeConnection.ts`
- Modify: `src/App.tsx`
- Modify: `src/DashboardShell.tsx`
- Modify: `src/dashboardRouting.ts`
- Modify: generated Convex types only if `npx convex dev --once` changes them.

**Interfaces:**
- Consumes: all prior tasks and the existing dashboard route for AI connection settings.
- Produces: a compiled frontend with a Credits tab and no dead personal-key settings, plus a deployed Convex action with a credit-only contract.

- [ ] **Step 1: Replace the AI connection tab with Credits**

Change the `ai-connection` screen identifier and DashboardShell navigation label to `credits`. Rename the screen component to `CreditsScreen`; it displays the authenticated user’s available credits, the fixed 20-credit tailoring price, and the statement “Credits are charged only when a safe tailored resume is ready to download.” It must not collect payment details, API keys, model preferences, or provider selections.

- [ ] **Step 2: Remove obsolete browser key storage**

Remove the `AiConnectionScreen` import and `clearTailoredResumeConnection()` call from `App.tsx`, then delete `src/tailoredResumeConnection.ts`. Search the frontend for `tailored-resume-api-key`, `tailored-resume-model`, and `tailored-resume-provider`; the search must return no active source references.

- [ ] **Step 3: Run the complete local checks**

Run: `npm test && npm run build && npm run lint`

Expected: all existing and new tests pass, TypeScript build succeeds, and lint has no new errors.

- [ ] **Step 4: Verify the Convex contract**

Run: `npx convex dev --once`

Expected: the deployed development action accepts only job and template inputs, exposes the reserve/complete/release credit mutations, and generated types remain valid.

- [ ] **Step 5: Browser-check the credit lifecycle**

Grant a local test account 40 credits. Generate one safe tailored DOCX and confirm the balance becomes 20. Trigger a provider failure or an unsafe reply and confirm the balance stays 20. Repeat the completed job request and confirm no second 20-credit charge occurs. Do not use a real provider key in browser screenshots, logs, source, or tests.

## Plan self-review

- **Spec coverage:** CareerPilot owns provider billing, users pay a fixed 20 credits only after success, and no user-facing provider settings remain.
- **Privacy:** The provider key is an environment secret only; no API-key collection or browser storage remains.
- **Type consistency:** The shared 20-credit cost, reservation state, completed charge, and available-balance query are aligned across the ledger, action, and UI.
- **Placeholder scan:** No task contains a deferred implementation or unspecified validation rule.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-31-provider-model-effort-controls.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task and review between tasks.

2. **Inline Execution** — execute tasks in this session with checkpoints.
