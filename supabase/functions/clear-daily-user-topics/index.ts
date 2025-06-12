/// <reference lib="deno.ns" />
// supabase/functions/clear-daily-user-topics/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts' // Deno標準ライブラリからインポート
// @deno-types="npm:@supabase/supabase-js@2"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2' // esm.shからインポート

serve(async (req) => {
  try {
    // SupabaseプロジェクトのURLとAPIキーを設定
    // 環境変数から読み込むのがベストプラクティス
    const supabaseUrl = Deno.env.get('PROJECT_URL')    // 全ユーザーのデータを更新するため、service_roleキーの使用を推奨
    const supabaseServiceRoleKey = Deno.env.get('PROJECT_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('PROJECT_URL or PROJECT_SERVICE_ROLE_KEY is not defined in environment variables.')    }

    // service_role keyはRLSをバイパスします。
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        // Edge Functionではセッションを永続化しない方が良い場合が多い
        persistSession: false,
      }
    })

    console.log('Attempting to clear user topics...');

    // profilesテーブルの全ユーザーのtopicカラムをnullに更新
    // .select() を追加して、更新された行数を取得できるようにする
    const { error, count } = await supabase
      .from('profiles')
      .update({ topic: null })
      .neq('topic', null) // topicが既にnullでないものだけを対象にする（任意）
       .select('*', { count: 'exact', head: true }) // 更新された行数を取得するために追加
    if (error) {
      console.error('Error clearing user topics:', error)
      throw error
    }

const successMessage = `User topics clear attempt finished. Updated ${count ?? 0} rows.`;
    console.log(successMessage);
    return new Response(JSON.stringify({ message: successMessage, updated_count: count ?? 0 }), {      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (err) {
    console.error('Failed to clear user topics:', err)
    return new Response(String(err?.message || err), { status: 500 })
  }
})
