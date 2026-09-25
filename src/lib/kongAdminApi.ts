import { parseKongConfig, serializeKongConfig } from './yaml'
import { denormalizeKongConfig } from './kongConfigTransform'
import type { KongConfig } from '../types/kong'

export class KongAdminApiError extends Error {}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

function buildHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Kong-Admin-Token'] = token
  return headers
}

async function request(baseUrl: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${normalizeBaseUrl(baseUrl)}/config`, init)
  } catch (err) {
    throw new KongAdminApiError(err instanceof Error ? err.message : String(err))
  }
}

async function assertOk(response: Response): Promise<void> {
  if (!response.ok) {
    throw new KongAdminApiError(`Kong Admin API responded ${response.status}: ${await response.text()}`)
  }
}

export async function getConfig(baseUrl: string, token?: string): Promise<KongConfig> {
  const response = await request(baseUrl, { headers: buildHeaders(token) })
  await assertOk(response)
  const body = (await response.json()) as { config: string }
  const expanded = parseKongConfig(body.config)
  return denormalizeKongConfig(expanded)
}

export async function setConfig(baseUrl: string, config: KongConfig, token?: string): Promise<void> {
  const yamlText = serializeKongConfig(config)
  const response = await request(baseUrl, {
    method: 'POST',
    headers: buildHeaders(token),
    body: JSON.stringify({ config: yamlText }),
  })
  await assertOk(response)
}
