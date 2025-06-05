// app/layout.tsx
'use client'; // ★ クライアントコンポーネントとしてマーク
import { Noto_Sans_JP } from 'next/font/google'; // ★ Noto Sans JP をインポート
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase'; // あなたのSupabaseクライアントのパスを正しく指定してください
import { User, Session } from '@supabase/supabase-js';
import './globals.css'; // グローバルCSSをインポート (存在する場合)
import { Toaster } from 'react-hot-toast'; // ★★★ この行を追加 ★★★

// export const metadata = { ... }; // 'use client' のファイルではこのように直接 metadata はエクスポートできません。
// Next.js App Routerで静的なメタデータを設定する場合は、
// このファイルと同じ階層に head.tsx を作成するか、
// あるいはこの layout.tsx をサーバーコンポーネントでラップし、
// そのサーバーコンポーネントでメタデータをエクスポートする必要があります。
// ここでは簡単のため metadata の記述は省略します。

// ★ フォントオブジェクトを初期化
const notoSansJP = Noto_Sans_JP({
  weight: ['400', '500', '700'], // 使用するフォントウェイトを指定
  subsets: ['latin'], // 通常 'latin' で日本語もカバーされますが、'japanese' があればそちらを指定
  display: 'swap',    // フォント読み込み中のフォールバック動作
  variable: '--font-noto-sans-jp' // CSS変数として使う場合 (任意)
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isClientLoadedForLayout, setIsClientLoadedForLayout] = useState(false);

  // 1. セッション情報の取得と認証状態の監視
  useEffect(() => {
    setIsClientLoadedForLayout(true); // クライアントでのマウントを示す

    // 初期セッションを取得
    supabase.auth.getSession().then(({ data: { session: currentSessionData } }) => {
      setSession(currentSessionData);
      setCurrentUser(currentSessionData?.user ?? null);
      if (currentSessionData?.user) {
        console.log('[Layout] Initial session loaded, user:', currentSessionData.user.id);
      } else {
        console.log('[Layout] Initial session loaded, no user.');
      }
    }).catch(error => {
      console.error('[Layout] Error getting initial session:', error);
    });

    // 認証状態の変化を監視
    const { data: authListener } = supabase.auth.onAuthStateChange((event, newSession) => {
      console.log(`[Layout] Auth state changed. Event: ${event}, User: ${newSession?.user?.id || null}`);
      setSession(newSession);
      setCurrentUser(newSession?.user ?? null);
      
      // ログアウト時は明示的にオフライン処理を行う (currentUserがnullになるため、下のuseEffectのcleanupも動く)
      // if (event === 'SIGNED_OUT' && currentUser?.id) { // currentUserは古い値の可能性があるので注意
      //   // この処理はログアウトボタン側で明示的に行う方が確実な場合が多い
      // }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []); // このeffectはマウント時に一度だけ実行


  // 2. アプリケーション全体でのオンラインステータス管理 useEffect
  useEffect(() => {
    if (!isClientLoadedForLayout || !currentUser) {
      // currentUser が null (未ログインまたはログアウト直後) なら何もしない、またはオフライン処理
      // ログアウトボタン側でオフライン処理をしていれば、ここでは必須ではないかもしれません。
      // しかし、明示的なログアウト以外でのセッション切れの場合のために、
      // currentUser が null になった際にオフラインにする処理を入れても良いでしょう。
      // ただし、その場合、以前の currentUser.id が必要になります。
      // ここでは、currentUser が存在する場合にオンラインにし、
      // この effect の cleanup でオフラインにすることを試みます。
      return;
    }

    const userId = currentUser.id;
    let onlineIntervalId: NodeJS.Timeout | undefined;

    const updateUserOnlineStatus = async (isOnline: boolean) => {
      // currentUserが最新の状態であることを確認
      if (!currentUser || currentUser.id !== userId) { 
        // ユーザーが変わったか、nullになった場合は古いIDで更新しない
        console.log(`[Layout OnlineEffect] User changed or became null, skipping status update for old userId: ${userId}`);
        return;
      }
      try {
        const { error } = await supabase
          .from('user_statuses')
          .upsert(
            { user_id: userId, is_online: isOnline, last_active_at: new Date().toISOString() },
            { onConflict: 'user_id' }
          );
        if (error) {
          console.error(`[Layout OnlineEffect] Error setting user ${userId} status to ${isOnline}:`, error);
        } else {
          console.log(`[Layout OnlineEffect] User ${userId} status set to ${isOnline}. Time: ${new Date().toISOString()}`);
        }
      } catch (e) {
        console.error(`[Layout OnlineEffect] Exception setting user ${userId} status to ${isOnline}:`, e);
      }
    };

    // ログイン時/ページアクティブ時にオンラインにする
    console.log(`[Layout OnlineEffect] User ${userId} detected. Setting online. Time: ${new Date().toISOString()}`);
    updateUserOnlineStatus(true);
    // 定期的に last_active_at を更新し、オンライン状態を維持
    onlineIntervalId = setInterval(() => updateUserOnlineStatus(true), 60 * 1000); // 1分ごと

    // ブラウザタブが閉じられる、ページがアンロードされる際の処理 (ベストエフォート)
    // navigator.sendBeacon はより確実だが、Supabase REST APIへの認証付きPOSTは複雑になるため、
    // ここでは単純なクリーンアップに留めます。
    // ログアウトボタンでの明示的なオフライン化が最も重要です。
    const handleBeforeUnload = () => {
      // このイベント内で非同期処理 (await supabase...) を行うのは信頼性が低いです。
      // sendBeacon を使うか、サーバー側でタイムアウト処理をするのが一般的。
      // ここでは何もしないか、ログだけ残す程度が良いかもしれません。
      console.log(`[Layout OnlineEffect] beforeunload event for user ${userId}. Attempting to set offline is best-effort.`);
      // updateUserOnlineStatus(false); // 信頼性が低い
    };
    window.addEventListener('beforeunload', handleBeforeUnload);


    // このuseEffectのクリーンアップ (currentUserがnullになった時 = ログアウト時、またはコンポーネントアンマウント時)
    return () => {
      console.log(`[Layout OnlineEffect] Cleanup for user ${userId}. Time: ${new Date().toISOString()}`);
      clearInterval(onlineIntervalId);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // currentUser が null になった（ログアウト）ことが原因でこのクリーンアップが呼ばれる場合、
      // userId はログアウトしたユーザーのIDを保持しています。
      // このタイミングでオフラインに設定します。
      updateUserOnlineStatus(false); 
    };
  }, [isClientLoadedForLayout, currentUser]); // currentUserの変更を検知


  return (
    <html lang="ja" className={notoSansJP.variable}> {/* ★ CSS変数をhtmlタグに適用 (任意) */}
      {/* もしCSS変数を設定しない場合は、以下のように body に直接クラス名を適用します。
        <body className={notoSansJP.className}> 
      */}
      <body className={`${notoSansJP.className} antialiased`}> {/* ★ フォントクラスをbodyに適用し、アンチエイリアスを有効に */}
      {/* ★★★ ここに <Toaster /> を配置 ★★★ */}
      <Toaster 
          position="top-center" // 表示位置 (例: 中央上)
          reverseOrder={false}  // 通知の表示順 (新しいものが上か下か)
          toastOptions={{ // デフォルトのトーストオプション
            duration: 3200, // 表示時間 (ミリ秒)
            // style: { background: '#363636', color: '#fff' }, // カスタムスタイルなど
          }}
        />
        {children}
        {/* ここで Footer などの共通レイアウトコンポーネントを配置できます */}
      </body>
    </html>
  );
}