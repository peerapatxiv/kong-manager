<script setup lang="ts">
import { ref, computed } from 'vue'
import type { KongRoute } from '../../types/kong'
import TagInput from '../shared/TagInput.vue'
import ToggleSwitch from '../shared/ToggleSwitch.vue'
import ProtocolPicker from '../shared/ProtocolPicker.vue'
import PluginEditor from '../shared/PluginEditor.vue'

const props = defineProps<{ modelValue: KongRoute; serviceName: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: KongRoute]; modified: [] }>()

const expanded = ref(false)

const summary = computed(() => {
  const parts: string[] = []
  const paths = props.modelValue.paths ?? []
  if (paths.length > 0) parts.push(paths.length === 1 ? paths[0] : `${paths.length} paths`)
  const methods = props.modelValue.methods ?? []
  if (methods.length > 0) parts.push(methods.join(', '))
  const protocols = props.modelValue.protocols ?? []
  if (protocols.length > 0) parts.push(protocols.join('/'))
  return parts
})

function update<K extends keyof KongRoute>(key: K, value: KongRoute[K]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
  emit('modified')
}

function onPluginUpdate(index: number, updated: NonNullable<KongRoute['plugins']>[number]) {
  const plugins = [...(props.modelValue.plugins ?? [])]
  plugins[index] = updated
  update('plugins', plugins)
}
</script>

<template>
  <div class="card overflow-hidden">
    <button
      type="button"
      class="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors duration-150 hover:bg-elevated"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <svg
        class="h-3.5 w-3.5 shrink-0 text-ink-muted transition-transform duration-150"
        :class="expanded ? 'rotate-90' : ''"
        viewBox="0 0 16 16"
        fill="none"
      >
        <path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <div class="min-w-0 flex-1">
        <p class="truncate font-mono text-sm text-ink" :title="modelValue.name ?? '(unnamed route)'">
          {{ modelValue.name ?? '(unnamed route)' }}
        </p>
        <p class="mt-0.5 truncate text-xs text-ink-muted">{{ summary.join(' · ') }}</p>
      </div>
      <span class="shrink-0 text-xs font-medium text-accent-secondary">{{ expanded ? 'collapse' : 'expand' }}</span>
    </button>

    <div class="grid transition-[grid-template-rows] duration-200 ease-out" :style="{ gridTemplateRows: expanded ? '1fr' : '0fr' }">
      <div class="overflow-hidden">
        <div class="space-y-5 border-t border-border bg-elevated/60 p-4" :inert="!expanded">
          <section class="space-y-3">
            <h4 class="section-heading">Hosts &amp; paths</h4>
            <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label>
                <span class="field-label">Hosts</span>
                <TagInput :model-value="modelValue.hosts" @update:model-value="(v) => update('hosts', v)" />
              </label>
              <label>
                <span class="field-label">Paths</span>
                <TagInput :model-value="modelValue.paths" @update:model-value="(v) => update('paths', v)" />
              </label>
            </div>
          </section>

          <section class="space-y-3 border-t border-border pt-4">
            <h4 class="section-heading">Matching</h4>
            <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label>
                <span class="field-label">Methods</span>
                <TagInput :model-value="modelValue.methods" @update:model-value="(v) => update('methods', v)" />
              </label>
              <div>
                <span class="field-label">Protocols</span>
                <ProtocolPicker :model-value="modelValue.protocols" @update:model-value="(v) => update('protocols', v)" />
              </div>
            </div>
          </section>

          <section class="space-y-3 border-t border-border pt-4">
            <h4 class="section-heading">Behavior &amp; redirects</h4>
            <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label>
                <span class="field-label">Path handling</span>
                <input
                  type="text"
                  :value="modelValue.path_handling ?? ''"
                  class="input-field"
                  @input="update('path_handling', ($event.target as HTMLInputElement).value)"
                />
              </label>
              <label>
                <span class="field-label">HTTPS redirect status code</span>
                <input
                  type="number"
                  :value="modelValue.https_redirect_status_code ?? ''"
                  class="input-field"
                  placeholder="426"
                  @input="
                    update(
                      'https_redirect_status_code',
                      ($event.target as HTMLInputElement).value === ''
                        ? undefined
                        : Number(($event.target as HTMLInputElement).value),
                    )
                  "
                />
              </label>
            </div>
            <div class="flex flex-wrap gap-x-6 gap-y-2 pt-1">
              <ToggleSwitch
                :model-value="modelValue.strip_path ?? false"
                label="strip_path"
                @update:model-value="(v) => update('strip_path', v)"
              />
              <ToggleSwitch
                :model-value="modelValue.preserve_host ?? false"
                label="preserve_host"
                @update:model-value="(v) => update('preserve_host', v)"
              />
            </div>
          </section>

          <section v-if="(modelValue.plugins ?? []).length > 0" class="space-y-2 border-t border-border pt-4">
            <h4 class="section-heading">Route plugins</h4>
            <PluginEditor
              v-for="(plugin, index) in modelValue.plugins"
              :key="plugin.name"
              :model-value="plugin"
              @update:model-value="(v) => onPluginUpdate(index, v)"
            />
          </section>
        </div>
      </div>
    </div>
  </div>
</template>
