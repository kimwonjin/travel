import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 기본값은 이 앱의 Supabase 프로젝트. anon 키는 브라우저 공개용(RLS로 보호)이라 코드에 둬도 된다.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://djvmmulcqkqmzrfankqn.supabase.co";
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqdm1tdWxjcWtxbXpyZmFua3FuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1MDMxODksImV4cCI6MjEwODA3OTE4OX0.h5lJwWYCIuh4-M6BVuU8-x86YBLAbDIN1a7_BXZRqSg";

// 환경 변수가 없으면 null — 화면에서 설정 안내를 보여준다.
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;

export function db(): SupabaseClient {
  if (!supabase) throw new Error("Supabase 환경 변수가 설정되지 않았습니다.");
  return supabase;
}
