import { ref } from 'vue'
import type { Ref } from 'vue'
import { KongAdminApiError } from '../lib/kongAdmin/http'
import type { EntityClient, EntityResourceName } from '../lib/kongAdmin/entities'
import { useConnectionStore } from '../stores/connection'

export type LiveEntity = { id: string; [key: string]: unknown }
export type LiveError = { message: string; fields?: Record<string, unknown> }

export function toLiveError(err: unknown): LiveError {
  if (err instanceof KongAdminApiError) {
    return { message: err.kongMessage ?? err.message, ...(err.fields ? { fields: err.fields } : {}) }
  }
  return { message: err instanceof Error ? err.message : String(err) }
}

export type UseLiveEntitiesOptions = {
  /** Parent id for nested resources such as targets. A getter is read on every call. */
  parentId?: string | (() => string | undefined)
  /** Lists through another resource (for example a service's routes) while writes use `resource`. */
  listVia?: () => { resource: EntityResourceName; parentId?: string } | undefined
  /** Also counts the pages that were not loaded, in the background, to learn the full total. */
  withTotal?: boolean
}

export function useLiveEntities<T extends LiveEntity = LiveEntity>(
  resource: EntityResourceName,
  options: UseLiveEntitiesOptions = {},
) {
  const connection = useConnectionStore()
  const items = ref<T[]>([]) as Ref<T[]>
  const next = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<LiveError | null>(null)
  const tagFilter = ref<string[]>([])
  // How many there are in all. Known at once for a short list; for a long one only after the
  // background count (opt-in), and null while unknown.
  const total = ref<number | null>(null)
  let requestToken = 0

  const parentId = () => (typeof options.parentId === 'function' ? options.parentId() : options.parentId)
  const client = (): EntityClient<T> => connection.client<T>(resource, parentId())
  const listClient = (): EntityClient<T> => {
    const via = options.listVia?.()
    return via ? connection.client<T>(via.resource, via.parentId) : client()
  }

  async function load() {
    const token = ++requestToken
    loading.value = true
    error.value = null
    items.value = []
    next.value = null
    total.value = null
    try {
      const page = await listClient().list({ tags: tagFilter.value })
      if (token !== requestToken) return
      items.value = page.data
      next.value = page.next
      if (page.next === null) total.value = page.data.length
      else if (options.withTotal) void countRest(token, page.data.length, page.next)
    } catch (err) {
      if (token === requestToken) error.value = toLiveError(err)
    } finally {
      if (token === requestToken) loading.value = false
    }
  }

  async function countRest(token: number, counted: number, offset: string) {
    let cursor: string | null = offset
    try {
      while (cursor) {
        const page: { data: unknown[]; next: string | null } = await listClient().list({
          tags: tagFilter.value,
          size: 1000,
          offset: cursor,
        })
        if (token !== requestToken) return
        counted += page.data.length
        cursor = page.next
      }
      if (token === requestToken) total.value = counted
    } catch {
      // The count is a convenience: the header keeps showing what is loaded.
    }
  }

  async function loadMore() {
    if (!next.value || loading.value) return
    const token = requestToken
    loading.value = true
    try {
      const page = await listClient().list({ tags: tagFilter.value, offset: next.value })
      if (token !== requestToken) return
      items.value = [...items.value, ...page.data]
      next.value = page.next
    } catch (err) {
      if (token === requestToken) error.value = toLiveError(err)
    } finally {
      if (token === requestToken) loading.value = false
    }
  }

  async function run<R>(action: () => Promise<R>): Promise<R> {
    error.value = null
    try {
      return await action()
    } catch (err) {
      error.value = toLiveError(err)
      throw err
    }
  }

  const create = (body: Partial<T>) =>
    run(async () => {
      const created = await client().create(body)
      items.value = [created, ...items.value]
      if (total.value !== null) total.value += 1
      return created
    })

  const save = (id: string, patch: Partial<T>) =>
    run(async () => {
      const updated = await client().update(id, patch)
      items.value = items.value.map((item) => (item.id === id ? updated : item))
      return updated
    })

  const remove = (id: string) =>
    run(async () => {
      await client().remove(id)
      items.value = items.value.filter((item) => item.id !== id)
      if (total.value !== null) total.value = Math.max(0, total.value - 1)
    })

  const toggleEnabled = (id: string, enabled: boolean) => save(id, { enabled } as unknown as Partial<T>)

  return { items, next, total, loading, error, tagFilter, load, loadMore, create, save, remove, toggleEnabled }
}
