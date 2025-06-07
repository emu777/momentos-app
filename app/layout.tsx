// app/layout.tsx
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase'; // あなたのSupabaseクライアントのパス
import { User, Session } from '@supabase/supabase-js';
import './globals.css'; // グローバルCSS
import { Toaster } from 'react-hot-toast'; // react-hot-toast

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // ★★★ すべてのフックは、このトップレベルに記述します ★★★
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [session, setSession] = useState<Session | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isClientLoadedForLayout, setIsClientLoadedForLayout] = useState(false);
  // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★

  // 1. 認証状態の監視useEffect
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
  }, []); // このeffectはマウント時に一度だけ実行

  // 2. アプリケーション全体でのオンラインステータス管理 useEffect (これがエラーの出ていたuseEffect)
  useEffect(() => {
    // フック内のロジックは、ガード条件 (if文) から始めることができます
    if (!isClientLoadedForLayout || !currentUser) {
      return; // currentUser が null なら何もしない
    }

    const userId = currentUser.id;
    
    const updateUserOnlineStatus = async (isOnline: boolean) => {
      // currentUserのチェックを再度行うことで、より安全に
      if (!currentUser || currentUser.id !== userId) return;
      try {
        const { error } = await supabase
          .from('user_statuses')
          .upsert(
            { user_id: userId, is_online: isOnline, last_active_at: new Date().toISOString() },
            { onConflict: 'user_id' }
          );
        if (error) {
          console.error(`[Layout OnlineEffect] Error setting user ${userId} status to ${isOnline}:`, error);
        }
      } catch (e) {
        console.error(`[Layout OnlineEffect] Exception setting user ${userId} status to ${isOnline}:`, e);
      }
    };

    updateUserOnlineStatus(true);
    const onlineIntervalId = setInterval(() => updateUserOnlineStatus(true), 60 * 1000);

    const handleBeforeUnload = () => {
      // ブラウザを閉じる際のオフライン化はベストエフォート
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    // クリーンアップ関数
    return () => {
      clearInterval(onlineIntervalId);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // ログアウト時 (currentUser が null になる時) にオフラインにする
      updateUserOnlineStatus(false); 
    };
  }, [isClientLoadedForLayout, currentUser]); // 依存配列

  return (
    <html lang="ja">
      <body>
        <Toaster position="top-center" />
        {children}
      </body>
    </html>
  );
}