import { describe, it, expect } from 'vitest'
import { highlightYamlLine, highlightYaml } from './yamlHighlight'

describe('highlightYamlLine', () => {
  it('wraps a key and colors a string value', () => {
    expect(highlightYamlLine('name: svc-a')).toBe(
      '<span class="tok-key">name</span><span class="tok-punct">:</span> <span class="tok-string">svc-a</span>',
    )
  })

  it('colors number and boolean scalars', () => {
    expect(highlightYamlLine('port: 8080')).toContain('<span class="tok-number">8080</span>')
    expect(highlightYamlLine('enabled: true')).toContain('<span class="tok-boolean">true</span>')
  })

  it('marks a leading list dash as punctuation', () => {
    const html = highlightYamlLine('- /billing')
    expect(html).toContain('<span class="tok-punct">-</span>')
    expect(html).toContain('<span class="tok-string">/billing</span>')
  })

  it('colors a trailing comment', () => {
    expect(highlightYamlLine('port: 8080 # public port')).toContain(
      '<span class="tok-comment"># public port</span>',
    )
  })

  it('escapes HTML-significant characters so untrusted config values cannot inject markup', () => {
    const html = highlightYamlLine('name: <script>&"</script>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;&amp;"&lt;/script&gt;')
  })
})

describe('highlightYaml', () => {
  it('highlights each line independently and rejoins with newlines', () => {
    const html = highlightYaml('name: svc-a\nport: 8080')
    expect(html.split('\n')).toHaveLength(2)
    expect(html).toContain('tok-key')
    expect(html).toContain('tok-number')
  })
})
