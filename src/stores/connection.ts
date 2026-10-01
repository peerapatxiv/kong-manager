import { defineStore } from 'pinia'
import { adminJson } from '../lib/kongAdmin/http'
import type { KongAdminConnection } from '../lib/kongAdmin/http'
import { createEntityClient, guardWrites } from '../lib/kongAdmin/entities'
import type { EntityClient, EntityResourceName } from '../lib/kongAdmin/entities'

export type KongNodeInfo = {
  version: string
  database: string
}

export const useConnectionStore = defineStore('connection', {
  state: () => ({
    active: null as KongAdminConnection | null,
    info: null as KongNodeInfo | null,
    /** Names of the plugins installed on the node, sorted. */
    availablePlugins: [] as string[],
  }),
  getters: {
    isConnected: (state): boolean => state.active !== null,
    canWrite: (state): boolean => state.active !== null && state.info !== null && state.info.database !== 'off',
  },
  actions: {
    async connect(conn: KongAdminConnection) {
      const root = await adminJson<{
        version: string
        configuration?: { database?: string }
        plugins?: { available_on_server?: Record<string, unknown> }
      }>(conn, 'GET', '/')
      this.active = conn
      this.info = { version: root.version, database: root.configuration?.database ?? 'unknown' }
      this.availablePlugins = Object.keys(root.plugins?.available_on_server ?? {}).sort()
    },
    disconnect() {
      this.active = null
      this.info = null
      this.availablePlugins = []
    },
    client<T = Record<string, unknown>>(resource: EntityResourceName, parentId?: string): EntityClient<T> {
      if (!this.active) throw new Error('Not connected to a Kong Admin API')
      return guardWrites(createEntityClient<T>(this.active, resource, parentId), () => this.canWrite)
    },
  },
})
