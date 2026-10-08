import { adminJson } from './http'
import type { KongAdminConnection } from './http'

export type TargetHealth = { target: string; weight: number | undefined; health: string | undefined }

function readWeight(value: unknown): number | undefined {
  if (typeof value === 'number') return value
  const total = (value as { total?: unknown } | null | undefined)?.total
  return typeof total === 'number' ? total : undefined
}

/** Reads Kong's `/upstreams/{id}/health` body, tolerating anything unexpected by skipping it. */
export function parseUpstreamHealth(raw: unknown): TargetHealth[] {
  if (typeof raw !== 'object' || raw === null) return []
  const data = (raw as { data?: unknown }).data
  if (!Array.isArray(data)) return []
  const rows: TargetHealth[] = []
  for (const item of data) {
    if (typeof item !== 'object' || item === null) continue
    const row = item as { target?: unknown; weight?: unknown; health?: unknown }
    if (typeof row.target !== 'string' || row.target === '') continue
    rows.push({
      target: row.target,
      weight: readWeight(row.weight),
      health: typeof row.health === 'string' ? row.health : undefined,
    })
  }
  return rows
}

export async function getUpstreamHealth(conn: KongAdminConnection, upstreamId: string): Promise<TargetHealth[]> {
  const body = await adminJson<unknown>(conn, 'GET', `/upstreams/${encodeURIComponent(upstreamId)}/health`)
  return parseUpstreamHealth(body)
}
