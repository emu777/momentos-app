import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export const AuthProvider = ({ initialSession, children }) => {
  const [session, setSession] = useState(initialSession);

  useEffect(() => {
    // このリスナーは、サインアウト時やパスワード変更時など、
    // クライアントサイドで認証状態が変化したときにセッションを更新します。
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []); // マウント時に一度だけ実行

  return <AuthContext.Provider value={{ session }}>{children}</AuthContext.Provider>;
};

// コンポーネントからセッション情報に簡単にアクセスするためのカスタムフック
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};