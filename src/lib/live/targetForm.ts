export type TargetForm = { target: string; weight: number | ''; tags: string[] }

// The index signature lets Kong rows typed as LiveEntity match; without it TypeScript treats
// an all-optional type as "weak" and rejects them.
export type TargetLike = {
  target?: unknown
  weight?: unknown
  created_at?: unknown
  upstream?: unknown
  [key: string]: unknown
}

export function newTargetForm(): TargetForm {
  return { target: '', weight: 100, tags: [] }
}

// host, IPv4 or [IPv6], optionally followed by :port.
const TARGET_PATTERN = /^(?:[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?|\[[0-9A-Fa-f:.]+\])(?::(\d{1,5}))?$/

export function validateTarget(form: TargetForm): string[] {
  const errors: string[] = []
  const match = TARGET_PATTERN.exec(form.target.trim())
  const port = match?.[1] === undefined ? undefined : Number(match[1])
  if (!match || (port !== undefined && (port < 1 || port > 65535))) {
    errors.push('Please provide a target as host, host:port or [ipv6]:port.')
  }
  if (form.weight !== '' && (!Number.isInteger(form.weight) || form.weight < 0 || form.weight > 65535)) {
    errors.push('Weight must be a whole number from 0 to 65535.')
  }
  return errors
}

export function toTargetPayload(form: TargetForm): Record<string, unknown> {
  return {
    target: form.target.trim(),
    ...(form.weight !== '' ? { weight: form.weight } : {}),
    tags: form.tags.map((tag) => tag.trim()).filter(Boolean),
  }
}

const createdAt = (entry: TargetLike): number => (typeof entry.created_at === 'number' ? entry.created_at : 0)

/**
 * Kong lists a target's whole history: changing a weight adds a row and removing one adds a
 * weight 0 row. The newest row per address is the current one, and weight 0 means it is gone.
 */
export function targetsByAddress<T extends TargetLike>(targets: T[]): T[] {
  const newest = new Map<string, T>()
  for (const entry of targets) {
    if (typeof entry.target !== 'string') continue
    const seen = newest.get(entry.target)
    if (!seen || createdAt(entry) >= createdAt(seen)) newest.set(entry.target, entry)
  }
  return [...newest.values()]
    .filter((entry) => entry.weight !== 0)
    .sort((a, b) => String(a.target).localeCompare(String(b.target)))
}

/** How many current targets each upstream has, from one listing of every target. */
export function countTargetsByUpstream(targets: TargetLike[]): Record<string, number> {
  const byUpstream = new Map<string, TargetLike[]>()
  for (const entry of targets) {
    const id = (entry.upstream as { id?: unknown } | null | undefined)?.id
    if (typeof id !== 'string') continue
    byUpstream.set(id, [...(byUpstream.get(id) ?? []), entry])
  }
  return Object.fromEntries([...byUpstream].map(([id, rows]) => [id, targetsByAddress(rows).length]))
}
