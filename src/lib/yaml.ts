import yaml from 'js-yaml'
import type { KongConfig } from '../types/kong'

export class YamlParseError extends Error {}

export function parseKongConfig(text: string): KongConfig {
  let parsed: unknown
  try {
    parsed = yaml.load(text)
  } catch (err) {
    throw new YamlParseError(err instanceof Error ? err.message : String(err))
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new YamlParseError('YAML document did not parse to a Kong config object')
  }
  return parsed as KongConfig
}

export function serializeKongConfig(config: KongConfig): string {
  return yaml.dump(config, { sortKeys: false })
}

export function parseYamlEntity(text: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = yaml.load(text)
  } catch (err) {
    throw new YamlParseError(err instanceof Error ? err.message : String(err))
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new YamlParseError('YAML did not parse to an object')
  }
  return parsed as Record<string, unknown>
}

export function dumpYamlEntity(entity: Record<string, unknown>): string {
  return yaml.dump(entity, { sortKeys: false })
}
