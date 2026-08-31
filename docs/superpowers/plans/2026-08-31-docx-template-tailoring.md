# DOCX Template Tailoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tailor a resume by editing a user’s original DOCX template without changing its document structure, styling, or page limit.

**Architecture:** The browser downloads the signed-in user’s DOCX template, records text-bearing Word paragraphs, and sends those fixed slots to the existing protected tailoring action. The action returns one concise replacement per slot. The browser edits only Word text nodes inside the original package, preserving styles, margins, tables, headers, and paragraph structure.

**Tech Stack:** React 19, TypeScript, Convex, JSZip, OOXML, Vitest.

**Spec:** `docs/superpowers/plans/2026-08-31-tailored-resume-download.md`

## Global Constraints

- DOCX tailoring requires an uploaded DOCX; PDFs keep the existing text-based download behavior.
- Preserve the original DOCX package structure, paragraph count, styles, margins, and page setup.
- Each replacement must be shorter than its original slot and the entire tailored text must not exceed the source text length.
- A tailored DOCX must never add a third page to a two-page source by adding paragraphs or lengthening slots.
- Do not persist API keys, generated resumes, or the original document outside existing private resume storage.

---

### Task 1: Make the user’s source DOCX available only to their browser

**Files:**
- Modify: `convex/resumes.ts`
- Modify: `src/ResultsScreen.tsx`

**Interfaces:**
- Produces: `resumes.mine()` result extended with an owner-scoped `downloadUrl` for the source file.

- [ ] **Step 1: Attach a storage URL to the signed-in owner’s resume result**

```ts
const resume = await ctx.db.query('resumes').withIndex('by_owner', (q) => q.eq('ownerId', ownerId)).order('desc').first()
return resume ? { ...resume, downloadUrl: await ctx.storage.getUrl(resume.storageId) } : null
```

- [ ] **Step 2: Read the template before generating a tailored result**

In `FocusedRoleView`, query `api.resumes.mine`, fetch only its `downloadUrl`, and fail with `Upload your original DOCX resume to keep its formatting.` if the current resume is not a DOCX.

### Task 2: Patch only text nodes inside the original DOCX

**Files:**
- Create: `src/docxTemplate.ts`
- Create: `src/docxTemplate.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `extractDocxSlots(source: ArrayBuffer): Promise<DocxSlot[]>` and `patchDocxTemplate(source, replacements): Promise<Blob>`.
- Produces: a DOCX blob with unchanged OOXML layout/style elements and replaced text only.

- [ ] **Step 1: Add a failing OOXML-slot test**

```ts
expect(extractSlotsFromDocumentXml(xml)).toEqual([
  { index: 0, text: 'PRIYA SHAH', editable: false },
  { index: 1, text: 'Built React dashboards', editable: true },
])
```

- [ ] **Step 2: Add JSZip and implement fixed-slot patching**

Load the DOCX package, read `word/document.xml`, identify text-bearing `w:p` nodes, and replace only `w:t` text nodes for editable slots. Do not add or delete paragraphs, runs, tables, section properties, headers, footers, relationships, or styles.

- [ ] **Step 3: Enforce bounded replacement text**

Reject a response when it has a different number of slots, any replacement is longer than its source slot, or total replacement text is longer than total editable source text.

- [ ] **Step 4: Verify the package**

Run `npx vitest run src/docxTemplate.test.ts` and confirm the output XML preserves the original paragraph/run count and applies only the expected replacement text.

### Task 3: Generate concise replacements and download from the original template

**Files:**
- Modify: `convex/tailoredResumes.ts`
- Modify: `convex/tailoredResumes.test.ts`
- Modify: `src/ResultsScreen.tsx`
- Modify: `src/tailoredResumeDownload.ts`

**Interfaces:**
- Consumes: fixed DOCX slots from the browser and the current-brief job description.
- Produces: `{ fileName, resumeText, replacements }`, where replacements match the browser slot order.

- [ ] **Step 1: Send slot text to the protected action**

Add optional `templateSlots: v.array(v.string())` to `generate`. Require it for DOCX-template mode and include it in the AI prompt.

- [ ] **Step 2: Require an exact concise JSON array from the AI**

The prompt returns a JSON array matching source-slot order. It preserves headings/contact lines unchanged, never adds facts, never adds lines, and writes each editable replacement no longer than its source. The prompt says a two-page source must remain within two pages.

- [ ] **Step 3: Download patched DOCX and remove format choice during DOCX-template mode**

For a DOCX source, download the patched original package as DOCX. Show `Original Word formatting preserved. No extra pages added.` only after local replacement validation succeeds. Keep PDF output only for PDF source resumes.

- [ ] **Step 4: Verify production behavior**

Run `npm test && npm run build && npm run lint`, deploy the Convex action, and deploy the frontend. After a sample DOCX is uploaded, render its original and tailored versions and confirm the page count stays at two or fewer and the visual layout remains intact.

## Plan self-review

- **Spec coverage:** The plan locks DOCX layout, preserves a two-page source’s structure, and limits all text replacements before download.
- **Privacy:** Source download URLs and generation inputs remain owner-scoped; the action persists neither the API key nor generated output.
- **Known verification limit:** Final visual page-count QA requires a representative uploaded DOCX; code-level package checks cannot prove Word pagination.
