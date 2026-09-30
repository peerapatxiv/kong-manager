/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" when started with `npm run dev:proxy`: Kong calls go through the local dev proxy. */
  readonly VITE_KONG_PROXY?: string
}

