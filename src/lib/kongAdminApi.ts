import { parseKongConfig, serializeKongConfig } from './yaml'
import { denormalizeKongConfig } from './kongConfigTransform'
import type { KongConfig } from '../types/kong'

export class KongAdminApiError extends Error {}

export type KongAdminAuth = {
  token?: string
  username?: string
  password?: string
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

function buildHeaders(auth?: KongAdminAuth): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (auth?.token) headers['Kong-Admin-Token'] = auth.token
  if (auth?.username) headers['Authorization'] = `Basic ${btoa(`${auth.username}:${auth.password ?? ''}`)}`
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

export async function getConfig(baseUrl: string, auth?: KongAdminAuth): Promise<KongConfig> {
  const response = await request(baseUrl, { headers: buildHeaders(auth) })
  await assertOk(response)
  const body = (await response.json()) as { config: string }
  const expanded = parseKongConfig(body.config)
  return denormalizeKongConfig(expanded)
}

export async function setConfig(baseUrl: string, config: KongConfig, auth?: KongAdminAuth): Promise<void> {
  const yamlText = serializeKongConfig(config)
  const response = await request(baseUrl, {
    method: 'POST',
    headers: buildHeaders(auth),
    body: JSON.stringify({ config: yamlText }),
  })
  await assertOk(response)
}
