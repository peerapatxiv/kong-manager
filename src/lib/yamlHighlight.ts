function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const LEADING_DASH = /^(\s*)(-\s+)?/
const KEY = /^([\w.-]+)(:)(\s|$)/
const COMMENT = /(#.*)$/
const BOOLEAN_OR_NULL = /^(true|false|null|~)$/i
const NUMBER = /^-?\d+(\.\d+)?$/

/**
 * Classifies a single YAML line into HTML spans for a lightweight highlight
 * overlay. Not a real YAML parser — just enough token recognition (keys,
 * dashes, comments, strings/numbers/booleans) to color-code the common shapes
 * this app's config values take, without pulling in a parser/editor dependency.
 */
export function highlightYamlLine(line: string): string {
  const commentMatch = line.match(COMMENT)
  const codePart = commentMatch ? line.slice(0, commentMatch.index) : line
  const commentPart = commentMatch ? commentMatch[1] : ''

  const dashMatch = codePart.match(LEADING_DASH)
  const prefix = dashMatch ? dashMatch[0] : ''
  const rest = codePart.slice(prefix.length)

  let html = escapeHtml(prefix).replace(/-/, '<span class="tok-punct">-</span>')

  const keyMatch = rest.match(KEY)
  if (keyMatch) {
    const [, key, colon, space] = keyMatch
    const value = rest.slice(keyMatch[0].length)
    html += `<span class="tok-key">${escapeHtml(key)}</span><span class="tok-punct">${colon}</span>${escapeHtml(space)}`
    html += highlightScalar(value)
  } else {
    html += highlightScalar(rest)
  }

  if (commentPart) html += `<span class="tok-comment">${escapeHtml(commentPart)}</span>`
  return html
}

function highlightScalar(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return escapeHtml(value)

  let cls = 'tok-string'
  if (BOOLEAN_OR_NULL.test(trimmed)) cls = 'tok-boolean'
  else if (NUMBER.test(trimmed)) cls = 'tok-number'
  else if (trimmed === '|' || trimmed === '>' || trimmed === '{}' || trimmed === '[]') cls = 'tok-punct'

  const leading = value.slice(0, value.indexOf(trimmed))
  const trailing = value.slice(value.indexOf(trimmed) + trimmed.length)
  return `${escapeHtml(leading)}<span class="${cls}">${escapeHtml(trimmed)}</span>${escapeHtml(trailing)}`
}

export function highlightYaml(text: string): string {
  return text
    .split('\n')
    .map((line) => highlightYamlLine(line))
    .join('\n')
}
