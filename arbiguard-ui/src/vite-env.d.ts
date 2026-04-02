/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional absolute origin for API (e.g. https://api.example.com). Empty = same origin. */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
