function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function safeHref(value = '') {
  const href = String(value || '').trim()
  if (href.startsWith('#') || href.startsWith('/') || /^https?:\/\//i.test(href) || /^mailto:/i.test(href)) return href
  return '#'
}

function inline(text) {
  let out = escapeHtml(text)
  const code = []
  out = out.replace(/`([^`]+)`/g, (_, value) => {
    const token = `@@TEC_TAC_CODE_${code.length}@@`
    code.push(`<code>${value}</code>`)
    return token
  })
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    const safe = safeHref(href)
    const external = /^https?:\/\//i.test(safe)
    return `<a href="${escapeHtml(safe)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`
  })
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  code.forEach((value, index) => { out = out.replace(`@@TEC_TAC_CODE_${index}@@`, value) })
  return out
}

function slug(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 80)
}

export function renderMarkdown(markdown = '') {
  const source = String(markdown || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const body = source.startsWith('---\n') && source.indexOf('\n---\n', 4) >= 0
    ? source.slice(source.indexOf('\n---\n', 4) + 5)
    : source
  const normalizedBody = body.replace(/^#\s+.+\n+/, '')
  const lines = normalizedBody.split('\n')
  const html = []
  let paragraph = []
  let listType = null
  let inCode = false
  let codeLanguage = ''
  let codeLines = []

  const flushParagraph = () => {
    if (!paragraph.length) return
    html.push(`<p>${inline(paragraph.join(' '))}</p>`)
    paragraph = []
  }
  const closeList = () => {
    if (!listType) return
    html.push(`</${listType}>`)
    listType = null
  }
  const flushCode = () => {
    html.push(`<pre><code${codeLanguage ? ` class="language-${escapeHtml(codeLanguage)}"` : ''}>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
    codeLanguage = ''
    codeLines = []
  }

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')
    if (inCode) {
      if (/^```/.test(line.trim())) {
        inCode = false
        flushCode()
      } else codeLines.push(raw)
      continue
    }
    const fence = line.match(/^```\s*([\w-]+)?\s*$/)
    if (fence) {
      flushParagraph(); closeList(); inCode = true; codeLanguage = fence[1] || ''; continue
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/)
    if (heading) {
      flushParagraph(); closeList()
      const level = heading[1].length
      const text = heading[2].trim()
      html.push(`<h${level} id="${slug(text)}">${inline(text)}</h${level}>`)
      continue
    }
    if (/^---+$/.test(line.trim())) {
      flushParagraph(); closeList(); html.push('<hr>'); continue
    }
    const unordered = line.match(/^\s*[-*]\s+(.+)$/)
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/)
    if (unordered || ordered) {
      flushParagraph()
      const wanted = unordered ? 'ul' : 'ol'
      if (listType !== wanted) { closeList(); listType = wanted; html.push(`<${wanted}>`) }
      html.push(`<li>${inline((unordered || ordered)[1])}</li>`)
      continue
    }
    if (!line.trim()) {
      flushParagraph(); closeList(); continue
    }
    paragraph.push(line.trim())
  }
  if (inCode) flushCode()
  flushParagraph(); closeList()
  return html.join('\n')
}
