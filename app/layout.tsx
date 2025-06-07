// app/layout.tsx
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { User, Session } from '@supabase/supabase-js';
import { M_PLUS_Rounded_1c } from 'next/font/google'; // ★ インポートするフォントを変更
import './globals.css';
import { Toaster } from 'react-hot-toast';

// ★ フォントオブジェクトを初期化
const mplusRounded1c = M_PLUS_Rounded_1c({
  weight: ['400', '500', '700', '800'], // 使用したいフォントの太さを指定
  subsets: ['latin'], // 'japanese' サブセットが提供されていればそちらが良いですが、'latin' でカバーされることが多いです
  display: 'swap',
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [session, setSession] = useState<Session | null>(null); // ★ESLint無効化コメント追加
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isClientLoadedForLayout, setIsClientLoadedForLayout] = useState(false);

  useEffect(() => {
    setIsClientLoadedForLayout(true);

    supabase.auth.getSession().then(({ data: { session: currentSessionData } }) => {
      setSession(currentSessionData);
      setCurrentUser(currentSessionData?.user ?? null);
    }).catch(error => {
      console.error('[Layout] Error getting initial session:', error);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setCurrentUser(newSession?.user ?? null);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);


  useEffect(() => {
    if (!isClientLoadedForLayout || !currentUser) {
      return;
    }
    const userId = currentUser.id;
    const updateUserOnlineStatus = async (isOnline: boolean) => {
      if (!currentUser || currentUser.id !== userId) return;
      try {
        const { error } = await supabase.from('user_statuses').upsert(
            { user_id: userId, is_online: isOnline, last_active_at: new Date().toISOString() },
            { onConflict: 'user_id' }
          );
        if (error) { /* console.error... */ }
      } catch (e: unknown) { // ★ e の型は unknown のまま
        let errorMessage = "レイアウトで不明なエラーが発生しました。";
        let errorDetailsForLog: string | undefined = undefined;
      
        if (e instanceof Error) {
          errorMessage = e.message;
          errorDetailsForLog = e.stack || e.message;
        } else if (typeof e === "string") {
          errorMessage = e;
          errorDetailsForLog = e;
        } else {
          try {
            errorDetailsForLog = JSON.stringify(e);
          } catch {
            errorDetailsForLog = String(e);
          }
        }
      
        // ★★★ キャッチしたエラーオブジェクト 'e' (またはそこから抽出した情報) をログに出力 ★★★
        console.error("Layout error caught:", errorMessage, "Details:", errorDetailsForLog, "Original error object:", e); 
      
        // 必要であれば、ユーザーにエラーを通知する処理（ただし、layout.tsx で直接UI変更は難しい）
        // toast.error("アプリケーションの読み込み中にエラーが発生しました。"); // 例
      }
    };
    updateUserOnlineStatus(true);
    const onlineIntervalId = setInterval(() => updateUserOnlineStatus(true), 60 * 1000); // ★ const に変更済みのはず
    const handleBeforeUnload = () => { /* ... */ };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      clearInterval(onlineIntervalId);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (currentUser?.id) { // ★ クリーンアップ時も最新の currentUser を参照
        updateUserOnlineStatus(false); 
      }
    };
  }, [isClientLoadedForLayout, currentUser]);


  return (
    <html lang="ja">
      {/* ★ body タグにフォントのクラス名を適用 */}
      <body className={`${mplusRounded1c.className} antialiased`}>
        <Toaster position="top-center" />
        {children}
      </body>
    </html>
  );
}