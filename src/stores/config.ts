import { defineStore } from 'pinia'
import { parseKongConfig, serializeKongConfig } from '../lib/yaml'
import type { KongConfig } from '../types/kong'

export type LoadedFile = {
  fileName: string
  config: KongConfig
}

export const useConfigStore = defineStore('config', {
  state: () => ({
    primary: null as LoadedFile | null,
    compareTarget: null as LoadedFile | null,
    modifiedKeys: new Set<string>(),
  }),
  getters: {
    isLoaded: (state): boolean => state.primary !== null,
    summary: (state) => {
      const config = state.primary?.config
      const services = config?.services ?? []
      return {
        services: services.length,
        routes: services.reduce((sum, s) => sum + (s.routes?.length ?? 0), 0),
        consumers: config?.consumers?.length ?? 0,
        globalPlugins: config?.plugins?.length ?? 0,
      }
    },
  },
  actions: {
    loadPrimary(fileName: string, text: string) {
      const config = parseKongConfig(text)
      this.primary = { fileName, config }
      this.modifiedKeys = new Set()
    },
    loadCompareTarget(fileName: string, text: string) {
      const config = parseKongConfig(text)
      this.compareTarget = { fileName, config }
    },
    markModified(entityKey: string) {
      this.modifiedKeys.add(entityKey)
    },
    isModified(entityKey: string): boolean {
      return this.modifiedKeys.has(entityKey)
    },
    exportYaml(): { fileName: string; contents: string } {
      if (!this.primary) throw new Error('No config loaded')
      const contents = serializeKongConfig(this.primary.config)
      const base = this.primary.fileName.replace(/\.ya?ml$/i, '')
      return { fileName: `${base}-edited.yaml`, contents }
    },
  },
})
