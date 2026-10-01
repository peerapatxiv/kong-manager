import { createRouter, createWebHistory } from 'vue-router'
import LoadView from '../views/LoadView.vue'
import CompareView from '../views/CompareView.vue'
import FileDashboardView from '../views/file/FileDashboardView.vue'
import FileServicesView from '../views/file/FileServicesView.vue'
import FileRoutesView from '../views/file/FileRoutesView.vue'
import FileConsumersView from '../views/file/FileConsumersView.vue'
import FilePluginsView from '../views/file/FilePluginsView.vue'
import LiveServicesView from '../views/live/LiveServicesView.vue'
import LiveRoutesView from '../views/live/LiveRoutesView.vue'
import LiveConsumersView from '../views/live/LiveConsumersView.vue'
import LivePluginsView from '../views/live/LivePluginsView.vue'
import { redirectToHomeOnLoad } from './redirectToHomeOnLoad'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'load', component: LoadView },
    // The old single Browse page is now one page per kind of entity, plus a dashboard.
    { path: '/browse', redirect: '/file/dashboard' },
    { path: '/file/dashboard', name: 'file-dashboard', component: FileDashboardView },
    { path: '/file/services', name: 'file-services', component: FileServicesView },
    { path: '/file/routes', name: 'file-routes', component: FileRoutesView },
    { path: '/file/consumers', name: 'file-consumers', component: FileConsumersView },
    { path: '/file/plugins', name: 'file-plugins', component: FilePluginsView },
    { path: '/compare', name: 'compare', component: CompareView },
    { path: '/live', redirect: '/live/services' },
    { path: '/live/services', name: 'live-services', component: LiveServicesView },
    { path: '/live/routes', name: 'live-routes', component: LiveRoutesView },
    { path: '/live/plugins', name: 'live-plugins', component: LivePluginsView },
    { path: '/live/consumers', name: 'live-consumers', component: LiveConsumersView },
  ],
})

redirectToHomeOnLoad(router)
