// app/chat-history/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js'; // Session を削除
import Link from 'next/link'; // Link をインポート
import toast, { Toaster } from 'react-hot-toast'; // Toasterをインポート

// 型定義 (あなたのプロジェクトの型定義ファイルのパスに合わせてください)
import { Profile, ChatHistoryItem, ChatRequest } from '../../lib/types'; 
// もし型定義をこのファイルにローカルで持ちたい場合は、
// UserLeftPayload など、必要な他の型も定義してください。
// interface Profile { ... }
// interface ChatHistoryItem { ... }
// interface ChatRequest { ... }


export default function ChatHistoryPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [chatHistoryItems, setChatHistoryItems] = useState<ChatHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null); // error から pageError に変更
  const [isClientLoaded, setIsClientLoaded] = useState(false); // ★ isClientLoaded を追加

  // --- 応答待ちのためのステート変数 ---
  const [initiatingChatWith, setInitiatingChatWith] = useState<string | null>(null);
  const [waitingForRequestId, setWaitingForRequestId] = useState<string | null>(null);
  const [waitingForRoomId, setWaitingForRoomId] = useState<string | null>(null);
  const [waitingForTargetNickname, setWaitingForTargetNickname] = useState<string | null>(null);
  // isRequestAcceptedModalOpen とそのセッターも必要なら追加 (HomePageと同様のモーダルを使う場合)
  // const [isRequestAcceptedModalOpen, setIsRequestAcceptedModalOpen] = useState(false);


  useEffect(() => {
    setIsClientLoaded(true);
  }, []);

  // 認証状態の確認と現在のユーザー取得
  useEffect(() => {
    const getSessionAndUser = async () => {
      const { data: { session }, error: sessionFetchError } = await supabase.auth.getSession(); // error 変数名変更
      if (sessionFetchError || !session?.user) {
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
      } else {
        setCurrentUser(null);
        router.push('/auth/login');
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [router]);

  // チャット履歴の取得関数
  // app/chat-history/page.tsx 内

// app/chat-history/page.tsx 内

  // app/chat-history/page.tsx 内

  const fetchChatHistory = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    setPageError(null); // pageError はあなたのエラー用ステート名

    try {
      // 1. 自分が参加しているチャットルームを取得 (affection_level も取得)
      const { data: rooms, error: roomsError } = await supabase
        .from('chat_rooms')
        .select('id, user1_id, user2_id, affection_level')
        .or(`user1_id.eq.${currentUser.id},user2_id.eq.${currentUser.id}`);

      if (roomsError) throw roomsError;

      if (!rooms || rooms.length === 0) {
        setChatHistoryItems([]);
        setLoading(false);
        return;
      }

      // 2. 各ルームの相手情報と最新メッセージを取得
      const historyItemsPromises = rooms.map(async (room) => {
        const otherUserId = room.user1_id === currentUser.id ? room.user2_id : room.user1_id;

        // 相手のプロフィール取得
        const { data: profile } = await supabase
          .from('profiles').select('nickname').eq('user_id', otherUserId).single();
        
        // そのルームの最新メッセージを1件取得
        const { data: lastMessage } = await supabase
          .from('messages')
          .select('content, created_at')
          .eq('room_id', room.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        
        // 相手のオンライン状態を取得
        const oneMinuteAgoISO = new Date(Date.now() - 60 * 1000).toISOString();
        const { data: onlineStatus, error: statusError } = await supabase
            .from('user_statuses')
            .select('user_id')
            .eq('user_id', otherUserId)
            .eq('is_online', true)
            .gte('last_active_at', oneMinuteAgoISO)
            .single();

        if (statusError && statusError.code !== 'PGRST116') { // 'PGRST116' は行が見つからないエラー
            console.error('Error fetching status for history:', statusError);
        }
        
        // ★★★ ChatHistoryItem の定義に合わせてオブジェクトを作成 ★★★
        return {
          roomId: room.id,
          otherUserId: otherUserId,
          otherUserNickname: profile?.nickname || '名無しさん',
          affectionLevel: room.affection_level || 0,
          lastMessage: lastMessage?.content || null,
          lastMessageAt: lastMessage?.created_at || null,
          isOnline: !!onlineStatus, // オンライン状態をtrue/falseで設定
          unreadCount: 0, // 未読機能は別途実装
        };
      });

      const historyItems = await Promise.all(historyItemsPromises);
      
      // 最新メッセージの日時でソート
      historyItems.sort((a, b) => {
        if (!a.lastMessageAt) return 1;
        if (!b.lastMessageAt) return -1;
        return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
      });

      setChatHistoryItems(historyItems);

    } catch (error) {
      console.error("Error fetching chat history:", error);
      if (error instanceof Error) {
        toast.error(`チャット履歴の取得に失敗: ${error.message}`);
      } else {
        toast.error("チャット履歴の取得中に不明なエラーが発生しました。");
      }
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) {
      fetchChatHistory();
    }
  }, [currentUser, fetchChatHistory]);

  // 「話しかける」処理関数 (HomePageのものをベースに修正)
  const handleReinitiateChat = async (item: ChatHistoryItem) => {
    const callTimestamp = new Date().toISOString();
    console.log(`[ChatHistory] handleReinitiateChat START - ${callTimestamp} for target: ${item.otherUserId}, room: ${item.roomId}`);

    if (initiatingChatWith === item.otherUserId || initiatingChatWith === "ANY_USER_PENDING_FROM_HISTORY") {
      console.log(`[ChatHistory] IGNORED - ${callTimestamp}] Already initiating chat with ${item.otherUserId}`);
      return;
    }
    setInitiatingChatWith(item.otherUserId);

    try {
      if (!currentUser) {
        toast.error('エラー: ログインしていません。'); // ★ alert を toast に変更
        return;
      }
      if (!item.isOnline) {
        toast(`${item.otherUserNickname || '相手'}さんは現在オフラインのため、チャットを開始できません。`); // ★ alert を toast に変更
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
        toast.error(`チャットリクエスト送信失敗: ${requestError?.message || 'データなし'}`); // ★ alert を toast に変更
        return;
      }

      console.log(`[ChatHistory] New request created. Request ID: ${newRequestData.id}, Room ID: ${item.roomId}`);
      
      setWaitingForRequestId(newRequestData.id);
      setWaitingForRoomId(item.roomId);
      setWaitingForTargetNickname(item.otherUserNickname || '相手');
      toast.success(`${item.otherUserNickname || '相手'}にお誘いを送信しました。応答をお待ちください。`); // ★ alert を toast に変更

    } catch (e: unknown) { // ★ any を unknown に変更
      console.error(`[ChatHistory CATCH - ${callTimestamp}] Exception:`, e);
      let message = `チャット開始処理で予期せぬエラーが発生しました。`;
      if (e instanceof Error) {
        message = `チャット開始処理エラー: ${e.message}`;
      }
      toast.error(message); // ★ alert を toast に変更
    } finally {
      setInitiatingChatWith(null);
      console.log(`[ChatHistory FINALLY - ${callTimestamp}] Reset initiatingChatWith.`);
    }
  };

  // 相手の応答を待つためのuseEffectフック (HomePageのものをベースに)
  useEffect(() => {
    if (!waitingForRequestId || !currentUser) {
      return;
    }
    const currentWaitingRequestId = waitingForRequestId;
    const currentWaitingRoomId = waitingForRoomId;
    const currentWaitingTargetNickname = waitingForTargetNickname;
    const userIdForChannel = currentUser.id; // チャンネル名の一意性のために追加

    console.log(`[ChatHistory Resp Listener] Now waiting for request ID: ${currentWaitingRequestId}`);
    
    const requestStatusChannel = supabase
      .channel(`chat_history_awaits_request_${currentWaitingRequestId}_${userIdForChannel}`) // チャンネル名をユニークに
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_requests', filter: `id=eq.${currentWaitingRequestId}`},
        (payload) => {
          const updatedRequest = payload.new as ChatRequest;
          console.log('[ChatHistory Resp Listener] Chat request update received:', updatedRequest);
          if (updatedRequest.id === currentWaitingRequestId) {
            if (updatedRequest.status === 'accepted') {
              // setIsRequestAcceptedModalOpen(true); // HomePageのモーダルとは別、または共通のモーダル表示ロジック
              // ここではtoast通知と直接ナビゲーション
              toast.success(`${currentWaitingTargetNickname || '相手'}がお誘いを受けてくれました！チャット画面へ移動します。`);
              if (currentWaitingRoomId) { router.push(`/chat/${currentWaitingRoomId}`); }
              setWaitingForRequestId(null); setWaitingForRoomId(null); setWaitingForTargetNickname(null);
              supabase.removeChannel(requestStatusChannel);
            } else if (updatedRequest.status === 'rejected') {
              toast(`${currentWaitingTargetNickname || '相手'}にリクエストを拒否されました。`);
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
  }, [waitingForRequestId, currentUser, router, waitingForRoomId, waitingForTargetNickname]);


  if (loading && !isClientLoaded) { // ★ isClientLoadedも考慮
    return (<div className="flex justify-center items-center min-h-screen bg-gray-100"><p className="text-xl text-gray-700">読み込み中...</p></div>);
  }
  if (pageError) {
    return (<div className="flex flex-col justify-center items-center min-h-screen bg-gray-100 p-4"><p className="text-xl text-red-600 mb-4">{pageError}</p><button onClick={() => router.push('/')} className="px-6 py-2 bg-[#6F4E37] text-white rounded-lg hover:bg-[#5a3f2b] transition duration-150">ホームに戻る</button></div>);
  }

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4 sm:px-6 lg:px-8">
      <Toaster position="top-center" /> {/* Toasterを配置 */}
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
              <li key={item.roomId} className="hover:bg-gray-50">
                {/* ★ Link コンポーネントで囲む */}
                <Link href={`/chat/${item.roomId}`} className="block transition duration-150 group">
                  <div className="px-4 py-4 sm:px-6">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-lg font-semibold text-[#6F4E37] truncate group-hover:text-blue-600">
                        {item.otherUserNickname || '不明なユーザー'}
                      </p>
                      <p className={`text-xs ${item.isOnline ? 'text-green-500 font-semibold' : 'text-gray-400'}`}>
                        {item.isOnline ? '● オンライン' : '○ オフライン'}
                      </p>
                    </div>
                    <div className="mt-2 flex justify-between items-center">
                      <span className="text-sm text-gray-500 group-hover:text-gray-700">チャットを開く &rarr;</span>
                      <button
                        onClick={(e) => {
                          e.preventDefault(); // Linkの遷移を止める
                          e.stopPropagation(); // 親要素へのイベント伝播を止める
                          if (!initiatingChatWith) handleReinitiateChat(item);
                        }}
                        disabled={!!initiatingChatWith || !item.isOnline}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md shadow-sm transition-colors duration-150 ${item.isOnline && !initiatingChatWith ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
                      >
                        話しかける
                      </button>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}