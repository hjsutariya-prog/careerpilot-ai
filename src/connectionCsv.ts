export type ImportedConnection = {
  rowNumber: number
  firstName: string
  lastName: string
  profileUrl: string
  email: string
  company: string
  normalizedCompany: string
  position: string
  connectedOn: string
}

export type ConnectionImportError = {
  rowNumber: number
  message: string
}

export type ConnectionImportPreview = {
  totalRows: number
  validConnections: ImportedConnection[]
  errors: ConnectionImportError[]
}

const linkedInHeaders = ['First Name', 'Last Name', 'URL', 'Email Address', 'Company', 'Position', 'Connected On']

function normaliseHeader(value: string) {
  return value.replace(/^\uFEFF/, '').trim().toLowerCase()
}

export function normaliseCompany(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character === '"') {
      if (inQuotes && text[index + 1] === '"') {
        cell += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (character === ',' && !inQuotes) {
      row.push(cell)
      cell = ''
      continue
    }
    if (character === '\n' && !inQuotes) {
      row.push(cell.replace(/\r$/, ''))
      rows.push(row)
      row = []
      cell = ''
      continue
    }
    cell += character
  }

  if (inQuotes) throw new Error('This CSV has an unfinished quoted value. Export it from LinkedIn again and try once more.')
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.replace(/\r$/, ''))
    rows.push(row)
  }
  return rows
}

function findLinkedInHeader(rows: string[][]) {
  const requiredHeaders = new Set(linkedInHeaders.map(normaliseHeader))
  const headerIndex = rows.findIndex((row) => {
    const values = new Set(row.map(normaliseHeader))
    return [...requiredHeaders].every((header) => values.has(header))
  })
  if (headerIndex === -1) throw new Error('This CSV is missing LinkedIn connection columns. Export the Connections file from LinkedIn and try again.')

  const indexes = new Map(rows[headerIndex].map((value, index) => [normaliseHeader(value), index]))
  return { headerIndex, indexes }
}

function valueAt(row: string[], indexes: Map<string, number>, header: string) {
  return (row[indexes.get(normaliseHeader(header)) ?? -1] ?? '').trim()
}

export function previewLinkedInConnectionsCsv(text: string): ConnectionImportPreview {
  const rows = parseCsv(text)
  const { headerIndex, indexes } = findLinkedInHeader(rows)
  const validConnections: ImportedConnection[] = []
  const errors: ConnectionImportError[] = []
  const dataRows = rows.slice(headerIndex + 1)

  dataRows.forEach((row, offset) => {
    if (row.every((value) => !value.trim())) return
    const rowNumber = headerIndex + offset + 2
    const firstName = valueAt(row, indexes, 'First Name')
    const lastName = valueAt(row, indexes, 'Last Name')
    const company = valueAt(row, indexes, 'Company')

    if (!firstName && !lastName) {
      errors.push({ rowNumber, message: 'Add this connection’s name before importing it.' })
      return
    }
    if (!company) {
      errors.push({ rowNumber, message: 'Add this connection’s current company to match it with jobs.' })
      return
    }

    validConnections.push({
      rowNumber,
      firstName,
      lastName,
      profileUrl: valueAt(row, indexes, 'URL'),
      email: valueAt(row, indexes, 'Email Address'),
      company,
      normalizedCompany: normaliseCompany(company),
      position: valueAt(row, indexes, 'Position'),
      connectedOn: valueAt(row, indexes, 'Connected On'),
    })
  })

  return { totalRows: dataRows.filter((row) => !row.every((value) => !value.trim())).length, validConnections, errors }
}
