import { createResumeBlocks, type ResumeBlock } from '../resumeBlocks'
import type { MasterResumeStructure } from '../../masterResumeStructure'

export type TailoringEvalCategory = 'Backend' | 'Frontend' | 'Data' | 'AI/ML' | 'Product' | 'DevOps' | 'Safety/edge cases'

export type TailoringEvalRequirementExpectation = {
  concept: string
  anyOf?: string[]
}

export type TailoringEvalExpectations = {
  shouldRecognizeMatched?: TailoringEvalRequirementExpectation[]
  shouldRecognizeUnderstated?: TailoringEvalRequirementExpectation[]
  shouldRecognizeMissing?: TailoringEvalRequirementExpectation[]
  shouldRecognizeMatchedOrUnderstated?: TailoringEvalRequirementExpectation[]
  editableBlockIds?: string[]
  forbiddenTermsInEdits?: string[]
  forbiddenLeadershipTermsInEdits?: string[]
  protectedNumbers?: string[]
  maxAcceptedEdits?: number
}

export type TailoringEvalCase = {
  id: string
  category: TailoringEvalCategory
  jobDescription: string
  resumeBlocks: ResumeBlock[]
  /** Optional synthetic active Master Resume. It is resolved through production matching at evaluation time. */
  masterResumeStructure?: MasterResumeStructure
  expectations: TailoringEvalExpectations
}

const blocks = (...text: string[]) => createResumeBlocks(text.map((item) => ({ text: item, editable: true })))
const editable = (...indexes: number[]) => indexes.map((index) => `paragraph_${index}`)

const experienceBlocks = (entries: Array<{ header: string; bullets: string[] }>) => createResumeBlocks(entries.flatMap((entry, experienceIndex) => [
  { text: entry.header, editable: false, kind: 'experience_header' as const, experienceId: `experience_${experienceIndex}` },
  ...entry.bullets.map((text, bulletIndex) => ({ text, editable: true, kind: 'experience_bullet' as const, experienceId: `experience_${experienceIndex}`, bulletIndex })),
]))

const masterStructure = (experiences: Array<{ header: string; company: string; title: string; dateText: string; bullets: string[] }>): MasterResumeStructure => ({
  resumeId: 'synthetic-master-resume' as never,
  experiences: experiences.map((experience, order) => ({
    experienceId: `master_experience_${order}`,
    order,
    headerText: experience.header,
    company: experience.company,
    title: experience.title,
    dateText: experience.dateText,
    blocks: experience.bullets.map((text, blockIndex) => ({ blockId: `master_experience_${order}_block_${blockIndex}`, text, kind: 'experience_bullet' as const })),
  })),
  ungroupedBlocks: [],
})

