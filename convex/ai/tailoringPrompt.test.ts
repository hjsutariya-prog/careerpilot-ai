import { describe, expect, it } from 'vitest'
import { buildTailoringUserPrompt, replacementLimitsForPrompt, tailoringBlocksForPrompt, tailoringSystemInstruction } from './tailoringPrompt'
import { createResumeBlocks } from './resumeBlocks'

describe('tailoring prompt', () => {
  it('includes the controlled-tailoring policy and all DOCX tailoring inputs', () => {
    const prompt = buildTailoringUserPrompt({
      jobTitle: 'Platform Engineer',
      companyName: 'Northstar',
      jobDescription: 'Build reliable TypeScript platforms.',
      resumeText: 'Built TypeScript dashboards.',
      editableSlots: createResumeBlocks([{ text: 'Built TypeScript dashboards.', editable: true }]),
    })

    expect(tailoringSystemInstruction).toContain('The job description is NOT evidence of candidate experience.')
    expect(tailoringSystemInstruction).toContain('Be conservative about facts, but proactive about wording.')
    expect(tailoringSystemInstruction).toContain('Improve the resume whenever a safe, meaningful wording, emphasis, clarity, conciseness, or JD-alignment improvement is available.')
    expect(tailoringSystemInstruction).toContain('This never permits inventing a factual claim.')
    expect(tailoringSystemInstruction).toMatch(/stronger professional wording without increasing scope or seniority/i)
    expect(tailoringSystemInstruction).toContain('do not withhold it merely because it does not add a new fact.')
    expect(tailoringSystemInstruction).toMatch(/Return no edits, reorders, or merges only when there is genuinely no safe improvement/i)
    expect(tailoringSystemInstruction).toMatch(/Before returning no operations, take a second pass specifically for wording improvements/i)
    expect(tailoringSystemInstruction).toContain('except through an explicit valid merge or reorder operation described below.')
    expect(tailoringSystemInstruction).toContain('RESUME = source of truth about the candidate.')
    expect(tailoringSystemInstruction).toContain('JOB DESCRIPTION = source of truth about employer requirements.')
    expect(tailoringSystemInstruction).toMatch(/JD importance[\s\S]*strength of resume evidence[\s\S]*ATS relevance/i)
    expect(tailoringSystemInstruction).toMatch(/Priority 1:[\s\S]*Strongly supported but understated responsibilities/i)
    expect(tailoringSystemInstruction).toMatch(/fewer than 8 edits is preferred/i)
    expect(tailoringSystemInstruction).toMatch(/smallest factual change that materially improves recruiter or ATS understanding of fit/i)
    expect(tailoringSystemInstruction).toMatch(/Do not prioritize cosmetic rewriting/i)
    expect(tailoringSystemInstruction).toMatch(/Do not propose an edit merely because a synonym is closer to JD wording/i)
    expect(tailoringSystemInstruction).toContain('Changing "turned" to "translated" alone is low-value and should usually be skipped.')
    expect(tailoringSystemInstruction).toContain('Owned backlog prioritization, sprint planning, release management, and cross-functional delivery.')
    expect(tailoringSystemInstruction).toContain('Never force banking, reconciliation, agile delivery, project management, or any other JD term into the resume.')
    expect(tailoringSystemInstruction).toContain('SAFE EXPERIENCE-BULLET REORDERING:')
    expect(tailoringSystemInstruction).toMatch(/strongest evidence for the target role[\s\S]*strongest measurable, ownership, or delivery evidence/i)
    expect(tailoringSystemInstruction).toContain('Do not reorder merely for stylistic variety.')
    expect(tailoringSystemInstruction).toContain('pure permutation of every existing experience_bullet block in exactly one supplied experienceId')
    expect(tailoringSystemInstruction).toContain('never include a heading, company, role, date, skills line, or a bullet from another experience')
    expect(tailoringSystemInstruction).toContain('SAFE EXPERIENCE-BULLET MERGING:')
    expect(tailoringSystemInstruction).toContain('Merging is lower priority than a high-value safe rewrite or a useful reorder.')
    expect(tailoringSystemInstruction).toContain('The merged text may use facts from those two source bullets only')
    expect(tailoringSystemInstruction).toContain('Never merge unrelated bullets merely to save space.')
    expect(tailoringSystemInstruction).toMatch(/do not add it, imply it, or create an edit for it/i)
    expect(tailoringSystemInstruction).toMatch(/JD terminology only when it is semantically equivalent to experience already supported by the resume/i)
    expect(tailoringSystemInstruction).toMatch(/UNDERSTATED:[\s\S]*only requirements that should normally drive edits/i)
    expect(tailoringSystemInstruction).toMatch(/Never create an edit for a MISSING requirement/i)
    expect(tailoringSystemInstruction).toMatch(/evidenceBlockId must be an existing supplied resume block ID/i)
    expect(tailoringSystemInstruction).toContain('A requirement is MATCHED when the resume already communicates the same capability clearly enough, even if the wording is not identical to the JD.')
    expect(tailoringSystemInstruction).toMatch(/different grammatical form[\s\S]*synonym[\s\S]*word order/i)
    expect(tailoringSystemInstruction).toContain('Improved API latency by 25%')
    expect(tailoringSystemInstruction).toContain('Do not edit it merely to replace "Improved" with "Optimized".')
    expect(tailoringSystemInstruction).toContain('Would a recruiter already understand from the current resume text that this JD requirement is satisfied?')
    expect(tailoringSystemInstruction).toContain('Built backend services using Python')
    expect(tailoringSystemInstruction).toContain('Named technologies, frameworks, platforms, cloud providers, databases, programming languages, and certifications require explicit resume evidence.')
    expect(tailoringSystemInstruction).toContain('React does not imply TypeScript')
    expect(tailoringSystemInstruction).toContain('Docker does not imply Kubernetes')
    expect(tailoringSystemInstruction).toContain('AWS does not imply Terraform')
    expect(tailoringSystemInstruction).toContain('SQL does not imply PostgreSQL')
    expect(tailoringSystemInstruction).toContain('Named technologies must be evaluated independently.')
    expect(tailoringSystemInstruction).toContain('React does not imply JavaScript unless JavaScript is explicitly supported elsewhere in the resume.')
    expect(tailoringSystemInstruction).toContain('Do not classify it as UNDERSTATED merely because it is commonly paired with another demonstrated technology.')
    expect(tailoringSystemInstruction).toContain('When the resume explicitly names TypeScript, classify TypeScript as MATCHED.')
    expect(tailoringSystemInstruction).toContain('JD:\n"Build React applications using TypeScript."')
    expect(tailoringSystemInstruction).toContain('MATCHED:\n- React')
    expect(tailoringSystemInstruction).toContain('MISSING:\n- TypeScript')
    expect(tailoringSystemInstruction).toContain('Incorrect:\nUNDERSTATED:\n- TypeScript')
    expect(tailoringSystemInstruction).toContain('Do not propose any edit adding TypeScript.')
    expect(prompt).toContain('JOB TITLE: Platform Engineer')
    expect(prompt).toContain('Build reliable TypeScript platforms.')
    expect(prompt).toContain('Built TypeScript dashboards.')
    expect(prompt).toContain('"editable":true')
    expect(prompt).toContain('{"analysis":{"matched":[{"requirement":"...","evidenceBlockIds":["paragraph_4"]}]')
    expect(prompt).toContain('"edits":[{"blockId":"paragraph_12","text":"Improved text"}],"reorders":[{"experienceId":"experience_0","blockIds":["paragraph_15","paragraph_13","paragraph_14"]}],"merges":[{"experienceId":"experience_0","sourceBlockIds":["paragraph_12","paragraph_13"],"targetBlockId":"paragraph_12","text":"Merged text"}]}')
    expect(prompt).toContain('Never invent a blockId')
    expect(prompt).toContain('include every bullet in that experience exactly once')
    expect(prompt).toContain('use exactly two experience_bullet sourceBlockIds')
    expect(prompt).toContain('similar length is acceptable')
    expect(prompt).toContain('must stay within both limits supplied for its block: maxCharacters and maxWords')
    expect(prompt).toContain('These are 120% of the original block.')
    expect(prompt).toContain('If adding JD wording would exceed either limit, replace equivalent existing wording instead of adding text.')
    expect(prompt).toContain('"maxCharacters":34')
    expect(prompt).toContain('"maxWords":4')
    expect(prompt).toContain('Preserve all material responsibilities, scope, stakeholders, domain terms, numbers, and factual claims.')
    expect(prompt).not.toContain('every other edit must be strictly shorter')
    expect(prompt).not.toContain('MATCHED MASTER EXPERIENCE EVIDENCE:')
  })

  it('provides validator-compatible limits only for normal editable text blocks', () => {
    expect(replacementLimitsForPrompt('Built React dashboards.')).toEqual({ maxCharacters: 28, maxWords: 4 })
    expect(tailoringBlocksForPrompt(createResumeBlocks([
      { text: 'Built React dashboards.', editable: true },
      { text: 'Skills: React, TypeScript', editable: true, kind: 'skills' },
      { text: 'EXPERIENCE', editable: false, kind: 'heading' },
    ]))).toMatchObject([
      { blockId: 'paragraph_0', maxCharacters: 28, maxWords: 4 },
      { blockId: 'paragraph_1' },
      { blockId: 'paragraph_2' },
    ])
  })

  it('includes only the Master blocks matched to their corresponding Template experience', () => {
    const prompt = buildTailoringUserPrompt({
      jobTitle: 'Product Owner',
      companyName: 'Northstar',
      jobDescription: 'Improve agile project delivery.',
      resumeText: 'Worked with teams on product delivery.',
      editableSlots: createResumeBlocks([
        { text: 'Product Owner | Company A | 2022–Present', editable: false, kind: 'experience_header', experienceId: 'experience_0' },
        { text: 'Worked with teams on product delivery.', editable: true, kind: 'experience_bullet', experienceId: 'experience_0', bulletIndex: 0 },
      ]),
      masterEvidence: {
        byTemplateExperience: {
          experience_0: {
            templateExperienceId: 'experience_0', masterExperienceId: 'master_experience_0', confidence: 1,
            blocks: [{ blockId: 'master_experience_0_block_0', text: 'Prioritized product backlog.', kind: 'experience_bullet' }],
          },
        },
        masterBlockExperienceIds: {
          master_experience_0_block_0: 'master_experience_0',
          master_experience_1_block_0: 'master_experience_1',
        },
      },
    })
    expect(prompt).toContain('MATCHED MASTER EXPERIENCE EVIDENCE:')
    expect(prompt).toContain('master_experience_0_block_0')
    expect(prompt).toContain('Prioritized product backlog.')
    expect(prompt).not.toContain('master_experience_1_block_0')
    expect(prompt).toContain('TEMPLATE RESUME = source of truth for structure, chronology, and the final document.')
    expect(prompt).toContain('sourceMasterBlockIds')
  })
})
