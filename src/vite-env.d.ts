/// <reference types="vite/client" />

declare module "mammoth/mammoth.browser";

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_REVENUECAT_IOS_KEY?: string;
  readonly VITE_APP_NAME?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
