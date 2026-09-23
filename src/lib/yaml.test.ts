// src/lib/yaml.test.ts
import { describe, it, expect } from 'vitest'
import { parseKongConfig, serializeKongConfig, YamlParseError } from './yaml'

const SAMPLE = `_format_version: "3.0"
services:
- name: svc-a
  host: a.internal
  port: 8080
  routes:
  - name: route-a
    paths:
    - /a
upstreams:
- name: unmodeled-upstream
  algorithm: round-robin
`

describe('parseKongConfig', () => {
  it('parses a valid Kong config', () => {
    const config = parseKongConfig(SAMPLE)
    expect(config._format_version).toBe('3.0')
    expect(config.services?.[0].name).toBe('svc-a')
  })

  it('throws YamlParseError on malformed YAML', () => {
    expect(() => parseKongConfig('services: [unclosed')).toThrow(YamlParseError)
  })

  it('throws YamlParseError when the document is not an object', () => {
    expect(() => parseKongConfig('- just\n- a\n- list\n')).toThrow(YamlParseError)
  })
})

describe('round-trip fidelity', () => {
  it('preserves key order and unmodeled top-level keys through load -> dump', () => {
    const config = parseKongConfig(SAMPLE)
    const dumped = serializeKongConfig(config)
    const reparsed = parseKongConfig(dumped)

    expect(reparsed).toEqual(config)
    expect(dumped.indexOf('_format_version')).toBeLessThan(dumped.indexOf('services'))
    expect(dumped.indexOf('services')).toBeLessThan(dumped.indexOf('upstreams'))
    expect(reparsed.upstreams).toEqual(config.upstreams)
  })
})
