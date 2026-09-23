// src/lib/valueType.test.ts
import { describe, it, expect } from 'vitest'
import { inferValueType, isMultilineString } from './valueType'

describe('inferValueType', () => {
  it('classifies primitives', () => {
    expect(inferValueType('minute', 100)).toBe('number')
    expect(inferValueType('enabled', true)).toBe('boolean')
    expect(inferValueType('reopen', null)).toBe('null')
    expect(inferValueType('path', '/dev/stdout')).toBe('string')
  })

  it('classifies a Lua-looking or multi-line string as multiline-string', () => {
    expect(inferValueType('note', 'line one\nline two')).toBe('multiline-string')
    expect(inferValueType('rewrite', 'local ctx = kong.ctx.plugin')).toBe('multiline-string')
  })

  it('classifies arrays by element shape', () => {
    expect(inferValueType('key_names', ['apikey'])).toBe('string-array')
    expect(inferValueType('access', [])).toBe('string-array')
    expect(inferValueType('rows', [{ a: 1 }])).toBe('object-array')
  })

  it('classifies plain objects', () => {
    expect(inferValueType('nested', { a: 1 })).toBe('object')
  })
})

describe('isMultilineString', () => {
  it('flags newline-containing strings regardless of key', () => {
    expect(isMultilineString('anything', 'a\nb')).toBe(true)
  })

  it('flags known script-ish keys even without a newline', () => {
    expect(isMultilineString('header_filter', 'return foo')).toBe(true)
    expect(isMultilineString('access', 'kong.ctx.plugin.x = 1')).toBe(true)
  })

  it('leaves plain short strings alone', () => {
    expect(isMultilineString('path', '/dev/stdout')).toBe(false)
    expect(isMultilineString('policy', 'local')).toBe(false)
  })
})
