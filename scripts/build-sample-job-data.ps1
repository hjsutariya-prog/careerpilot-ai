Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.IO.Compression.FileSystem

$projectRoot = Split-Path -Parent $PSScriptRoot
$inputPath = Join-Path $projectRoot 'data\sample-jobs.xlsx'
$outputPath = Join-Path $projectRoot 'src\data\sampleJobs.ts'
$requiredHeaders = @(
  'job_title', 'company_name', 'city', 'work_preference', 'job_type',
  'experience_required', 'skills', 'apply_url', 'source', 'posted_date',
  'is_active', 'job_description', 'last_checked_date'
)

if (-not (Test-Path -LiteralPath $inputPath)) {
  throw "Missing sample job workbook: $inputPath"
}

function Read-ZipText([System.IO.Compression.ZipArchive]$zip, [string]$entryName) {
  $entry = $zip.GetEntry($entryName)
  if (-not $entry) { throw "Workbook entry not found: $entryName" }
  $reader = [System.IO.StreamReader]::new($entry.Open())
  try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
}

function New-SpreadsheetNamespaceManager([xml]$document) {
  $manager = [System.Xml.XmlNamespaceManager]::new($document.NameTable)
  $manager.AddNamespace('x', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')
  return ,$manager
}

function New-RelationshipNamespaceManager([xml]$document) {
  $manager = [System.Xml.XmlNamespaceManager]::new($document.NameTable)
  $manager.AddNamespace('r', 'http://schemas.openxmlformats.org/package/2006/relationships')
  return ,$manager
}

function Get-CellValue($cell, [string[]]$sharedStrings) {
  $namespaceManager = New-SpreadsheetNamespaceManager $cell.OwnerDocument
  $type = $cell.GetAttribute('t')
  if ($type -eq 's') { return $sharedStrings[[int]($cell.SelectSingleNode('x:v', $namespaceManager).InnerText)] }
  if ($type -eq 'inlineStr') { return $cell.SelectSingleNode('x:is', $namespaceManager).InnerText }
  $valueNode = $cell.SelectSingleNode('x:v', $namespaceManager)
  if ($valueNode) { return $valueNode.InnerText }
  return $null
}

function Convert-ExcelDateToIso($value, [int]$rowNumber, [string]$fieldName) {
  if ($value -is [double] -or $value -is [int] -or $value -match '^\d+(\.\d+)?$') {
    return [DateTime]::FromOADate([double]$value).ToString('yyyy-MM-dd')
  }

  $parsed = [DateTime]::MinValue
  if ([DateTime]::TryParse([string]$value, [ref]$parsed)) {
    return $parsed.ToString('yyyy-MM-dd')
  }

  throw "Row $rowNumber has an invalid $fieldName value: $value"
}

function Convert-ToNullableNumber($value) {
  if ([string]::IsNullOrWhiteSpace([string]$value)) { return $null }
  $parsed = 0.0
  if (-not [double]::TryParse([string]$value, [ref]$parsed)) { return $null }
  return $parsed
}

function Get-NormalizedCity([string]$city) {
  $trimmed = $city.Trim()
  if ($trimmed -match '^Bengaluru') { return 'Bengaluru' }
  if ($trimmed -match 'Mumbai') { return 'Mumbai' }
  if ($trimmed -match 'Hyderabad') { return 'Hyderabad' }
  if ($trimmed -match '^Chennai') { return 'Chennai' }
  if ($trimmed -match '^Pune') { return 'Pune' }
  if ($trimmed -match 'Kolkata') { return 'Kolkata' }
  if ($trimmed -match 'Delhi|Gurugram|Noida') { return 'Delhi NCR' }
  if ($trimmed -match '^Remote') { return 'Remote' }
  return ($trimmed -replace ',.*$', '').Trim()
}

function New-SampleJobId([string]$companyName, [string]$jobTitle, [string]$applyUrl) {
  $text = "$companyName|$jobTitle|$applyUrl".ToLowerInvariant()
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($text)
  $hasher = [System.Security.Cryptography.SHA256]::Create()
  try { $hash = $hasher.ComputeHash($bytes) } finally { $hasher.Dispose() }
  $value = [System.BitConverter]::ToString($hash).Replace('-', '').Substring(0, 16).ToLowerInvariant()
  return "sample-$value"
}

$zip = [System.IO.Compression.ZipFile]::OpenRead($inputPath)
try {
  $sharedStrings = @()
  if ($zip.GetEntry('xl/sharedStrings.xml')) {
    $sharedDocument = [xml](Read-ZipText $zip 'xl/sharedStrings.xml')
    $sharedNamespaceManager = New-SpreadsheetNamespaceManager $sharedDocument
    $sharedStrings = @($sharedDocument.SelectNodes('//x:sst/x:si', $sharedNamespaceManager) | ForEach-Object { $_.InnerText })
  }

  $workbookDocument = [xml](Read-ZipText $zip 'xl/workbook.xml')
  $relationshipsDocument = [xml](Read-ZipText $zip 'xl/_rels/workbook.xml.rels')
  $workbookNamespaceManager = New-SpreadsheetNamespaceManager $workbookDocument
  $relationshipsNamespaceManager = New-RelationshipNamespaceManager $relationshipsDocument
  $jobsSheet = $workbookDocument.SelectSingleNode('/x:workbook/x:sheets/x:sheet[@name="Jobs"]', $workbookNamespaceManager)
  if (-not $jobsSheet) { throw 'Workbook must contain a sheet named Jobs.' }

  $relationshipId = $jobsSheet.GetAttribute('id', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
  $relationship = $relationshipsDocument.SelectSingleNode("/r:Relationships/r:Relationship[@Id='$relationshipId']", $relationshipsNamespaceManager)
  if (-not $relationship) { throw 'Could not find the Jobs sheet relationship.' }

  $worksheetPath = $relationship.Target.Replace('\', '/').TrimStart('/')
  if (-not $worksheetPath.StartsWith('xl/')) { $worksheetPath = 'xl/' + $worksheetPath }
  $worksheetDocument = [xml](Read-ZipText $zip $worksheetPath)
  $worksheetNamespaceManager = New-SpreadsheetNamespaceManager $worksheetDocument
  $rows = @($worksheetDocument.SelectNodes('//x:worksheet/x:sheetData/x:row', $worksheetNamespaceManager))
  $headerRow = @($rows | Where-Object {
    @($_.SelectNodes('x:c', $worksheetNamespaceManager) | ForEach-Object { Get-CellValue $_ $sharedStrings }) -contains 'job_title'
  } | Select-Object -First 1)
  if (-not $headerRow) { throw 'Could not find the row containing the job_title header.' }

  $headersByColumn = @{}
  foreach ($cell in @($headerRow.SelectNodes('x:c', $worksheetNamespaceManager))) {
    $column = ($cell.r -replace '\d', '')
    $headersByColumn[$column] = [string](Get-CellValue $cell $sharedStrings)
  }

  $missingHeaders = @($requiredHeaders | Where-Object { $headersByColumn.Values -notcontains $_ })
  if ($missingHeaders.Count -gt 0) { throw "Jobs sheet is missing required columns: $($missingHeaders -join ', ')" }

  $jobs = @()
  $invalidRows = @()
  $seenUrls = @{}
  foreach ($row in @($rows | Where-Object { [int]$_.r -gt [int]$headerRow.r })) {
    $record = @{}
    foreach ($header in $headersByColumn.Values) { $record[$header] = $null }
    foreach ($cell in @($row.SelectNodes('x:c', $worksheetNamespaceManager))) {
      $column = ($cell.r -replace '\d', '')
      if ($headersByColumn.ContainsKey($column)) {
        $record[$headersByColumn[$column]] = [string](Get-CellValue $cell $sharedStrings)
      }
    }

    $rowNumber = [int]$row.r
    $missingValues = @($requiredHeaders | Where-Object { [string]::IsNullOrWhiteSpace($record[$_]) })
    if ($missingValues.Count -gt 0) {
      $invalidRows += "Row $rowNumber is missing: $($missingValues -join ', ')"
      continue
    }
    if ($record['apply_url'] -notmatch '^https://') {
      $invalidRows += "Row $rowNumber has a non-HTTPS apply_url."
      continue
    }
    if ($seenUrls.ContainsKey($record['apply_url'])) {
      $invalidRows += "Row $rowNumber duplicates apply_url from row $($seenUrls[$record['apply_url']])."
      continue
    }
    $seenUrls[$record['apply_url']] = $rowNumber

    try {
      $postedDate = Convert-ExcelDateToIso $record['posted_date'] $rowNumber 'posted_date'
      $lastCheckedDate = Convert-ExcelDateToIso $record['last_checked_date'] $rowNumber 'last_checked_date'
    } catch {
      $invalidRows += $_.Exception.Message
      continue
    }

    $cityLabels = @($record['city'] -split ';' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    $jobs += [ordered]@{
      id = New-SampleJobId $record['company_name'] $record['job_title'] $record['apply_url']
      title = $record['job_title'].Trim()
      companyName = $record['company_name'].Trim()
      cityLabel = $record['city'].Trim()
      cities = @($cityLabels | ForEach-Object { Get-NormalizedCity $_ } | Select-Object -Unique)
      workPreference = $record['work_preference'].Trim()
      jobType = $record['job_type'].Trim()
      experienceRequired = $record['experience_required'].Trim()
      skills = @($record['skills'] -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
      applyUrl = $record['apply_url'].Trim()
      source = $record['source'].Trim()
      postedDate = $postedDate
      isActive = $record['is_active'].Trim() -eq 'Yes'
      description = $record['job_description'].Trim()
      salaryMinLakh = Convert-ToNullableNumber $record['salary_min_lakh']
      salaryMaxLakh = Convert-ToNullableNumber $record['salary_max_lakh']
      employerJobId = $record['employer_job_id']
      greenhouseJobId = $record['greenhouse_job_id']
      lastCheckedDate = $lastCheckedDate
    }
  }

  if ($invalidRows.Count -gt 0) { throw "Sample job conversion failed:`n$($invalidRows -join "`n")" }
  if ($jobs.Count -eq 0) { throw 'The Jobs sheet contains no usable job rows.' }

  $outputDirectory = Split-Path -Parent $outputPath
  if (-not (Test-Path -LiteralPath $outputDirectory)) { New-Item -ItemType Directory -Path $outputDirectory | Out-Null }
  $json = $jobs | ConvertTo-Json -Depth 6
  $module = @"
// Generated from data/sample-jobs.xlsx. Run npm.cmd run build:sample-jobs after updating the workbook.
export type SampleJob = {
  id: string
  title: string
  companyName: string
  cityLabel: string
  cities: string[]
  workPreference: string
  jobType: string
  experienceRequired: string
  skills: string[]
  applyUrl: string
  source: string
  postedDate: string
  isActive: boolean
  description: string
  salaryMinLakh: number | null
  salaryMaxLakh: number | null
  employerJobId: string | null
  greenhouseJobId: string | null
  lastCheckedDate: string
}

export const sampleSnapshotLabel = 'Checked job snapshot'
export const sampleJobs: SampleJob[] = $json
"@
  Set-Content -LiteralPath $outputPath -Value $module -Encoding utf8
  Write-Output "Generated $($jobs.Count) sample jobs at $outputPath"
} finally {
  $zip.Dispose()
}
