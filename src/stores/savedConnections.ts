import { defineStore } from 'pinia'
import { loadSavedConnections, persistSavedConnections } from '../lib/savedConnections'
import type { SavedConnection } from '../lib/savedConnections'

export const useSavedConnectionsStore = defineStore('savedConnections', {
  state: () => ({
    connections: loadSavedConnections() as SavedConnection[],
  }),
  actions: {
    upsert(conn: { baseUrl: string; username?: string; password?: string }) {
      const existing = this.connections.find((c) => c.baseUrl === conn.baseUrl)
      if (existing) {
        existing.username = conn.username
        existing.password = conn.password
      } else {
        this.connections.push({ id: crypto.randomUUID(), ...conn })
      }
      persistSavedConnections(this.connections)
    },
    remove(id: string) {
      this.connections = this.connections.filter((c) => c.id !== id)
      persistSavedConnections(this.connections)
    },
  },
})
