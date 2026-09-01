import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

export const MAX_RESUME_BYTES = 10 * 1024 * 1024

const supportedResumeTypes = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

export function isSupportedResume(file: File) {
  return supportedResumeTypes.has(file.type)
}

export async function extractReadableResumeText(file: File) {
  if (file.type === 'application/pdf') {
    const pdfjs = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
    const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
    let text = ''
    for (let page = 1; page <= document.numPages; page += 1) {
      const content = await document.getPage(page).then((value) => value.getTextContent())
      text += content.items.map((item) => 'str' in item ? item.str : '').join(' ')
    }
    return text.trim()
  }

  const mammoth = await import('mammoth/mammoth.browser')
  return (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value.trim()
}
