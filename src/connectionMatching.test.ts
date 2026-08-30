import { describe, expect, it } from 'vitest'
import { findCompanyConnections } from './connectionMatching'

const connections = [
  { firstName: 'Riya', lastName: 'Shah', company: 'North Star, Inc.', normalizedCompany: 'north star inc', position: 'Engineer', profileUrl: 'https://linkedin.com/in/riya' },
  { firstName: 'Aman', lastName: 'Khan', company: 'Blue River', normalizedCompany: 'blue river', position: 'Analyst', profileUrl: '' },
]

describe('findCompanyConnections', () => {
  it('matches normalized company names, regardless of case and punctuation', () => {
    expect(findCompanyConnections('NORTH STAR INC', connections).map((connection) => connection.firstName)).toEqual(['Riya'])
  })

  it('returns no connection when the hiring company does not match', () => {
    expect(findCompanyConnections('Other Company', connections)).toEqual([])
  })
})
