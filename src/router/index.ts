import { createRouter, createWebHistory } from 'vue-router'
import LoadView from '../views/LoadView.vue'
import BrowseView from '../views/BrowseView.vue'
import CompareView from '../views/CompareView.vue'
import LiveServicesView from '../views/live/LiveServicesView.vue'
import LiveRoutesView from '../views/live/LiveRoutesView.vue'
import LiveConsumersView from '../views/live/LiveConsumersView.vue'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'load', component: LoadView },
    { path: '/browse', name: 'browse', component: BrowseView },
    { path: '/compare', name: 'compare', component: CompareView },
    { path: '/live', redirect: '/live/services' },
    { path: '/live/services', name: 'live-services', component: LiveServicesView },
    { path: '/live/routes', name: 'live-routes', component: LiveRoutesView },
    { path: '/live/consumers', name: 'live-consumers', component: LiveConsumersView },
  ],
})
