// app/auth/login/page.tsx
'use client'; // クライアントコンポーネントとして指定

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase'; // Supabaseクライアントをインポート

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault(); // フォームのデフォルト送信を防ぐ
    setLoading(true);
    setMessage('');

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setMessage(`ログインエラー: ${error.message}`);
        console.error('Login error:', error);
      } else {
        setMessage('ログイン成功！');
        router.push('/'); // ログイン後、トップページにリダイレクト
      }
    } catch (error: any) {
      setMessage(`予期せぬエラー: ${error.message}`);
      console.error('Unexpected login error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (event: React.FormEvent) => {
    event.preventDefault(); // フォームのデフォルト送信を防ぐ
    setLoading(true);
    setMessage('');

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      }, {
        // オプション: サインアップ後にリダイレクトURLを指定する場合
        // emailRedirectTo: `${location.origin}/auth/callback` // メール確認用URL
        // data: {} // ユーザーメタデータ。今回はprofilesテーブルに別途保存するので空でOK
      });

      if (error) {
        setMessage(`登録エラー: ${error.message}`);
        console.error('Sign up error:', error);
      } else {
        setMessage('登録メールを送信しました。メールを確認して認証してください。');
        // router.push('/'); // メール確認が必須の場合、ここではリダイレクトしない
      }
    } catch (error: any) {
      setMessage(`予期せぬエラー: ${error.message}`);
      console.error('Unexpected sign up error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Momentos にログイン/登録
          </h2>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email-address" className="sr-only">
                メールアドレス
              </label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="メールアドレス"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                パスワード
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="パスワード"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {message && (
            <p className="mt-2 text-center text-sm text-red-600">
              {message}
            </p>
          )}

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {loading ? '処理中...' : 'ログイン'}
            </button>
          </div>
        </form>

        <div className="text-center">
          <p className="text-sm text-gray-600">アカウントをお持ちでないですか？</p>
          <button
            onClick={handleSignUp}
            disabled={loading}
            className="mt-2 group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-indigo-600 bg-indigo-100 hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {loading ? '処理中...' : '新規登録'}
          </button>
        </div>
      </div>
    </div>
  );
}