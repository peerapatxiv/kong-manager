function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const KEYWORDS =
  'local|function|end|if|then|else|elseif|return|not|and|or|true|false|nil|for|while|do|break|in|repeat|until'

const TOKEN = new RegExp(
  `(--[^\\n]*)|("(?:[^"\\\\\\n]|\\\\.)*"|'(?:[^'\\\\\\n]|\\\\.)*')|(\\b\\d+(?:\\.\\d+)?\\b)|(\\b(?:${KEYWORDS})\\b)`,
  'g',
)

/**
 * Classifies Lua-ish plugin-function source (comments, strings, numbers,
 * keywords) into HTML spans for a lightweight highlight overlay. Not a real
 * Lua parser — just enough token recognition to make hand-written
 * pre-function/post-function snippets easier to scan.
 */
export function highlightLua(text: string): string {
  let result = ''
  let lastIndex = 0
  let match: RegExpExecArray | null
  TOKEN.lastIndex = 0
  while ((match = TOKEN.exec(text))) {
    result += escapeHtml(text.slice(lastIndex, match.index))
    const [full, comment, str, num, keyword] = match
    if (comment) result += `<span class="tok-comment">${escapeHtml(comment)}</span>`
    else if (str) result += `<span class="tok-string">${escapeHtml(str)}</span>`
    else if (num) result += `<span class="tok-number">${escapeHtml(num)}</span>`
    else if (keyword) result += `<span class="tok-key">${escapeHtml(keyword)}</span>`
    lastIndex = match.index + full.length
  }
  result += escapeHtml(text.slice(lastIndex))
  return result
}
