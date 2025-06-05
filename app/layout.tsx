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
  // 'session' ステートは currentUser の設定や、将来的にセッション情報を直接参照する可能性を考慮して残します。
  // ESLintの警告を個別に無効化するか、プロジェクト設定で調整することも可能です。
  // ここでは、currentUser の設定に newSession が使われているため、sessionステート自体は間接的に役立っています。
  const [session, setSession] = useState<Session | null>(null); // Line 30 in previous logs
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isClientLoadedForLayout, setIsClientLoadedForLayout] = useState(false);

  useEffect(() => {
    setIsClientLoadedForLayout(true);

    supabase.auth.getSession().then(({ data: { session: currentSessionData } }) => {
      setSession(currentSessionData);
      setCurrentUser(currentSessionData?.user ?? null);
      if (currentSessionData?.user) {
        // console.log('[Layout] Initial session loaded, user:', currentSessionData.user.id);
      } else {
        // console.log('[Layout] Initial session loaded, no user.');
      }
    }).catch(error => {
      console.error('[Layout] Error getting initial session:', error);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      // console.log(`[Layout] Auth state changed. Event: ${_event}, User: ${newSession?.user?.id || null}`);
      setSession(newSession); // session ステートを更新
      setCurrentUser(newSession?.user ?? null); // currentUser ステートを更新
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);


  // アプリケーション全体でのオンラインステータス管理 useEffect
  useEffect(() => {
    if (!isClientLoadedForLayout || !currentUser) {
      return;
    }

    const userId = currentUser.id;
    
    // ★ 'onlineIntervalId' を const で宣言し、useEffect のスコープ内で管理
    const updateUserOnlineStatus = async (isOnline: boolean) => {
      if (!currentUser || currentUser.id !== userId) { 
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
          // console.error(`[Layout OnlineEffect] Error setting user ${userId} status to ${isOnline}:`, error);
        } else {
          // console.log(`[Layout OnlineEffect] User ${userId} status set to ${isOnline}.`);
        }
      } catch (e) {
        console.error(`[Layout OnlineEffect] Exception setting user ${userId} status to ${isOnline}:`, e);
      }
    };

    updateUserOnlineStatus(true);
    const onlineIntervalIdConst = setInterval(() => updateUserOnlineStatus(true), 60 * 1000); // ★ const で宣言

    const handleBeforeUnload = () => {
      if (currentUser?.id) {
         console.log(`[Layout OnlineEffect] beforeunload triggered for user ${currentUser.id}.`);
         // updateUserOnlineStatus(false); // Best-effort, may not complete
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(onlineIntervalIdConst); // ★ const で宣言した変数をクリア
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (currentUser?.id) { // クリーンアップ時にも最新のcurrentUserを参照
        console.log(`[Layout OnlineEffect] Cleanup for user ${currentUser.id}. Setting offline.`);
        updateUserOnlineStatus(false); 
      }
    };
  }, [isClientLoadedForLayout, currentUser]);


  return (
    <html lang="ja">
      <body>
        <Toaster position="top-center" />
        {children}
      </body>
    </html>
  );
}