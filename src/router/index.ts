import { createRouter, createWebHistory } from 'vue-router'
import LoadView from '../views/LoadView.vue'
import BrowseView from '../views/BrowseView.vue'
import CompareView from '../views/CompareView.vue'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'load', component: LoadView },
    { path: '/browse', name: 'browse', component: BrowseView },
    { path: '/compare', name: 'compare', component: CompareView },
  ],
})
