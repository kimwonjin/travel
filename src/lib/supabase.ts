import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// 환경 변수가 없으면 null — 화면에서 설정 안내를 보여준다.
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;

export function db(): SupabaseClient {
  if (!supabase) throw new Error("Supabase 환경 변수가 설정되지 않았습니다.");
  return supabase;
}
