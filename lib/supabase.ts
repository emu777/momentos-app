// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

// 環境変数からSupabaseのURLとキーを取得
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// 環境変数が設定されているか確認
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

// Supabaseクライアントを初期化
export const supabase = createClient(supabaseUrl, supabaseAnonKey);