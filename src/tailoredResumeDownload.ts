export function resumeParagraphs(text: string) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
}

export function downloadResumeBlob(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
