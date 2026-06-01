/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Absolute base URL of the backend API in production (e.g.
   * https://api.example.com). Unset in dev — requests stay relative and the
   * Vite proxy forwards /api to localhost:3000.
   */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
