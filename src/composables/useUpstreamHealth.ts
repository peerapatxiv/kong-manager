import { ref, watch } from 'vue'
import { getUpstreamHealth } from '../lib/kongAdmin/health'
import type { TargetHealth } from '../lib/kongAdmin/health'
import { toLiveError } from './useLiveEntities'
import { useConnectionStore } from '../stores/connection'

/**
 * The per-target health of one upstream. It reloads whenever the id changes and only the
 * newest request may write results, so a slow answer for a previous selection is dropped.
 * Its error stays separate from the entity lists: health is optional information.
 */
export function useUpstreamHealth(upstreamId: () => string | undefined) {
  const connection = useConnectionStore()
  const health = ref<TargetHealth[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const updatedAt = ref<Date | null>(null)
  let token = 0

  async function refresh() {
    const id = upstreamId()
    const mine = ++token
    health.value = []
    error.value = null
    updatedAt.value = null
    if (!id || !connection.active) {
      loading.value = false
      return
    }
    loading.value = true
    try {
      const rows = await getUpstreamHealth(connection.active, id)
      if (mine !== token) return
      health.value = rows
      updatedAt.value = new Date()
    } catch (err) {
      if (mine === token) error.value = toLiveError(err).message
    } finally {
      if (mine === token) loading.value = false
    }
  }

  watch(upstreamId, () => void refresh(), { immediate: true })

  return { health, loading, error, updatedAt, refresh }
}
