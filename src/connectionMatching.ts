import { normaliseCompany } from './connectionCsv'

export type CompanyConnection = {
  firstName: string
  lastName: string
  company: string
  normalizedCompany: string
  position: string
  profileUrl: string
}

export function findCompanyConnections(company: string, connections: readonly CompanyConnection[]) {
  const normalizedCompany = normaliseCompany(company)
  if (!normalizedCompany) return []
  return connections.filter((connection) => (connection.normalizedCompany || normaliseCompany(connection.company)) === normalizedCompany)
}
