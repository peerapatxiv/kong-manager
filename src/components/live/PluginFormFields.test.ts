// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import PluginFormFields from './PluginFormFields.vue'
import { newPluginForm } from '../../lib/live/pluginForm'

let wrapper: VueWrapper | undefined
afterEach(() => wrapper?.unmount())

const OPTIONS = {
  services: [{ value: 's1', label: 'billing' }],
  routes: [{ value: 'r1', label: 'billing-route' }],
  consumers: [{ value: 'c1', label: 'alice' }],
}

function make(props: Record<string, unknown> = {}) {
  wrapper = mount(PluginFormFields, {
    props: {
      modelValue: { ...newPluginForm(), name: 'cors' },
      creating: true,
      availablePlugins: ['cors', 'key-auth', 'rate-limiting'],
      serviceOptions: OPTIONS.services,
      routeOptions: OPTIONS.routes,
      consumerOptions: OPTIONS.consumers,
      ...props,
    },
    attachTo: document.body,
  })
  return wrapper
}

async function pick(id: string, value: string) {
  const root = wrapper!.find(`[data-testid="${id}"]`)
  await root.find('button').trigger('click')
  await root.find(`[role="option"][data-value="${value}"]`).trigger('click')
}
const last = () => wrapper!.emitted('update:modelValue')!.at(-1)![0] as ReturnType<typeof newPluginForm>

describe('PluginFormFields', () => {
  it('lets a new plugin be chosen from the ones installed on the node', async () => {
    make({ modelValue: newPluginForm() })
    await wrapper!.find('[data-testid="plugin-name"] button').trigger('click')
    expect(wrapper!.findAll('[data-testid="plugin-name"] [role="option"]').map((o) => o.text())).toEqual([
      'cors',
      'key-auth',
      'rate-limiting',
    ])
    await wrapper!.find('[data-testid="plugin-name"] [data-value="key-auth"]').trigger('click')
    expect(last().name).toBe('key-auth')
  })

  it('locks the plugin name once it exists, since Kong cannot rename a plugin', () => {
    make({ creating: false })
    expect(wrapper!.find('[data-testid="plugin-name"] button').attributes('disabled')).toBeDefined()
  })

  it('still shows the name of a plugin that is not in the installed list', () => {
    make({ creating: false, modelValue: { ...newPluginForm(), name: 'custom-thing' } })
    expect(wrapper!.find('[data-testid="plugin-name"]').text()).toContain('custom-thing')
  })

  it('attaches the plugin to a service, a route and a consumer independently, and can clear each', async () => {
    make()
    await pick('plugin-service', 's1')
    expect(last().service).toBe('s1')
    await pick('plugin-route', 'r1')
    expect(last().route).toBe('r1')
    await pick('plugin-consumer', 'c1')
    expect(last().consumer).toBe('c1')

    make({ modelValue: { ...newPluginForm(), name: 'cors', service: 's1' } })
    await pick('plugin-service', '')
    expect(last().service).toBe('')
  })

  it('toggles enabled', async () => {
    make()
    await wrapper!.find('input[type="checkbox"]').setValue(false)
    expect(last().enabled).toBe(false)
  })

  describe('config', () => {
    it('shows the config as a form by default and as formatted JSON on request', async () => {
      make({ modelValue: { ...newPluginForm(), name: 'cors', config: { origins: ['*'], max_age: 3600 } } })
      expect(wrapper!.find('[data-testid="config-json"]').exists()).toBe(false)

      await wrapper!.find('[data-testid="config-mode"] [data-value="json"]').trigger('click')
      const area = wrapper!.find('[data-testid="config-json"]').element as HTMLTextAreaElement
      expect(JSON.parse(area.value)).toEqual({ origins: ['*'], max_age: 3600 })
      expect(area.value).toContain('\n')
    })

    it('applies valid JSON as the config', async () => {
      make()
      await wrapper!.find('[data-testid="config-mode"] [data-value="json"]').trigger('click')
      await wrapper!.find('[data-testid="config-json"]').setValue('{"minute": 20, "policy": "local"}')
      expect(last().config).toEqual({ minute: 20, policy: 'local' })
      expect(wrapper!.find('[data-testid="config-json-error"]').exists()).toBe(false)
    })

    it('reports invalid JSON, and JSON that is not an object, without changing the config', async () => {
      make()
      await wrapper!.find('[data-testid="config-mode"] [data-value="json"]').trigger('click')
      await wrapper!.find('[data-testid="config-json"]').setValue('{"minute": ')
      expect(wrapper!.find('[data-testid="config-json-error"]').text()).toContain('Invalid JSON')
      await wrapper!.find('[data-testid="config-json"]').setValue('[1, 2]')
      expect(wrapper!.find('[data-testid="config-json-error"]').text()).toContain('object')
      expect(wrapper!.emitted('update:modelValue')).toBeUndefined()
    })

    it('goes back to the form with the last valid config', async () => {
      make({ modelValue: { ...newPluginForm(), name: 'cors', config: { a: 1 } } })
      await wrapper!.find('[data-testid="config-mode"] [data-value="json"]').trigger('click')
      await wrapper!.find('[data-testid="config-mode"] [data-value="form"]').trigger('click')
      expect(wrapper!.find('[data-testid="config-json"]').exists()).toBe(false)
    })
  })

  it('shows the errors Kong reported next to the fields they belong to', () => {
    make({ fieldErrors: { name: 'plugin not enabled', config: 'schema violation' } })
    expect(wrapper!.text()).toContain('plugin not enabled')
    expect(wrapper!.text()).toContain('schema violation')
  })

  it('cannot be edited while disabled (DB-less Kong)', () => {
    make({ disabled: true })
    expect(wrapper!.find('fieldset').attributes('disabled')).toBeDefined()
  })
})
