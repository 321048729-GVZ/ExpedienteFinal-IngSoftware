import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL_VARIABLES = [
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_PROJECT_URL",
] as const;

const KEY_VARIABLES = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_KEY",
  "SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_KEY",
] as const;

function readFirst(variables: readonly string[]): string | undefined {
  for (const name of variables) {
    const value = process.env[name];
    if (value && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

export function getSupabaseConfig() {
  const url = readFirst(URL_VARIABLES);
  const key = readFirst(KEY_VARIABLES);

  if (!url) {
    throw new Error(
      `Falta la URL de Supabase. Define SUPABASE_URL o NEXT_PUBLIC_SUPABASE_URL en .env.local (variables revisadas: ${URL_VARIABLES.join(", ")}).`
    );
  }

  if (!key) {
    throw new Error(
      `Falta la llave de Supabase. Define SUPABASE_SERVICE_ROLE_KEY o NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local (variables revisadas: ${KEY_VARIABLES.join(", ")}).`
    );
  }

  return { url, key };
}

let cliente: SupabaseClient | null = null;

export function getSupabaseServer(): SupabaseClient {
  if (!cliente) {
    const { url, key } = getSupabaseConfig();
    cliente = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return cliente;
}

export const supabaseServer = new Proxy({} as SupabaseClient, {
  get(_target, property) {
    const client = getSupabaseServer() as unknown as Record<PropertyKey, unknown>;
    const value = client[property];
    return typeof value === "function" ? value.bind(client) : value;
  },
});
