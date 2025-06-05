// app/chat-history/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase'; // あなたのSupabaseクライアント設定に合わせてパスを調整
import { User, Session } from '@supabase/supabase-js'; // Sessionもインポート
import Link from 'next/link';

// プロフィール情報の型定義
interface Profile {
  user_id?: string; // profilesテーブルのuser_idも取得する場合
  nickname: string | null;
  age?: number;
  residence?: string;
  bio?: string;
}

// チャット履歴アイテムの型定義
interface ChatHistoryItem {
  roomId: string;
  otherUserId: string;
  otherUserNickname: string | null;
  isOnline: boolean;
}

// chat_requestsテーブルの型 (応答待ちリスナー用)
interface ChatRequest {
  id: string;
  sender_id: string;
  receiver_id: string;
  room_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
}

export default function ChatHistoryPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [chatHistoryItems, setChatHistoryItems] = useState<ChatHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isClientLoaded, setIsClientLoaded] = useState(false);
  // --- 応答待ちのためのステート変数 ---
  const [initiatingChatWith, setInitiatingChatWith] = useState<string | null>(null); // 修正: 正しい関数名で宣言
  const [waitingForRequestId, setWaitingForRequestId] = useState<string | null>(null);
  const [waitingForRoomId, setWaitingForRoomId] = useState<string | null>(null);
  const [waitingForTargetNickname, setWaitingForTargetNickname] = useState<string | null>(null);
  // --- ここまで ---------------------

  // 認証状態の確認と現在のユーザー取得
  useEffect(() => {
    const getSessionAndUser = async () => {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.user) {
        router.push('/auth/login');
        return;
      }
      setCurrentUser(session.user);
    };
    getSessionAndUser();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
        router.push('/auth/login');
      } else if (session?.user) {
        setCurrentUser(session.user);
      } else { // セッションはあるがユーザーがない場合などもログインへ
        setCurrentUser(null);
        router.push('/auth/login');
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    setIsClientLoaded(true); // ★★★ この useEffect を追加 ★★★
  }, []); // 空の依存配列なので、マウント時に一度だけ実行される

  // チャット履歴の取得関数
  const fetchChatHistory = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    setError(null);

    try {
      const { data: rooms, error: roomsError } = await supabase
        .from('chat_rooms')
        .select('id, user1_id, user2_id')
        .or(`user1_id.eq.${currentUser.id},user2_id.eq.${currentUser.id}`);

      if (roomsError) throw roomsError;

      if (!rooms || rooms.length === 0) {
        setChatHistoryItems([]);
        setLoading(false);
        return;
      }

      const otherUserIds = rooms.map(room => 
        room.user1_id === currentUser.id ? room.user2_id : room.user1_id
      );
      const uniqueOtherUserIds = [...new Set(otherUserIds)];

      let profilesMap = new Map<string, Profile>();
      let onlineStatusMap = new Map<string, { is_online: boolean }>();

      if (uniqueOtherUserIds.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('user_id, nickname') // 必要な情報のみ取得
          .in('user_id', uniqueOtherUserIds);

        if (profilesError) console.error('Error fetching profiles for chat history:', profilesError);
        else if (profilesData) profilesData.forEach(p => profilesMap.set(p.user_id, p as Profile));

        const { data: statusesData, error: statusesError } = await supabase
          .from('user_statuses')
          .select('user_id, is_online')
          .in('user_id', uniqueOtherUserIds);

        if (statusesError) console.error('Error fetching user statuses for chat history:', statusesError);
        else if (statusesData) statusesData.forEach(s => onlineStatusMap.set(s.user_id, { is_online: s.is_online }));
      }

      const resolvedHistoryItems = rooms.map((room): ChatHistoryItem => {
        const otherUserId = room.user1_id === currentUser.id ? room.user2_id : room.user1_id;
        const profile = profilesMap.get(otherUserId);
        const status = onlineStatusMap.get(otherUserId);
        return {
          roomId: room.id,
          otherUserId: otherUserId,
          otherUserNickname: profile?.nickname || '不明なユーザー',
          isOnline: status?.is_online || false,
        };
      });
      
      // TODO: ここで最終メッセージ時刻などでソートするロジックを追加可能
      setChatHistoryItems(resolvedHistoryItems);

    } catch (err: any) {
      console.error('Error fetching chat history:', err);
      setError('チャット履歴の取得に失敗しました。');
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) {
      fetchChatHistory();
    }
  }, [currentUser, fetchChatHistory]);

  // 新しい「話しかける」処理関数
  const handleReinitiateChat = async (item: ChatHistoryItem) => {
    const callTimestamp = new Date().toISOString();
    console.log(`[ChatHistory] handleReinitiateChat START - ${callTimestamp} for target: ${item.otherUserId}, room: ${item.roomId}`);

    if (initiatingChatWith === item.otherUserId || initiatingChatWith === "ANY_USER_PENDING_FROM_HISTORY") {
      console.log(`[ChatHistory] IGNORED - ${callTimestamp}] Already initiating chat with ${item.otherUserId}`);
      return;
    }
    setInitiatingChatWith(item.otherUserId); // ★★★ 修正: 小文字の 's' ★★★

    try {
      if (!currentUser) {
        alert('エラー: ログインしていません。');
        return;
      }
      if (!item.isOnline) {
        alert(`${item.otherUserNickname || '相手'}さんは現在オフラインのため、チャットを開始できません。`);
        return;
      }

      const currentUserId = currentUser.id;

      console.log(`[ChatHistory] Creating new request for existing room: ${item.roomId}, to user: ${item.otherUserId}`);
      const { data: newRequestData, error: requestError } = await supabase
        .from('chat_requests')
        .insert({
          sender_id: currentUserId,
          receiver_id: item.otherUserId,
          room_id: item.roomId,
          status: 'pending'
        })
        .select('id')
        .single();

      if (requestError || !newRequestData) {
        console.error(`[ChatHistory ERROR - ${callTimestamp}] Sending chat request:`, requestError || 'No data from new request insert');
        alert(`チャットリクエストの送信に失敗しました: ${requestError?.message || 'データなし'}`);
        return;
      }

      console.log(`[ChatHistory] New request created. Request ID: ${newRequestData.id}, Room ID: ${item.roomId}`);
      
      setWaitingForRequestId(newRequestData.id);
      setWaitingForRoomId(item.roomId);
      setWaitingForTargetNickname(item.otherUserNickname || '相手');

    } catch (e: any) {
      console.error(`[ChatHistory CATCH - ${callTimestamp}] Exception:`, e);
      alert(`チャット開始処理で予期せぬエラーが発生しました: ${e.message}`);
    } finally {
      setInitiatingChatWith(null); // ★★★ 修正: 小文字の 's' ★★★
      console.log(`[ChatHistory FINALLY - ${callTimestamp}] Reset initiatingChatWith.`);
    }
  };

  // 相手の応答を待つためのuseEffectフック (ホームページのものをベースに)
  useEffect(() => {
    if (!waitingForRequestId || !currentUser) {
      return;
    }
    const currentWaitingRequestId = waitingForRequestId;
    const currentWaitingRoomId = waitingForRoomId;
    const currentWaitingTargetNickname = waitingForTargetNickname;

    console.log(`[ChatHistory Resp Listener] Now waiting for request ID: ${currentWaitingRequestId}`);
    
    const requestStatusChannel = supabase
      .channel(`chat_history_awaits_request_${currentWaitingRequestId}_${currentUser.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_requests', filter: `id=eq.${currentWaitingRequestId}`},
        (payload) => {
          const updatedRequest = payload.new as ChatRequest;
          console.log('[ChatHistory Resp Listener] Chat request update received:', updatedRequest);
          if (updatedRequest.id === currentWaitingRequestId) {
            if (updatedRequest.status === 'accepted') {
              alert(`${currentWaitingTargetNickname || '相手'}がお誘いを受けてくれました。チャット画面へ移動します。`);
              if (currentWaitingRoomId) { router.push(`/chat/${currentWaitingRoomId}`); }
              setWaitingForRequestId(null); setWaitingForRoomId(null); setWaitingForTargetNickname(null);
              supabase.removeChannel(requestStatusChannel);
            } else if (updatedRequest.status === 'rejected') {
              alert(`${currentWaitingTargetNickname || '相手'}にリクエストを拒否されました。`);
              setWaitingForRequestId(null); setWaitingForRoomId(null); setWaitingForTargetNickname(null);
              supabase.removeChannel(requestStatusChannel);
            }
          }
        }
      )
      .subscribe((status, err) => {
        console.log(`[ChatHistory Resp Listener] Subscription status for request ID ${currentWaitingRequestId}: ${status}`, err || '');
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.error(`[ChatHistory Resp Listener] Channel error for request ID ${currentWaitingRequestId}: ${status}`, err);
          setWaitingForRequestId(null); setWaitingForRoomId(null); setWaitingForTargetNickname(null);
        }
      });
    return () => {
      console.log(`[ChatHistory Resp Listener] CLEANUP: Removing listener for request ID: ${currentWaitingRequestId}`);
      supabase.removeChannel(requestStatusChannel);
    };
  }, [waitingForRequestId, currentUser, router, waitingForRoomId, waitingForTargetNickname]); // currentUser 全体を依存に


  // --- JSX Rendering ---
  if (loading) {
    return (<div className="flex justify-center items-center min-h-screen bg-gray-100"><p className="text-xl text-gray-700">読み込み中...</p></div>);
  }
  if (error) {
    return (<div className="flex flex-col justify-center items-center min-h-screen bg-gray-100 p-4"><p className="text-xl text-red-600 mb-4">{error}</p><button onClick={() => router.push('/')} className="px-6 py-2 bg-[#6F4E37] text-white rounded-lg hover:bg-[#5a3f2b] transition duration-150">ホームに戻る</button></div>);
  }

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4 sm:px-6 lg:px-8">
      <header className="mb-8 text-center">
        <h1 className="text-4xl font-bold text-[#6F4E37]">チャット履歴</h1>
        <button onClick={() => router.push('/')} className="mt-4 px-4 py-2 text-sm bg-transparent text-[#6F4E37] hover:underline">&larr; ホームに戻る</button>
      </header>

      {isClientLoaded && waitingForRequestId && (
        <div className="max-w-2xl mx-auto w-full p-4 my-4 bg-yellow-100 border border-yellow-300 rounded-lg text-center shadow">
          <p className="text-yellow-700 font-semibold">{waitingForTargetNickname || '相手'}さんの応答を待っています...</p>
        </div>
      )}

      {chatHistoryItems.length === 0 ? (
        <div className="text-center py-10">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-16 h-16 mx-auto text-gray-400 mb-4"><path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <p className="text-xl text-gray-500">チャット履歴はありません。</p>
        </div>
      ) : (
        <div className="max-w-2xl mx-auto bg-white shadow-xl rounded-lg overflow-hidden">
          <ul role="list" className="divide-y divide-gray-200">
            {chatHistoryItems.map((item) => (
              <li key={item.roomId} className="px-4 py-4 sm:px-6 hover:bg-gray-50 transition duration-150">
                <div className="flex items-center justify-between mb-1"> {/*ニックネームとオンライン状態を同じ行に*/}
                  <p className="text-lg font-semibold text-[#6F4E37] truncate">
                    {item.otherUserNickname || '不明なユーザー'}
                  </p>
                  <p className={`text-xs ${item.isOnline ? 'text-green-500 font-semibold' : 'text-gray-400'}`}>
                    {item.isOnline ? '● オンライン' : '○ オフライン'}
                  </p>
                </div>
                {/* 将来的に最終メッセージなどを表示する場合はここに追加 */}
                {/* <p className="text-sm text-gray-500 truncate">最後のメッセージ...</p> */}
                <div className="mt-2 text-right">
                  <button
                    onClick={() => !initiatingChatWith && handleReinitiateChat(item)}
                    disabled={!!initiatingChatWith || !item.isOnline}
                    className={`px-4 py-2 text-sm font-medium rounded-md shadow-sm transition-colors duration-150
                                ${item.isOnline && !initiatingChatWith 
                                  ? 'bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500' 
                                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
                  >
                    話しかける
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}