/**
 * Runtime configuration. Only public values belong in VITE_* variables:
 * the Supabase anon key is designed to be public (access is enforced by RLS).
 * Secrets (service role key, WhatsApp token, AI keys, webhook secrets) live
 * only in Supabase Edge Function secrets — never in this bundle.
 */
const env = import.meta.env;

export const SUPABASE_URL = (env.VITE_SUPABASE_URL as string | undefined)?.trim() || '';
export const SUPABASE_ANON_KEY = (env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || '';

export const SUPABASE_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/** `demo` runs entirely in the browser with seeded data; `live` requires Supabase. */
export const APP_MODE: 'demo' | 'live' =
  (env.VITE_APP_MODE as string | undefined) === 'demo' || !SUPABASE_CONFIGURED ? 'demo' : 'live';

/** Edge functions are deployed alongside Supabase; these flags only toggle UI affordances. */
export const AI_BACKEND_ENABLED = APP_MODE === 'live' && (env.VITE_AI_ENABLED as string | undefined) === 'true';

export const PRODUCT = {
  name: 'GNANOVA',
  full: 'GNANOVA Manufacturing OS',
  tagline: 'AI-Powered Manufacturing Operations & Business Intelligence',
};
