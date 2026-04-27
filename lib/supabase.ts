import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const supabase: SupabaseClient = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder"
);

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

const FETCH_BATCH = 1000;

export async function fetchAllRows<T = any>(
  queryBuilder: () => any
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await queryBuilder().range(
      from,
      from + FETCH_BATCH - 1
    );
    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < FETCH_BATCH) break;
    from += FETCH_BATCH;
  }
  return all;
}
