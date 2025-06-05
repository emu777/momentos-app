// app/profile/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Session, User } from '@supabase/supabase-js'; // Session と User をインポート
import toast, { Toaster } from 'react-hot-toast';     // Toaster と toast をインポート

interface ProfileFormData {
  nickname: string;
  age: number | '';
  residence: string;
  bio: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [session, setSession] = useState<Session | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<ProfileFormData>({
    nickname: '',
    age: '',
    residence: '',
    bio: '',
  });
  const [isClientLoaded, setIsClientLoaded] = useState(false);

  useEffect(() => {
    setIsClientLoaded(true);
  }, []);

  // 認証セッションの取得と現在のユーザー設定
  useEffect(() => {
    async function getSessionAndUser() {
      if (!isClientLoaded) return;
      // setLoading(true); // ここではまだ true にしないか、fetchProfileの前に移動

      const { data: { session: currentSessionData }, error } = await supabase.auth.getSession();
      if (error || !currentSessionData) {
        router.push('/auth/login');
        setLoading(false); // エラー時はローディング終了
        return;
      }
      setSession(currentSessionData);
      setCurrentUser(currentSessionData.user);
      // setLoading(false); // プロフィール取得後にローディングをまとめて解除するため、ここではまだ
    }
    getSessionAndUser();
  }, [router, isClientLoaded]);


  // プロフィールデータの取得
  useEffect(() => {
    let isActive = true; // コンポーネントがマウントされているか追跡

    async function fetchProfile() {
      if (!currentUser) {
        if (isActive) {
          setLoading(false); // currentUser がない場合はローディング終了
          setFormData({ nickname: '', age: '', residence: '', bio: '' }); // フォームをクリア
        }
        return;
      }
      
      // setLoading(true); // ★ データを取得開始する直前に true にする

      console.log(`[ProfilePage] Fetching profile for user: ${currentUser.id}`);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', currentUser.id)
          .single();

        if (!isActive) return; // アンマウントされていたらステートを更新しない

        if (error) {
          if (error.code === 'PGRST116') { // 行が見つからないのはエラーではない場合がある
            console.log('No profile found for user, form will be empty for new profile.');
            setFormData({ nickname: '', age: '', residence: '', bio: '' }); // 新規作成のためにフォームを空にする
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
      } catch (err) {
        if (isActive) {
          console.error("Exception in fetchProfile:", err);
          toast.error("プロファイル取得中に予期せぬエラーが発生しました。");
        }
      } finally {
        if (isActive) {
          setLoading(false); // 処理完了（成功または失敗）後にローディング終了
        }
      }
    }

    // isClientLoaded と currentUser が有効になったらプロフィールを取得
    if (isClientLoaded && currentUser) {
      // loading が true の場合（つまり、まだ取得していないか、再取得が必要な場合）のみ実行する、
      // というよりは、currentUser が変わったタイミングで取得するのが一般的。
      // この useEffect は currentUser が変わった時に実行される。
      // 実行前に loading を true に設定し、fetchProfile内で最後にfalseにする。
      setLoading(true); // ★ fetchProfile を呼び出す前にローディング開始
      fetchProfile();
    } else if (isClientLoaded && !currentUser) {
      // ユーザーがいない（ログアウト後など）場合はローディングではない
      if (isActive) setLoading(false);
      setFormData({ nickname: '', age: '', residence: '', bio: '' }); // フォームをクリア
    }
    
    return () => {
      isActive = false; // クリーンアップ時にフラグをfalseに
    };
  // ★★★ 依存配列に loading は含めず、currentUser と isClientLoaded にする ★★★
  // loading を含めると、setLoading(true/false) のたびに再実行され無限ループになるため。
  // フックの実行条件はフックの内部のif文で制御する。
  }, [currentUser, isClientLoaded]); 

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
    const profileUpdates = {
      user_id: currentUser.id,
      nickname: formData.nickname.trim(),
      age: formData.age === '' ? null : Number(formData.age),
      residence: formData.residence.trim() || null,
      bio: formData.bio.trim() || null,
      //updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('profiles')
      .upsert(profileUpdates, { onConflict: 'user_id' });

    if (error) {
      console.error('Error saving profile:', error);
      toast.error(`プロフィールの保存に失敗: ${error.message}`);
    } else {
      toast.success('プロフィールを保存しました！');
      router.push('/');
    }
    setLoading(false);
  };

  // 最初のレンダリングやデータ取得前のローディング表示
  if (!isClientLoaded || loading) { 
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-xl font-semibold text-gray-700">読み込み中...</p>
        <svg className="animate-spin h-8 w-8 text-indigo-600 ml-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
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