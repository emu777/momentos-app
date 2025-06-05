// app/profile/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Session, User } from '@supabase/supabase-js';
import toast, { Toaster } from 'react-hot-toast'; // Toasterとtoastも使うのでインポートを確認

interface ProfileFormData {
  nickname: string;
  age: number | '';
  residence: string;
  bio: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  
  // ★★★ ESLintの警告をこの行に対して無効化 ★★★
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [session, setSession] = useState<Session | null>(null); 
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<ProfileFormData>({
    nickname: '',
    age: '',
    residence: '',
    bio: '',
  });
  const [isClientLoaded, setIsClientLoaded] = useState(false); // isClientLoaded も追加推奨

  useEffect(() => {
    setIsClientLoaded(true);
  }, []);

  // 認証セッションの取得と現在のユーザー設定
  useEffect(() => {
    async function getSessionAndUser() {
      if (!isClientLoaded) return; // クライアントロード後に実行
      // setLoading(true); // fetchProfile の前に移動しても良い

      const { data: { session: currentSessionData }, error } = await supabase.auth.getSession();
      if (error || !currentSessionData) {
        router.push('/auth/login');
        // setLoading(false); // エラー時はここでローディング終了
        return;
      }
      setSession(currentSessionData);
      setCurrentUser(currentSessionData.user);
      // setLoading は fetchProfile が終わった後にまとめて false にする
    }
    getSessionAndUser();
  }, [router, isClientLoaded]); // isClientLoaded を依存配列に追加

  // プロフィールデータの取得
  useEffect(() => {
    async function fetchProfile() {
      if (!currentUser || !isClientLoaded) { // isClientLoaded もチェック
        // currentUser がまだない、またはクライアントが準備できていない場合は、
        // 初回プロフ取得は行わない（または setLoading(false) のみ行う）
        if (isClientLoaded && !currentUser && !loading ) { // 既にロードが終わっていてcurrentUserがない場合
             // (getSessionでリダイレクトされるはずだが念のため)
        } else if (!isClientLoaded && !loading) {
            //
        } else {
           // setLoading(false); // このケースではまだローディング中の可能性がある
        }
        return;
      }
      
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', currentUser.id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          console.log('No profile found for user, form will be empty.');
        } else {
          console.error('Error fetching profile:', error);
          toast.error('プロフィールの取得に失敗しました。');
        }
      } else if (data) {
        setFormData({
          nickname: data.nickname || '',
          age: data.age === null || data.age === undefined ? '' : data.age,
          residence: data.residence || '',
          bio: data.bio || '',
        });
      }
      setLoading(false);
    }

    if (isClientLoaded) { // クライアントサイドでマウントされてから実行
        fetchProfile();
    }
  }, [currentUser, isClientLoaded]); // isClientLoaded を依存配列に追加

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'age' ? (value === '' ? '' : Number(value)) : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      toast.error('認証されていません。再度ログインしてください。');
      router.push('/auth/login');
      return;
    }
    if (!formData.nickname.trim()) {
      toast.error('ニックネームは必須です。');
      return;
    }

    setLoading(true);
    const { error } = await supabase
      .from('profiles')
      .upsert(
        {
          user_id: currentUser.id,
          nickname: formData.nickname.trim(),
          age: formData.age === '' ? null : Number(formData.age),
          residence: formData.residence.trim(),
          bio: formData.bio.trim(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

    if (error) {
      console.error('Error saving profile:', error);
      toast.error('プロフィールの保存に失敗しました。');
    } else {
      toast.success('プロフィールを保存しました！');
      router.push('/');
    }
    setLoading(false);
  };

  if (!isClientLoaded || loading) { // isClientLoaded も考慮
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-xl font-semibold text-gray-700">読み込み中...</p>
        {/* スピナー */}
      </div>
    );
  }
  
  if (!currentUser && isClientLoaded) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-gray-50">
              <p className="text-xl font-semibold text-gray-700">ユーザー情報がありません。ログインページへリダイレクトします...</p>
          </div>
      );
  }

  return (
    <>
      <Toaster position="top-center" />
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8 bg-white p-8 sm:p-10 rounded-xl shadow-2xl">
          <div>
            <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
              プロフィール設定
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              あなたの情報を入力してください。
            </p>
          </div>
          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="nickname" className="block text-sm font-medium text-gray-700">
                ニックネーム <span className="text-red-500">*</span>
              </label>
              <input
                id="nickname" name="nickname" type="text" required
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-700"
                value={formData.nickname} onChange={handleChange}
              />
            </div>

            <div>
              <label htmlFor="age" className="block text-sm font-medium text-gray-700">
                年齢
              </label>
              <input
                id="age" name="age" type="number" min="18"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-700"
                value={formData.age === 0 ? '' : formData.age} onChange={handleChange}
              />
            </div>

            <div>
              <label htmlFor="residence" className="block text-sm font-medium text-gray-700">
                居住地
              </label>
              <input
                id="residence" name="residence" type="text"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-700"
                value={formData.residence} onChange={handleChange}
              />
            </div>

            <div>
              <label htmlFor="bio" className="block text-sm font-medium text-gray-700">
                自己紹介
              </label>
              <textarea
                id="bio" name="bio" rows={4}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm resize-y text-gray-700"
                value={formData.bio} onChange={handleChange}
              />
            </div>

            <div>
              <button
                type="submit"
                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-70"
                disabled={loading}
              >
                {loading ? (
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : 'プロフィールを保存'}
              </button>
            </div>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => router.push('/')}
              className="text-indigo-600 hover:text-indigo-800 text-sm font-medium transition-colors"
            >
              キャンセルしてカフェに戻る
            </button>
          </div>
        </div>
      </div>
    </>
  );
}