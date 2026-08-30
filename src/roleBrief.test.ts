import { describe, expect, it } from 'vitest'
import { createRoleBrief } from './roleBrief'

describe('createRoleBrief', () => {
  it('separates the role overview and main responsibilities from company boilerplate', () => {
    const brief = createRoleBrief('GitLab is a DevSecOps platform used by teams worldwide. An overview of this role As a Backend Engineer, you will build services for disaster recovery. You will work with Rails and PostgreSQL to improve replication. What you’ll do Design backend functionality for backup and restore. Improve replication workflows for speed and reliability. Collaborate with infrastructure teams. What you’ll bring Experience with Ruby on Rails.')

    expect(brief.summary).toBe('As a Backend Engineer, you will build services for disaster recovery. You will work with Rails and PostgreSQL to improve replication.')
    expect(brief.responsibilities).toEqual([
      'Design backend functionality for backup and restore.',
      'Improve replication workflows for speed and reliability.',
      'Collaborate with infrastructure teams.',
    ])
  })

  it('does not pretend company boilerplate is a role summary when no role section exists', () => {
    expect(createRoleBrief('We are a global company with a strong culture and many customers.').summary).toBeNull()
  })
})
