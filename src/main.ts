import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { isProxyMode } from './lib/kongAdmin/http'
import { startHeartbeat } from './lib/heartbeat'
import './style.css'

createApp(App).use(createPinia()).use(router).mount('#app')

if (isProxyMode()) startHeartbeat()
