/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONTRACT_ADDRESS?: string;
  readonly VITE_GENLAYER_NETWORK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
