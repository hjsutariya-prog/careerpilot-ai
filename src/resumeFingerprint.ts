function normalisedResumeText(text: string) {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

export async function sha256Text(text: string) {
  const bytes = new TextEncoder().encode(normalisedResumeText(text))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('')
}
