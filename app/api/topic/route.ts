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

  } catch (e: unknown) { // ★ e の型を any から unknown に変更
    let errorMessage = "不明なエラーがAPIルートで発生しました"; // デフォルトのエラーメッセージ
    let errorDetailsForLog = ""; // ログ用の詳細情報
  
    if (typeof e === "string") {
      // エラーが文字列としてスローされた場合
      errorMessage = e;
      errorDetailsForLog = e;
    } else if (e instanceof Error) {
      // エラーが Error オブジェクトのインスタンスである場合
      errorMessage = e.message; // Errorオブジェクトのmessageプロパティを使用
      errorDetailsForLog = e.stack || e.message; // スタックトレースもログに残す
    } else if (typeof e === "object" && e !== null && "message" in e) {
      // 'message' プロパティを持つオブジェクトの場合 (カスタムエラーオブジェクトなど)
      // (e as any).message だとESLintルールに抵触する可能性があるため、より安全なアクセスを試みる
      const potentialErrorWithMessage = e as { message?: unknown };
      if (typeof potentialErrorWithMessage.message === "string") {
        errorMessage = potentialErrorWithMessage.message;
      }
      // 詳細ログ用にはオブジェクト全体を文字列化
      try {
        errorDetailsForLog = JSON.stringify(e);
      } catch {
        errorDetailsForLog = "Cannot stringify error object";
      }
    } else {
      // その他の予期せぬエラー形式
      try {
        errorDetailsForLog = JSON.stringify(e);
      } catch {
        errorDetailsForLog = String(e); // 最悪の場合、文字列に変換
      }
    }
    
    console.error("API Routeで予期せぬエラー:", errorMessage, "Details for log:", errorDetailsForLog);
    
    // クライアントに返すエラーメッセージは汎用的なものにする
    return NextResponse.json(
      { 
        topic: "話題の取得中にサーバーエラーが発生しました。", // これは固定のエラーメッセージ
        error: "internal_server_error",
        // 開発環境でのみ詳細なエラーメッセージをクライアントに返すことも検討できます (本番では非推奨)
        // details: process.env.NODE_ENV === 'development' ? errorMessage : undefined 
      },
      { status: 500 }
    );
  }
}