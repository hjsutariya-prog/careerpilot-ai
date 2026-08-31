import { describe, expect, it } from 'vitest'
import { buildTailoringUserPrompt, tailoringSystemInstruction } from './tailoringPrompt'
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
    expect(tailoringSystemInstruction).toContain('RESUME = source of truth about the candidate.')
    expect(tailoringSystemInstruction).toContain('JOB DESCRIPTION = source of truth about employer requirements.')
    expect(tailoringSystemInstruction).toMatch(/Priority 1:[\s\S]*directly matches important JD responsibilities/i)
    expect(tailoringSystemInstruction).toMatch(/fewer than 8 edits is preferred/i)
    expect(tailoringSystemInstruction).toMatch(/smallest number of words possible/i)
    expect(tailoringSystemInstruction).toMatch(/Do not prioritize cosmetic rewriting/i)
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
    expect(prompt).toContain('"edits":[{"blockId":"paragraph_12","text":"Improved text"}]}')
    expect(prompt).toContain('Never invent a blockId')
  })
})
