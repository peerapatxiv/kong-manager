import { parseKongConfig, serializeKongConfig } from './yaml'
import { denormalizeKongConfig } from './kongConfigTransform'
import { adminFetch, adminJson } from './kongAdmin/http'
import type { KongAdminAuth } from './kongAdmin/http'
import type { KongConfig } from '../types/kong'

export { KongAdminApiError } from './kongAdmin/http'
export type { KongAdminAuth } from './kongAdmin/http'

export async function getConfig(baseUrl: string, auth?: KongAdminAuth): Promise<KongConfig> {
  const body = await adminJson<{ config: string }>({ baseUrl, auth }, 'GET', '/config')
  const expanded = parseKongConfig(body.config)
  return denormalizeKongConfig(expanded)
}

export async function setConfig(baseUrl: string, config: KongConfig, auth?: KongAdminAuth): Promise<void> {
  const yamlText = serializeKongConfig(config)
  await adminFetch({ baseUrl, auth }, 'POST', '/config', { body: { config: yamlText } })
}
