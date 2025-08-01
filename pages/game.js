// game.js
import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase, createServerSupabaseClient } from '../lib/supabase';
import dynamic from 'next/dynamic'; // next/dynamic をインポート
import { useAuth } from '../contexts/AuthContext'; // 作成したuseAuthフックをインポート

// GameCanvas.js にKonva関連のロジックを移動し、SSRを無効にして動的にインポート
const DynamicGameCanvas = dynamic(() => import('../components/GameCanvas'), {
  ssr: false, // サーバーサイドレンダリングを無効にする
});

export default function GamePage() {
  const router = useRouter();
  const { session } = useAuth(); // Contextからセッション情報を取得

  // このeffectは、クライアントサイドでセッションがnullになった場合（例：ログアウト時）に
  // ログインページへリダイレクトする役割を担います。
  useEffect(() => {
    // ゲーム画面ではページのスクロールを完全に無効化する
    document.body.style.overflow = 'hidden';
    // コンポーネントがアンマウントされる際にスタイルを元に戻す
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, []);

  useEffect(() => {
    if (!session) {
      router.push('/login');
    }
  }, [session, router]);

  if (!session) {
    // セッションが読み込まれるか、リダイレクトが実行されるまでこのメッセージを表示します。
    return <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">セッションを読み込み中...</div>;
  }

  return (
    <div className="h-screen w-screen bg-gray-900 text-white overflow-hidden">
      {/* GameCanvasは内部でuseAuth()を使えるため、propを渡す必要がなくなります */}
      <DynamicGameCanvas />
    </div>
  );
}

export async function getServerSideProps(context) {
  const { req, res } = context;

  const serverSupabase = createServerSupabaseClient(context);

  const { data: { session } } = await serverSupabase.auth.getSession();

  if (!session) {
    return {
      redirect: {
        destination: '/login',
        permanent: false,
      },
    };
  }

  return {
    props: {
      initialSession: session,
    },
  };
}
