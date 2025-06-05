// app/api/topic/route.ts

// Next.jsのAPI RouteからJSONレスポンスを返すために、NextResponseをインポートします。
// NextResponseは、HTTPレスポンスを生成するための便利なユーティリティです。
import { NextResponse } from 'next/server';

// ステップ2で作成したSupabaseクライアントをインポートします。
// このクライアントを使ってSupabaseデータベースにアクセスします。
import { supabase } from '@/lib/supabase'; // `@` はプロジェクトのルートを指すエイリアスです

// この関数は、HTTP GETリクエストがこのAPI Route（/api/topic）に送られたときに実行されます。
// export async function GET() { ... } のように、HTTPメソッド名と同じ関数をエクスポートすることで、
// Next.jsは自動的にそのリクエストを処理します。
export async function GET() {
  try {
    // Supabaseの'topics'テーブルからデータを取得します。
    // .from('topics')：'topics'という名前のテーブルを指定します。
    // .select('text')：そのテーブルから'text'という名前のカラム（列）だけを取得するように指定します。
    // data: 取得したデータ（配列）、error: エラー情報 を分割代入で受け取ります。
    const { data: topics, error } = await supabase
      .from('topics')
      .select('text'); // 'text'カラムのみを取得するように指定

    // Supabaseからのデータ取得中にエラーが発生した場合の処理
    if (error) {
      // エラーメッセージをサーバーのコンソールに出力します（ユーザーには見えません）
      console.error('Supabaseからのデータ取得エラー:', error.message);
      // ユーザーに返すエラーメッセージとHTTPステータスコード500（Internal Server Error）を返します。
      return NextResponse.json(
        { topic: "データベースからの話題取得に失敗しました。", error: "supabase_error" },
        { status: 500 }
      );
    }

    // データベースにトピックが一つも存在しない場合の処理
    if (!topics || topics.length === 0) {
      // ユーザーに返すメッセージとHTTPステータスコード404（Not Found）を返します。
      return NextResponse.json(
        { topic: "現在、話題がありません。", error: "no_topics_found" },
        { status: 404 }
      );
    }

    // 取得したトピックの配列からランダムに1つのトピックを選択します。
    // Math.random()：0以上1未満の乱数を生成
    // Math.floor()：小数点以下を切り捨てて整数にする
    const randomIndex = Math.floor(Math.random() * topics.length);
    const selectedTopic = topics[randomIndex].text; // ランダムに選ばれたトピックのテキストを取得

    // 成功した場合は、選択したトピックをJSON形式で返します。
    // NextResponse.json() は、デフォルトでHTTPステータスコード200（OK）を返します。
    return NextResponse.json({ topic: selectedTopic });

  } catch (e: any) {
    // 上記のSupabase関連のエラー以外で、予期せぬサーバーサイドのエラーが発生した場合の処理
    console.error("API Routeで予期せぬエラーが発生しました:", e.message);
    // ユーザーに返すエラーメッセージとHTTPステータスコード500を返します。
    return NextResponse.json(
      { topic: "話題の取得中にサーバーエラーが発生しました。", error: "internal_server_error" },
      { status: 500 }
    );
  }
}