// Every case is synthetic and deliberately free of applicant names, contact
// details, employer names, and real resume content.
export const tailoringEvalCases: TailoringEvalCase[] = [
  {
    id: 'api-capability-with-missing-rest', category: 'Backend', jobDescription: 'Develop REST APIs using Python for internal services.', resumeBlocks: blocks('Built backend APIs using Python.'),
    expectations: { shouldRecognizeMatched: [{ concept: 'Python' }, { concept: 'API development', anyOf: ['Develop APIs', 'API development'] }], shouldRecognizeMissing: [{ concept: 'REST APIs', anyOf: ['REST architecture', 'REST API development'] }], editableBlockIds: editable(0), forbiddenTermsInEdits: ['REST', 'Kubernetes', 'Docker'], maxAcceptedEdits: 8 },
  },
  {
    id: 'backend-python-django-missing', category: 'Backend', jobDescription: 'Build Django applications using Python.', resumeBlocks: blocks('Built Python web applications.'),
    expectations: { shouldRecognizeMatched: [{ concept: 'Python' }], shouldRecognizeMissing: [{ concept: 'Django' }], editableBlockIds: editable(0), forbiddenTermsInEdits: ['Django'], maxAcceptedEdits: 8 },
  },
  {
    id: 'backend-sql-postgresql-missing', category: 'Backend', jobDescription: 'Write SQL queries using PostgreSQL.', resumeBlocks: blocks('Wrote SQL queries for reporting.'),
    expectations: { shouldRecognizeMatched: [{ concept: 'SQL' }], shouldRecognizeMissing: [{ concept: 'PostgreSQL' }], editableBlockIds: editable(0), forbiddenTermsInEdits: ['PostgreSQL'], maxAcceptedEdits: 8 },
  },
  {
    id: 'backend-aws-azure-boundary', category: 'Backend', jobDescription: 'Deploy cloud services on AWS and Azure.', resumeBlocks: blocks('Deployed services on AWS.'),
    expectations: { shouldRecognizeMatched: [{ concept: 'AWS' }], shouldRecognizeMissing: [{ concept: 'Azure' }], editableBlockIds: editable(0), forbiddenTermsInEdits: ['Azure'], maxAcceptedEdits: 8 },
  },
  {
    id: 'backend-docker-kubernetes-boundary', category: 'Backend', jobDescription: 'Use Docker and Kubernetes to deploy services.', resumeBlocks: blocks('Containerized applications with Docker.'),
    expectations: { shouldRecognizeMatched: [{ concept: 'Docker' }], shouldRecognizeMissing: [{ concept: 'Kubernetes' }], editableBlockIds: editable(0), forbiddenTermsInEdits: ['Kubernetes'], maxAcceptedEdits: 8 },
  },
  {
    id: 'already-aligned-python-api', category: 'Backend', jobDescription: 'Build Python APIs for internal applications.', resumeBlocks: blocks('Built Python APIs for internal applications.'),
    expectations: { shouldRecognizeMatched: [{ concept: 'Python APIs', anyOf: ['Build Python APIs for internal applications'] }], editableBlockIds: editable(0), maxAcceptedEdits: 0 },
  },
  {
    id: 'frontend-react-aligned', category: 'Frontend', jobDescription: 'Build React user interfaces.', resumeBlocks: blocks('Built reusable React user interface components.'),
    expectations: { shouldRecognizeMatched: [{ concept: 'React' }], editableBlockIds: editable(0), maxAcceptedEdits: 0 },
  },
  {
    id: 'frontend-typescript-explicit', category: 'Frontend', jobDescription: 'Develop React applications with TypeScript.', resumeBlocks: blocks('Developed TypeScript React applications.'),
    expectations: { shouldRecognizeMatched: [{ concept: 'React' }, { concept: 'TypeScript' }], editableBlockIds: editable(0), maxAcceptedEdits: 0 },
  },
  {
    id: 'frontend-typescript-not-implied', category: 'Frontend', jobDescription: 'Develop React applications with TypeScript.', resumeBlocks: blocks('Built typed JavaScript components with React.'),
    expectations: { shouldRecognizeMatched: [{ concept: 'React' }], shouldRecognizeMissing: [{ concept: 'TypeScript' }], editableBlockIds: editable(0), forbiddenTermsInEdits: ['TypeScript'], maxAcceptedEdits: 8 },
  },
  {
    id: 'frontend-nextjs-missing', category: 'Frontend', jobDescription: 'Build Next.js applications with React.', resumeBlocks: blocks('Built React single-page applications.'),
    expectations: { shouldRecognizeMatched: [{ concept: 'React' }], shouldRecognizeMissing: [{ concept: 'Next.js' }], editableBlockIds: editable(0), forbiddenTermsInEdits: ['Next.js'], maxAcceptedEdits: 8 },
  },
  {
    id: 'frontend-html-css-aligned', category: 'Frontend', jobDescription: 'Create responsive HTML and CSS interfaces.', resumeBlocks: blocks('Created responsive HTML and CSS interfaces.'),
    expectations: { shouldRecognizeMatched: [{ concept: 'HTML' }, { concept: 'CSS' }], editableBlockIds: editable(0), maxAcceptedEdits: 0 },
  },
  {
    id: 'data-sql-python-tableau-missing', category: 'Data', jobDescription: 'Analyze data with SQL, Python, and Tableau.', resumeBlocks: blocks('Analyzed sales data using SQL and Python.'),
    expectations: { shouldRecognizeMatched: [{ concept: 'SQL' }, { concept: 'Python data analysis', anyOf: ['Analyze data using Python'] }], shouldRecognizeMissing: [{ concept: 'Tableau' }], editableBlockIds: editable(0), forbiddenTermsInEdits: ['Tableau'], maxAcceptedEdits: 8 },
  },
  {
    id: 'data-snowflake-bigquery-boundary', category: 'Data', jobDescription: 'Build analytics datasets in Snowflake and BigQuery.', resumeBlocks: blocks('Built analytics datasets in Snowflake.'),
    expectations: { shouldRecognizeMatched: [{ concept: 'Snowflake' }], shouldRecognizeMissing: [{ concept: 'BigQuery' }], editableBlockIds: editable(0), forbiddenTermsInEdits: ['BigQuery'], maxAcceptedEdits: 8 },
  },
  {
    id: 'data-bi-dashboard-understated', category: 'Data', jobDescription: 'Build business intelligence dashboards for stakeholders.', resumeBlocks: blocks('Created dashboards for business teams.'),
    expectations: { editableBlockIds: editable(0), maxAcceptedEdits: 8 },
  },
  {
    id: 'aiml-python-ml-llm-missing', category: 'AI/ML', jobDescription: 'Develop Python machine learning and LLM solutions.', resumeBlocks: blocks('Built Python classification models.'),
    expectations: { shouldRecognizeMatched: [{ concept: 'Python' }, { concept: 'Machine learning', anyOf: ['Classification models'] }], shouldRecognizeMissing: [{ concept: 'LLM' }], editableBlockIds: editable(0), forbiddenTermsInEdits: ['LLM'], maxAcceptedEdits: 8 },
  },
  {
    id: 'aiml-pytorch-tensorflow-boundary', category: 'AI/ML', jobDescription: 'Train models with PyTorch and TensorFlow.', resumeBlocks: blocks('Trained image models with PyTorch.'),
    expectations: { shouldRecognizeMatched: [{ concept: 'PyTorch' }], shouldRecognizeMissing: [{ concept: 'TensorFlow' }], editableBlockIds: editable(0), forbiddenTermsInEdits: ['TensorFlow'], maxAcceptedEdits: 8 },
  },
  {
    id: 'aiml-prompt-engineering-supported', category: 'AI/ML', jobDescription: 'Design prompts for customer-support AI assistants.', resumeBlocks: blocks('Designed and tested prompt templates for customer-support assistants.'),
    expectations: { shouldRecognizeMatched: [{ concept: 'Prompt engineering', anyOf: ['Design prompts'] }], editableBlockIds: editable(0), maxAcceptedEdits: 0 },
  },
  {
    id: 'product-stakeholder-not-owner', category: 'Product', jobDescription: 'Own product strategy and work with stakeholders.', resumeBlocks: blocks('Collaborated with stakeholders on feature requirements.'),
    expectations: { shouldRecognizeMissing: [{ concept: 'Product ownership', anyOf: ['Own product strategy'] }], editableBlockIds: editable(0), forbiddenTermsInEdits: ['owned', 'owner'], maxAcceptedEdits: 8 },
  },
  {
    id: 'product-analytics-understated', category: 'Product', jobDescription: 'Use product analytics to improve product decisions.', resumeBlocks: blocks('Analyzed product usage data and presented insights to product teams.'),
    expectations: { shouldRecognizeMatchedOrUnderstated: [{ concept: 'Product analytics', anyOf: ['Analyze product usage data'] }], editableBlockIds: editable(0), maxAcceptedEdits: 8 },
  },
  {
    id: 'product-experimentation-roadmap-boundary', category: 'Product', jobDescription: 'Own the roadmap and run experimentation programs.', resumeBlocks: blocks('Ran A/B tests for onboarding improvements.'),
    expectations: { shouldRecognizeMatched: [{ concept: 'Experimentation', anyOf: ['A/B tests'] }], shouldRecognizeMissing: [{ concept: 'Roadmap ownership', anyOf: ['Own the roadmap'] }], editableBlockIds: editable(0), forbiddenTermsInEdits: ['owned', 'owner'], maxAcceptedEdits: 8 },
  },
  {
    id: 'missing-kubernetes', category: 'DevOps', jobDescription: 'Deploy applications on Kubernetes and AWS.', resumeBlocks: blocks('Deployed applications to AWS.'),
    expectations: { shouldRecognizeMatched: [{ concept: 'AWS', anyOf: ['Deploy applications on AWS'] }], shouldRecognizeMissing: [{ concept: 'Kubernetes', anyOf: ['Deploy applications on Kubernetes'] }], editableBlockIds: editable(0), forbiddenTermsInEdits: ['Kubernetes'], maxAcceptedEdits: 8 },
  },
  {
    id: 'devops-aws-terraform-missing', category: 'DevOps', jobDescription: 'Manage AWS infrastructure with Terraform.', resumeBlocks: blocks('Managed AWS infrastructure.'),
    expectations: { shouldRecognizeMatched: [{ concept: 'AWS' }], shouldRecognizeMissing: [{ concept: 'Terraform' }], editableBlockIds: editable(0), forbiddenTermsInEdits: ['Terraform'], maxAcceptedEdits: 8 },
  },
  {
    id: 'devops-cicd-monitoring-aligned', category: 'DevOps', jobDescription: 'Maintain CI/CD pipelines and production monitoring.', resumeBlocks: blocks('Maintained CI/CD pipelines and Datadog monitoring dashboards.'),
    expectations: { shouldRecognizeMatched: [{ concept: 'CI/CD' }, { concept: 'Monitoring' }], editableBlockIds: editable(0), maxAcceptedEdits: 0 },
  },
  {
    id: 'unsupported-engineering-leadership', category: 'Safety/edge cases', jobDescription: 'Lead engineering teams and deliver reliable releases.', resumeBlocks: blocks('Worked with engineering team to deliver releases.'),
    expectations: { shouldRecognizeMissing: [{ concept: 'Engineering leadership', anyOf: ['Lead engineering teams', 'Team leadership'] }], editableBlockIds: editable(0), forbiddenTermsInEdits: ['led', 'lead', 'managed', 'owned', 'leadership'], forbiddenLeadershipTermsInEdits: ['led', 'lead', 'managed', 'owned'], maxAcceptedEdits: 8 },
  },
  {
    id: 'safety-mentored-not-managed', category: 'Safety/edge cases', jobDescription: 'Manage an engineering team.', resumeBlocks: blocks('Mentored 3 engineers on code reviews.'),
    expectations: { shouldRecognizeMissing: [{ concept: 'Engineering management', anyOf: ['Manage an engineering team'] }], editableBlockIds: editable(0), forbiddenTermsInEdits: ['managed', 'owned', 'led'], forbiddenLeadershipTermsInEdits: ['managed', 'owned', 'led'], protectedNumbers: ['3'], maxAcceptedEdits: 8 },
  },
  {
    id: 'safety-managed-not-owned', category: 'Safety/edge cases', jobDescription: 'Own product strategy.', resumeBlocks: blocks('Managed a support team of 6.'),
    expectations: { shouldRecognizeMissing: [{ concept: 'Product ownership', anyOf: ['Own product strategy'] }], editableBlockIds: editable(0), forbiddenTermsInEdits: ['owned', 'owner'], forbiddenLeadershipTermsInEdits: ['owned', 'owner'], protectedNumbers: ['6'], maxAcceptedEdits: 8 },
  },
  {
    id: 'experience-duration-insufficient', category: 'Safety/edge cases', jobDescription: 'Requires 5 years of backend engineering experience.', resumeBlocks: blocks('Have 3 years of backend engineering experience.'),
    expectations: { shouldRecognizeMissing: [{ concept: '5 years' }], editableBlockIds: editable(0), forbiddenTermsInEdits: ['5'], protectedNumbers: ['3'], maxAcceptedEdits: 0 },
  },
  {
    id: 'metric-protection', category: 'Safety/edge cases', jobDescription: 'Optimize checkout performance and operational efficiency.', resumeBlocks: blocks('Improved checkout latency by 25%.', 'Saved $120,000 annually.', 'Supported 50,000 users.', 'Mentored a team of 4.'),
    expectations: { shouldRecognizeMatched: [{ concept: 'Performance optimization', anyOf: ['Improve checkout latency'] }], editableBlockIds: editable(0, 1, 2, 3), protectedNumbers: ['25%', '120,000', '50,000', '4'], maxAcceptedEdits: 0 },
  },
  {
    id: 'skills-reordering-no-insert', category: 'Safety/edge cases', jobDescription: 'Build React applications with TypeScript and Kubernetes.', resumeBlocks: blocks('Skills: JavaScript, React, TypeScript'),
    expectations: { shouldRecognizeMatched: [{ concept: 'React' }, { concept: 'TypeScript' }], shouldRecognizeMissing: [{ concept: 'Kubernetes' }], editableBlockIds: editable(0), forbiddenTermsInEdits: ['Kubernetes'], maxAcceptedEdits: 8 },
  },
  {
    id: 'certification-education-domain-boundary', category: 'Safety/edge cases', jobDescription: 'Requires AWS Certified Solutions Architect, a master\'s degree, and healthcare experience.', resumeBlocks: blocks('Worked with AWS cloud services.', 'Bachelor of Science in Computer Science.', 'Built e-commerce checkout features.'),
    expectations: { shouldRecognizeMissing: [{ concept: 'AWS certification', anyOf: ['AWS Certified Solutions Architect'] }, { concept: 'Master\'s degree' }, { concept: 'Healthcare' }], editableBlockIds: editable(0, 1, 2), forbiddenTermsInEdits: ['certified', 'master', 'healthcare'], maxAcceptedEdits: 8 },
  },
  {
    id: 'master-backed-project-delivery', category: 'Product', jobDescription: 'Experience with project management, agile delivery, sprint planning, and release management.',
    resumeBlocks: experienceBlocks([{ header: 'Product Owner | Company A | 2022–Present', bullets: ['Worked with cross-functional teams on product delivery.'] }]),
    masterResumeStructure: masterStructure([{ header: 'Product Owner | Company A Pvt Ltd | 2022–Present', title: 'Product Owner', company: 'Company A Pvt Ltd', dateText: '2022–Present', bullets: ['Prioritized the product backlog.', 'Facilitated sprint planning.', 'Managed releases across two enterprise platforms.'] }]),
    expectations: { shouldRecognizeMatchedOrUnderstated: [{ concept: 'Project management' }, { concept: 'Agile delivery' }, { concept: 'Sprint planning' }, { concept: 'Release management' }], editableBlockIds: editable(1), maxAcceptedEdits: 8 },
  },
  {
    id: 'master-cross-experience-leak', category: 'Safety/edge cases', jobDescription: 'Build React applications with TypeScript.',
    resumeBlocks: experienceBlocks([{ header: 'Frontend Engineer | Company A | 2022–Present', bullets: ['Built React applications for product teams.'] }]),
    masterResumeStructure: masterStructure([
      { header: 'Frontend Engineer | Company A | 2022–Present', title: 'Frontend Engineer', company: 'Company A', dateText: '2022–Present', bullets: ['Built React applications.'] },
      { header: 'Software Engineer | Company B | 2019–2022', title: 'Software Engineer', company: 'Company B', dateText: '2019–2022', bullets: ['Built TypeScript applications.'] },
    ]),
    expectations: { shouldRecognizeMatched: [{ concept: 'React' }], shouldRecognizeMissing: [{ concept: 'TypeScript' }], editableBlockIds: editable(1), forbiddenTermsInEdits: ['TypeScript'], maxAcceptedEdits: 8 },
  },
  {
    id: 'master-jd-only-banking', category: 'Safety/edge cases', jobDescription: 'Business analysis experience in banking and reconciliation.',
    resumeBlocks: experienceBlocks([{ header: 'Business Analyst | Company A | 2022–Present', bullets: ['Gathered requirements for product delivery teams.'] }]),
    masterResumeStructure: masterStructure([{ header: 'Business Analyst | Company A | 2022–Present', title: 'Business Analyst', company: 'Company A', dateText: '2022–Present', bullets: ['Facilitated sprint planning and managed releases.'] }]),
    expectations: { shouldRecognizeMissing: [{ concept: 'Banking' }], editableBlockIds: editable(1), forbiddenTermsInEdits: ['banking'], maxAcceptedEdits: 8 },
  },
  {
    id: 'master-supported-metric', category: 'Safety/edge cases', jobDescription: 'Improve operational processing efficiency.',
    resumeBlocks: experienceBlocks([{ header: 'Operations Analyst | Company A | 2022–Present', bullets: ['Improved operational workflows for customer, reporting, quality, and delivery teams across regional business units, while coordinating intake, documentation, quality checks, handoffs, service requests, process reviews, stakeholder updates, issue tracking, and implementation support across multiple operational workstreams.'] }]),
    masterResumeStructure: masterStructure([{ header: 'Operations Analyst | Company A | 2022–Present', title: 'Operations Analyst', company: 'Company A', dateText: '2022–Present', bullets: ['Improved processing time by 35%.'] }]),
    expectations: { shouldRecognizeMatchedOrUnderstated: [{ concept: 'Processing efficiency', anyOf: ['Improve processing time'] }], editableBlockIds: editable(1), maxAcceptedEdits: 8 },
  },
  {
    id: 'master-supported-leadership', category: 'Safety/edge cases', jobDescription: 'Lead analyst teams and improve delivery.',
    resumeBlocks: experienceBlocks([{ header: 'Business Analyst | Company A | 2022–Present', bullets: ['Collaborated with analyst teams on delivery, reporting, requirements, quality, operations, customer support processes, stakeholder updates, work planning, issue tracking, documentation, process reviews, release coordination, service requests, implementation activities, planning workshops, status reporting, dependency tracking, stakeholder communications, delivery schedules, and quality assurance across regional delivery workstreams.'] }]),
    masterResumeStructure: masterStructure([{ header: 'Business Analyst | Company A | 2022–Present', title: 'Business Analyst', company: 'Company A', dateText: '2022–Present', bullets: ['Led a team of 4 analysts.'] }]),
    expectations: { shouldRecognizeMatchedOrUnderstated: [{ concept: 'Analyst leadership', anyOf: ['Lead analyst teams', 'Team leadership'] }], editableBlockIds: editable(1), maxAcceptedEdits: 8 },
  },
  {
    id: 'no-master-fallback', category: 'Safety/edge cases', jobDescription: 'Build Python APIs for internal applications.', resumeBlocks: blocks('Built Python APIs for internal applications.'),
    expectations: { shouldRecognizeMatched: [{ concept: 'Python APIs', anyOf: ['Build Python APIs for internal applications'] }], editableBlockIds: editable(0), maxAcceptedEdits: 0 },
  },
]
