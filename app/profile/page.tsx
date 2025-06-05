// app/profile/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

interface ProfileFormData {
  nickname: string;
  age: number | ''; // 数値または空文字列
  residence: string;
  bio: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [formData, setFormData] = useState<ProfileFormData>({
    nickname: '',
    age: '',
    residence: '',
    bio: '',
  });

  // 認証セッションの取得
  useEffect(() => {
    async function getSession() {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session) {
        router.push('/auth/login');
      } else {
        setSession(session);
      }
      setLoading(false);
    }
    getSession();
  }, [router]);

  // プロフィールデータの取得
  useEffect(() => {
    async function fetchProfile() {
      if (!session) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', session.user.id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // データがない場合 (初回アクセスなど) はフォームを空のままにする
          console.log('No profile found, creating new one.');
        } else {
          console.error('Error fetching profile:', error);
          alert('プロフィールの取得に失敗しました。');
        }
      } else if (data) {
        setFormData({
          nickname: data.nickname || '',
          age: data.age || '',
          residence: data.residence || '',
          bio: data.bio || '',
        });
      }
      setLoading(false); // プロフィール取得後もローディング終了
    }

    if (session) {
      fetchProfile();
    }
  }, [session]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'age' ? (value === '' ? '' : Number(value)) : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) {
      alert('認証されていません。再度ログインしてください。');
      router.push('/auth/login');
      return;
    }
    if (!formData.nickname.trim()) {
      alert('ニックネームは必須です。');
      return;
    }

    setLoading(true);
    const { error } = await supabase
      .from('profiles')
      .upsert(
        {
          user_id: session.user.id,
          nickname: formData.nickname.trim(),
          age: formData.age === '' ? null : formData.age, // 空の場合はnullを送信
          residence: formData.residence.trim(),
          bio: formData.bio.trim(),
        },
        { onConflict: 'user_id' } // user_id が競合したら更新する
      );

    if (error) {
      console.error('Error saving profile:', error);
      alert('プロフィールの保存に失敗しました。');
    } else {
      alert('プロフィールを保存しました！');
      router.push('/'); // ホームページへリダイレクト
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-xl font-semibold text-gray-700">プロフィールを読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-xl shadow-lg">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            プロフィール設定
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            他のユーザーに表示される情報を入力してください。
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {/* ニックネーム */}
          <div>
            <label htmlFor="nickname" className="block text-sm font-medium text-gray-700">
              ニックネーム
            </label>
            <input
              id="nickname"
              name="nickname"
              type="text"
              required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-700 placeholder-gray-500" // ★修正
              value={formData.nickname}
              onChange={handleChange}
            />
          </div>

          {/* 年齢 */}
          <div>
            <label htmlFor="age" className="block text-sm font-medium text-gray-700">
              年齢
            </label>
            <input
              id="age"
              name="age"
              type="number"
              min="18" // 18歳以上を想定
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-700 placeholder-gray-500" // ★修正
              value={formData.age === 0 ? '' : formData.age} // 0を空欄にする
              onChange={handleChange}
            />
          </div>

          {/* 居住地 */}
          <div>
            <label htmlFor="residence" className="block text-sm font-medium text-gray-700">
              居住地
            </label>
            <input
              id="residence"
              name="residence"
              type="text"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-700 placeholder-gray-500" // ★修正
              value={formData.residence}
              onChange={handleChange}
            />
          </div>

          {/* 自己紹介 */}
          <div>
            <label htmlFor="bio" className="block text-sm font-medium text-gray-700">
              自己紹介
            </label>
            <textarea
              id="bio"
              name="bio"
              rows={4} // 表示行数
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm resize-y text-gray-700 placeholder-gray-500" // ★修正
              value={formData.bio}
              onChange={handleChange}
            />
          </div>

          {/* 保存ボタン */}
          <div>
            <button
              type="submit"
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              disabled={loading}
            >
              {loading ? '保存中...' : 'プロフィールを保存'}
            </button>
          </div>
        </form>

        {/* ログインページに戻るボタン */}
        <div className="mt-6 text-center">
          <button
            onClick={() => router.push('/')}
            className="text-indigo-600 hover:text-indigo-900 text-sm font-medium"
          >
            キャンセルしてカフェに戻る
          </button>
        </div>
      </div>
    </div>
  );
}