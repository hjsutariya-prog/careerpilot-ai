const allowedTags = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'blockquote'])
const blockedTags = new Set(['script', 'style', 'iframe', 'object', 'embed', 'img', 'svg', 'video', 'audio', 'form', 'input', 'button'])

function fallbackText(value: string) {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

export function decodeEncodedMarkup(value: string) {
  let decoded = value
  for (let pass = 0; pass < 2 && /&lt;\/?[a-z]/i.test(decoded); pass += 1) {
    decoded = decoded
      .replace(/&nbsp;/gi, ' ')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&amp;/gi, '&')
  }
  return decoded
}

function safeSourceHtml(value: string) {
  if (typeof DOMParser === 'undefined') return `<p>${fallbackText(value)}</p>`

  const document = new DOMParser().parseFromString(decodeEncodedMarkup(value), 'text/html')
  for (const element of [...document.body.querySelectorAll('*')]) {
    const tag = element.tagName.toLowerCase()
    if (blockedTags.has(tag)) {
      element.remove()
      continue
    }
    if (!allowedTags.has(tag)) {
      element.replaceWith(...[...element.childNodes])
      continue
    }
    for (const attribute of [...element.attributes]) element.removeAttribute(attribute.name)
  }

  return document.body.innerHTML || `<p>${fallbackText(value)}</p>`
}

export function FormattedJobDescription({ html, fallback }: { html: string | null; fallback: string }) {
  return <div className="formatted-job-description" dangerouslySetInnerHTML={{ __html: safeSourceHtml(html || fallback) }} />
}
