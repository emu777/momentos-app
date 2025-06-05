// app/page.tsx
'use client';
import toast from 'react-hot-toast';
import ChatRequestModal from './components/ChatRequestModal';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Session, User } from '@supabase/supabase-js';
import RequestAcceptedModal from './components/RequestAcceptedModal'; // 作成したモーダルをインポート

// 型定義
interface Profile {
  nickname: string | null; // データベースに合わせて null を許容
  age?: number;
  residence?: string;
  bio?: string;
}

interface UserWithProfile {
  id: string; // auth.users.id と同義
  last_active_at?: string;
  profiles: Profile | null; // 単一の Profile オブジェクトまたは null
}

interface ChatRequest {
  id: string;
  sender_id: string;
  receiver_id: string;
  room_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
}

export default function HomePage() {
  const router = useRouter();
  const [isClientLoaded, setIsClientLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const [session, setSession] = useState<Session | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  const [onlineUsers, setOnlineUsers] = useState<UserWithProfile[]>([]);
  const [isMenuOpen, setIsMenuOpen] = useState(false); // メニューの開閉状態を管理
  const [initiatingChatWith, setIsInitiatingChatWith] = useState<string | null>(null);
  const [waitingForRequestId, setWaitingForRequestId] = useState<string | null>(null);
  const [waitingForRoomId, setWaitingForRoomId] = useState<string | null>(null);
  const [waitingForTargetNickname, setWaitingForTargetNickname] = useState<string | null>(null);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [isRequestAcceptedModalOpen, setIsRequestAcceptedModalOpen] = useState(false);
  const [processingRequest, setProcessingRequest] = useState<ChatRequest | null>(null); // ← この宣言
  const [modalSenderNickname, setModalSenderNickname] = useState<string>('');
  const [isAcceptingOrRejecting, setIsAcceptingOrRejecting] = useState(false);
  useEffect(() => {
    setIsClientLoaded(true);
  }, []);

  // 認証状態のチェックとプロフィールリダイレクト
  useEffect(() => {
    async function checkUserAndProfile() {
      if (!isClientLoaded) return;
      setLoading(true);
      const { data: { session: currentSessionObj }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !currentSessionObj) {
        router.push('/auth/login');
        setLoading(false);
        return;
      }
      setSession(currentSessionObj);
      setCurrentUser(currentSessionObj.user);

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('user_id') 
        .eq('user_id', currentSessionObj.user.id)
        .single();

      if (profileError && profileError.code === 'PGRST116') {
        router.push('/profile');
        setLoading(false);
        return;
      } else if (profileError) {
      }
      setLoading(false);
    }
    checkUserAndProfile();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      const oldUserId = currentUser?.id;
      setSession(newSession);
      setCurrentUser(newSession?.user ?? null);
      if (!newSession) {
        router.push('/auth/login');
      }
    });
    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, [router, isClientLoaded]);

  // オンラインユーザーの取得


const fetchOnlineUsers = useCallback(async () => {
  if (!currentUser || !isClientLoaded) {
    // currentUser がまだない場合は早期リターン
    return;
  }
  
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('user_statuses')
    .select('user_id, last_active_at, profiles(nickname, age, residence, bio)')
    .eq('is_online', true) // is_online: true でフィルタリング (Turn 178 の修正)
    // .gte('last_active_at', oneMinuteAgo); // または last_active_at でフィルタリング

  if (error) {
    setOnlineUsers([]);
  } else {
    const currentAuthUserId = currentUser.id;
    const formattedUsers = data
      ?.map(u => {
        // ★★★ ここが修正ポイント ★★★
        // u.profiles が配列として返される可能性に対応
        let profileData: Profile | null = null;
        if (u.profiles) { // u.profiles が null や undefined でないことを確認
          if (Array.isArray(u.profiles)) { // 配列かどうかをチェック
            if (u.profiles.length > 0) {
              profileData = u.profiles[0] as Profile; // 配列なら最初の要素を取得
            } else {
              profileData = null; // 空配列ならプロフィールなし
            }
          } else {
            // 配列ではない場合 (既に単一オブジェクトまたはnullであると期待される場合)
            profileData = u.profiles as Profile | null; 
          }
        }

        return {
          id: u.user_id, // UserWithProfile の id には user_statuses.user_id を設定
          last_active_at: u.last_active_at,
          profiles: profileData // ★処理済みの単一プロフィールオブジェクト (またはnull) を設定
        };
      })
      .filter(u => u.id !== currentAuthUserId && u.profiles !== null) // 自分自身とプロフィールがないユーザーを除外
      || [];
    setOnlineUsers(formattedUsers); // ここでのキャストは不要になるはず
  }
}, [currentUser, isClientLoaded]);

  // オンラインユーザーリストのリアルタイム更新
  useEffect(() => {
    if (!isClientLoaded || !currentUser) return; // currentUser を使用
  
    // fetchOnlineUsers は初回ロード時や、Realtimeで処理できない複雑な再同期が必要な場合のために残しておいても良い
    fetchOnlineUsers(); // 初回は全件取得
  
    const userStatusChannel = supabase
      .channel('public_user_statuses_realtime_channel_page') // 以前のチャンネル名
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_statuses' },
        async (payload) => { // ★★★ このコールバック関数を修正 ★★★  
          console.log('[User B DM Listener] INSIDE .on() CALLBACK. Payload received:', payload);
          const currentAuthUserId = currentUser.id;
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const changedUserStatus = payload.new as { user_id: string; is_online: boolean; last_active_at: string; /* 他のカラム */ };
            
            // 自分自身の変更は無視 (自分のオンライン状態は別途 updateOnlineStatus で管理しているため)
            if (changedUserStatus.user_id === currentAuthUserId) {
              return;
            }
  
            if (changedUserStatus.is_online) {
              
              // プロフィール情報を取得 (ペイロードにprofilesが含まれていないため)
              const { data: profileData, error: profileError } = await supabase
                .from('profiles')
                .select('nickname, age, residence, bio')
                .eq('user_id', changedUserStatus.user_id)
                .single();
  
              if (profileError) {
                // プロフィールが取れなくても、IDだけでリストに追加/更新することも可能 (表示は名無しになる)
                // あるいは、プロフィールが取れないユーザーはリストに表示しない、という選択も
              }
  
              const userForList: UserWithProfile = {
                id: changedUserStatus.user_id,
                last_active_at: changedUserStatus.last_active_at,
                profiles: profileData as Profile | null // Profile型にキャスト
              };
  
              setOnlineUsers(prevUsers => {
                const userExists = prevUsers.some(user => user.id === userForList.id);
                if (userExists) {
                  // 既存ユーザーの情報を更新
                  return prevUsers.map(user => 
                    user.id === userForList.id ? userForList : user
                  );
                } else {
                  // 新規ユーザーを追加
                  return [...prevUsers, userForList];
                }
              });
  
            } else {
              // --- ユーザーがオフラインになった ---
              setOnlineUsers(prevUsers => 
                prevUsers.filter(user => user.id !== changedUserStatus.user_id)
              );
            }
  
          } else if (payload.eventType === 'DELETE') {
            // --- user_statuses から行が削除された ---
            const deletedUserStatus = payload.old as { user_id: string; /* 他のカラム */ };
            if (deletedUserStatus && deletedUserStatus.user_id !== currentAuthUserId) {
              setOnlineUsers(prevUsers =>
                prevUsers.filter(user => user.id !== deletedUserStatus.user_id)
              );
            }
          }
          // ★★★ fetchOnlineUsers(); // ← これを削除またはコメントアウト ★★★
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') console.log('Subscribed to user_statuses changes on HomePage!');
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.error('User status channel (HomePage) error:', err);
      });
    return () => { supabase.removeChannel(userStatusChannel); };
  }, [isClientLoaded, currentUser, fetchOnlineUsers]);

  // DMリクエスト受信リスナー (ユーザーB側、または一般のユーザーがリクエストを受ける側)
  useEffect(() => {
    const userIdForEffect = currentUser?.id;
    if (!isClientLoaded) { return; }
    if (!userIdForEffect) { return; }
    
    const requestsChannel = supabase
      .channel(`public_chat_requests_for_${userIdForEffect}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_requests', // このフィルターは設定されている
          filter: `receiver_id=eq.${userIdForEffect}`
        },
        async (payload) => {
          console.log('[User B DM Listener] INSIDE .on() CALLBACK. Payload received:', payload);
          
          // ★★★★★ ここから追加 ★★★★★
          // 念のため、本当に chat_requests テーブルの INSERT イベントかを確認
          if (payload.table !== 'chat_requests' || payload.eventType !== 'INSERT') {
            console.log('[User B DM Listener] Ignoring event: Not a chat_requests INSERT.', payload);
            return; 
          }
          // ★★★★★ ここまで追加 ★★★★★
  
          const newRequest = payload.new as ChatRequest; 
  
          console.log(
            '[User B DM Listener] Checking guards. currentUser.id:', currentUser?.id,
            'newRequest.receiver_id:', newRequest.receiver_id,
            'newRequest.status:', newRequest.status
          );
  
          if (!currentUser || newRequest.receiver_id !== currentUser.id || newRequest.status !== 'pending') {
            console.log('[User B DM Listener] Request ignored by guards (not for me, or not pending, or no currentUser).');
            return;
          }
          console.log('[User B DM Listener] Guards passed. Proceeding to fetch sender profile.');
  
          const { data: senderProfile, error: profileFetchError } = await supabase
            .from('profiles')
            .select('nickname')
            .eq('user_id', newRequest.sender_id)
            .single();
  
          let senderNickname = '名無しさん';
          if (profileFetchError && profileFetchError.code !== 'PGRST116') { 
            console.error('[User B DM Listener] Error fetching sender profile (and not PGRST116):', profileFetchError);
          } else if (senderProfile) {
            senderNickname = senderProfile.nickname || '名無しさん';
          }
          
          console.log(`[User B DM Listener] About to open modal for request ID: ${newRequest.id} from sender: ${senderNickname}`);
          
          setProcessingRequest(newRequest);
          setModalSenderNickname(senderNickname);
          setIsRequestModalOpen(true);
  
          console.log('[User B DM Listener] setIsRequestModalOpen(true) CALLED. isRequestModalOpen should become true.');
        }
      )
      .subscribe((status, err) => { console.log(`[DM Request Listener FOR ${userIdForEffect}] Channel status: ${status}`, err || ''); });
    return () => { if (requestsChannel) { console.log(`[DM Request Listener FOR ${userIdForEffect}] CLEANUP: Removing channel.`); supabase.removeChannel(requestsChannel); }};
  }, [currentUser?.id, isClientLoaded, router]);


  // ユーザーAが送信したリクエストの応答を待つためのuseEffectフック

useEffect(() => {
  const effectId = Math.random().toString(36).substring(2, 7); // 各実行を識別するID

  if (!waitingForRequestId || !currentUser?.id) { // currentUser?.id もチェック
    return;
  }

  const currentWaitingRequestId = waitingForRequestId;
  const currentWaitingRoomId = waitingForRoomId;
  const currentWaitingTargetNickname = waitingForTargetNickname;
  const currentUserIdForChannel = currentUser.id; // チャンネル名用にIDを保持  
  const requestStatusChannel = supabase
    .channel(`user_a_awaits_request_${currentWaitingRequestId}_${currentUserIdForChannel}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'chat_requests',
        filter: `id=eq.${currentWaitingRequestId}`,
      },
      (payload) => {
        const updatedRequest = payload.new as ChatRequest;      
        if (updatedRequest.id === currentWaitingRequestId) {
          if (updatedRequest.status === 'accepted') {
            console.log('[User A Response Listener] Status is "accepted". Preparing to show accepted modal.');
        
            // ★★★ alert と router.push を削除し、モーダル表示ステートを更新 ★★★
            // alert(`${currentWaitingTargetNickname || '相手'}がお誘いを受けてくれました。チャット画面へ移動します。`);
            // if (currentWaitingRoomId) {
            //   router.push(`/chat/${currentWaitingRoomId}`);
            // }
            setIsRequestAcceptedModalOpen(true); // ★ 新しいモーダルを開く
            // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
        
            // 待機状態のリセットとチャンネル解除はモーダルを閉じた後に行うのが良いでしょう
            // setWaitingForRequestId(null);
            // setWaitingForRoomId(null);
            // setWaitingForTargetNickname(null);
            // supabase.removeChannel(requestStatusChannel);
          } else if (updatedRequest.status === 'rejected') {
            // 拒否された場合の処理 (これは以前のトースト通知のままでも良いでしょう)
            toast(`${currentWaitingTargetNickname || '相手'}にリクエストを拒否されました。`);
            setWaitingForRequestId(null);
            setWaitingForRoomId(null);
            setWaitingForTargetNickname(null);
            if (requestStatusChannel) supabase.removeChannel(requestStatusChannel);
          }
        }
      }
    )
    .subscribe((status, err) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {

      }
    });

  return () => {
    supabase.removeChannel(requestStatusChannel);
  };
}, [waitingForRequestId, currentUser?.id, router, waitingForRoomId, waitingForTargetNickname]); // 依存配列


  // handleInitiateChat 関数 (ユーザーAが応答待ちするバージョン)
  const handleInitiateChat = async (targetUserId: string) => {
    const callTimestamp = new Date().toISOString();
    if (initiatingChatWith === targetUserId || initiatingChatWith === "ANY_USER_PENDING") {
      return;
    }
    setIsInitiatingChatWith(targetUserId);

    try {
      if (!currentUser || !targetUserId) { toast.error('認証されていないか、相手のユーザーIDが不明です。'); return; }
      const currentUserId = currentUser.id;
      if (currentUserId === targetUserId) { toast.error('自分自身に話しかけることはできません。'); return; }
      const user1 = currentUserId < targetUserId ? currentUserId : targetUserId;
      const user2 = currentUserId < targetUserId ? targetUserId : currentUserId;
      const targetUserProfile = onlineUsers.find(u => u.id === targetUserId)?.profiles;
      const targetUserNickname = targetUserProfile?.nickname || '相手';

      const { data: existingRoom, error: roomError } = await supabase.from('chat_rooms').select('id').eq('user1_id', user1).eq('user2_id', user2).single();
      if (roomError && roomError.code !== 'PGRST116') { console.error(`[handleInitiateChat ERROR - ${callTimestamp}] Checking room:`, roomError); toast.error('チャットルームの確認中に予期せぬエラーが発生しました。'); return; }

      let chatRoomIdToWaitFor: string | null = null;
      let newlyCreatedChatRequestId: string | null = null;

      if (existingRoom) {
        chatRoomIdToWaitFor = existingRoom.id;
        const { data: newJoinRequestData, error: joinRequestError } = await supabase.from('chat_requests').insert({ sender_id: currentUserId, receiver_id: targetUserId, room_id: chatRoomIdToWaitFor, status: 'pending' }).select('id').single();
        if (joinRequestError || !newJoinRequestData) { console.error(`[handleInitiateChat ERROR - ${callTimestamp}] Creating join request:`, joinRequestError || 'No data from join request insert'); toast.error(`既存チャットへの参加リクエスト送信に失敗: ${joinRequestError?.message || 'データなし'}`); return; }
        newlyCreatedChatRequestId = newJoinRequestData.id;
      } else {
        const { data: newRoomData, error: createRoomError } = await supabase.from('chat_rooms').insert({ user1_id: user1, user2_id: user2 }).select('id').single();
        if (createRoomError || !newRoomData) { console.error(`[handleInitiateChat ERROR - ${callTimestamp}] Creating new room:`, createRoomError || 'No data from new room insert'); toast.error(`チャットルームの作成に失敗: ${createRoomError?.message || 'データなし'}`); return; }
        chatRoomIdToWaitFor = newRoomData.id;
        const { data: newChatRequestData, error: initialRequestError } = await supabase.from('chat_requests').insert({ sender_id: currentUserId, receiver_id: targetUserId, room_id: chatRoomIdToWaitFor, status: 'pending' }).select('id').single();
        if (initialRequestError || !newChatRequestData) { console.error(`[handleInitiateChat ERROR - ${callTimestamp}] Creating initial request:`, initialRequestError || 'No data from initial request insert'); toast.error(`チャットリクエストの送信に失敗: ${initialRequestError?.message || 'データなし'}`); return; }
        newlyCreatedChatRequestId = newChatRequestData.id;
      }

      if (newlyCreatedChatRequestId && chatRoomIdToWaitFor) {
        setWaitingForRequestId(newlyCreatedChatRequestId);
        setWaitingForRoomId(chatRoomIdToWaitFor);
        setWaitingForTargetNickname(targetUserNickname);
        
      } else { console.error(`[handleInitiateChat ERROR - ${callTimestamp}] Missing request ID or room ID for waiting state.`); toast.error('リクエスト処理でエラーが発生し、待機状態にできませんでした。'); }
    } catch (e: any) { console.error(`[handleInitiateChat CATCH - ${callTimestamp}] Exception:`, e); toast.error(`チャット開始処理で予期せぬエラー: ${e.message}`);
    } finally { setIsInitiatingChatWith(null); }
  };

  const handleChatRequestResponse = async (accepted: boolean) => {
    // モーダルを閉じる処理は、この関数の呼び出し元 (ChatRequestModalのonClose) で
    // setIsRequestModalOpen(false) を呼ぶか、この関数の最初で行う
    // ここでは、呼び出し元でモーダルが閉じられることを期待しつつ、
    // 念のためここでもステートをリセットする前にモーダルを閉じるようにする
    setIsRequestModalOpen(false); 
  
    if (!processingRequest || !currentUser) {
      console.warn('[HomePage] handleChatRequestResponse called without processingRequest or currentUser.');
      setProcessingRequest(null); // 念のためクリア
      setModalSenderNickname(''); // 念のためクリア
      return;
    }
    
    setIsAcceptingOrRejecting(true); // 処理中フラグを立てる
    const requestId = processingRequest.id;
    const roomId = processingRequest.room_id;
    const senderNickname = modalSenderNickname; // 閉じる前に保持 (または processingRequest から再取得)
  
    if (accepted) {
      console.log(`[HomePage] User accepted request ID: ${requestId}`);
      const { error: updateError } = await supabase
        .from('chat_requests')
        .update({ status: 'accepted' })
        .eq('id', requestId);
  
      if (updateError) {
        console.error('[HomePage] Error accepting chat request via modal:', updateError);
        toast.error('リクエストの承諾処理に失敗しました。');
      } else {
        toast.success(`${senderNickname}さんからのチャットリクエストを承諾しました！`);
        router.push(`/chat/${roomId}`);
      }
    } else { // 拒否した場合
      console.log(`[HomePage] User rejected request ID: ${requestId}`);
      const { error: updateError } = await supabase
        .from('chat_requests')
        .update({ status: 'rejected' })
        .eq('id', requestId);
      if (updateError) {
        console.error('[HomePage] Error rejecting chat request via modal:', updateError);
        toast.error('リクエストの拒否処理に失敗しました。');
      } else {
        toast(`${senderNickname}さんからのチャットリクエストを拒否しました。`);
      }
    }
    
    // 処理が終わったら関連ステートをクリア
    setProcessingRequest(null);
    setModalSenderNickname('');
    setIsAcceptingOrRejecting(false); // 処理中フラグを解除
  };
  const handleRequestAcceptedModalClose = () => {
    setIsRequestAcceptedModalOpen(false); // モーダルを閉じる
    
    if (waitingForRoomId) {
      console.log(`[HomePage] RequestAcceptedModal closed. Navigating to /chat/${waitingForRoomId}`);
      router.push(`/chat/${waitingForRoomId}`);
    } else {
      console.error('[HomePage] RequestAcceptedModal closed, but waitingForRoomId is null. Cannot navigate.');
      toast.error('チャットルーム情報が見つからず、移動できませんでした。');
    }
    
    // 待機状態をリセット
    setWaitingForRequestId(null);
    setWaitingForRoomId(null);
    setWaitingForTargetNickname(null);
    
    // 関連するリアルタイムチャンネルの購読解除は、
    // 「応答待ちリスナーuseEffect」のクリーンアップ関数に任せるか、
    // あるいは waitingForRequestId が null になったことで useEffect が再実行され、
    // 前のチャンネルがクリーンアップされるので、ここで明示的に解除しなくても良い場合が多いです。
    // もし確実にここで解除したい場合は、チャンネルインスタンスをrefで保持するなどの工夫が必要です。
  };
  // JSXのレンダリング  
  if (!isClientLoaded || loading) { return (<div className="min-h-screen flex items-center justify-center bg-gray-50"><p className="text-xl font-semibold text-gray-700">読み込み中...</p></div>); }
  if (!currentUser && isClientLoaded) { return (<div className="min-h-screen flex items-center justify-center bg-gray-50"><p className="text-xl font-semibold text-gray-700">ログインしていません。リダイレクト中...</p></div>); }
  if (!currentUser) { return (<div className="min-h-screen flex items-center justify-center bg-gray-50"><p className="text-xl font-semibold text-gray-700">ユーザー情報を読み込み中...</p></div>); }

  return (
    <div className="min-h-screen bg-[#F0EAD6] flex flex-col items-center pt-10 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute inset-0 bg-cover bg-center opacity-60" style={{ backgroundImage: "url('/cafe-bg.jpg')" }}></div>
      <div className="absolute inset-0 bg-gradient-to-t from-[#D8C7A0]/70 via-[#F0EAD6]/50 to-transparent"></div>
      {/* チャットリクエスト受信モーダル */}
    {processingRequest && currentUser && isRequestModalOpen && ( // ★ isRequestModalOpen も条件に追加
      <ChatRequestModal 
        isOpen={isRequestModalOpen} // ここは常に isRequestModalOpen を渡す
        onClose={handleChatRequestResponse}
        senderNickname={modalSenderNickname}
        isLoading={isAcceptingOrRejecting}
      />
    )}
    {/* チャットリクエスト承諾通知モーダル (ユーザーA用) */}
  {currentUser && ( // currentUser がいる場合のみ表示を考慮
    <RequestAcceptedModal
      isOpen={isRequestAcceptedModalOpen} // ★ 新しいステートを使用
      onClose={handleRequestAcceptedModalClose} // ★ 新しいクローズ処理関数
      accepterNickname={waitingForTargetNickname || '相手'} // 待機中の相手ニックネームを使用
    />
  )}
      {/* ヘッダー部、メニューボタン等 */}
      <header className="z-20 w-full max-w-6xl mx-auto mb-10 sm:mb-12 flex justify-between items-center p-4 rounded-2xl transition-all duration-300 hover:bg-white/10 hover:shadow-xl"> {/* ★ 背景をほぼ透明に、ホバーで少し白く */}
        <h1 
          className="text-4xl sm:text-5xl font-bold text-white tracking-tight cursor-pointer 
                     [text-shadow:_2px_2px_4px_rgb(0_0_0_/_0.5)] hover:[text-shadow:_2px_2px_6px_rgb(0_0_0_/_0.7)]" // ★ テキスト色を白に、強めのドロップシャドウ
          onClick={() => router.push('/')}
        >
          Momentos Cafe
        </h1>
        <div className="relative"> {/* ドロップダウンのために relative を指定 */}
        <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="p-2 rounded-full text-white hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-white/50 transition-colors"
            aria-label="メニューを開く"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
            </svg>
          </button>

          {/* ドロップダウンメニュー */}
          {isMenuOpen && (
            <div 
              className="absolute right-0 mt-2 w-60 origin-top-right bg-white rounded-xl shadow-2xl ring-1 ring-black ring-opacity-5 focus:outline-none py-2 z-30"
              role="menu"
              aria-orientation="vertical"
              aria-labelledby="menu-button"
            >
              <button // プロフィール
                onClick={() => {
                  router.push('/profile');
                  setIsMenuOpen(false); // メニューを閉じる
                }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 flex items-center"
                role="menuitem"
              >
                {/* アイコン例 */}
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
                プロフィール
              </button>
              <button // チャット履歴 (プレースホルダー)
                onClick={() => {
                  router.push('/chat-history');
                  setIsMenuOpen(false);
                }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 flex items-center"
                role="menuitem"
              >
                 {/* アイコン例 */}
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                </svg>
                チャット履歴
              </button>
              <button // 設定 (プレースホルダー)
                onClick={() => {
                  // router.push('/settings'); // TODO: 設定ページができたら有効化
                  alert('設定機能は準備中です。');
                  setIsMenuOpen(false);
                }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 flex items-center"
                role="menuitem"
              >
                {/* アイコン例 */}
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.646.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 1.255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.333.183-.582.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.759 6.759 0 010-1.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.75.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                設定
              </button>
              <div className="border-t border-gray-200 my-1"></div> {/* 区切り線 */}
              <button // ログアウト
  onClick={async () => {
    setIsMenuOpen(false); // メニューを閉じる (もしメニューコンポーネントのステートなら)

    if (currentUser) { // currentUser が存在する場合のみ実行
      try {
        // ★★★ 最初に is_online: false と last_active_at を更新し、完了を待つ ★★★
        await supabase
          .from('user_statuses')
          .upsert({ 
            user_id: currentUser.id, 
            is_online: false, 
            last_active_at: new Date().toISOString() 
          }, { onConflict: 'user_id' });
      } catch (statusError) {
        // このエラーはログに出力するが、ログアウト処理自体は続行する
      }
    }

    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      toast.error(`ログアウトに失敗しました: ${signOutError.message}`);
    }
    // onAuthStateChange が /auth/login へのリダイレクトを処理するはず
    // もしリダイレクトが遅い場合は、ここで router.push('/auth/login'); を呼んでもよい
  }}
  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 hover:text-red-700 flex items-center"
  role="menuitem"
>
  {/* アイコン */}
  ログアウト
</button>
            </div>
          )}
        </div>
      </header>
      
      {/* キャッチコピーエリア */}
      <div className="z-10 mb-10 sm:mb-16 max-w-3xl mx-auto"> {/* 外側のコンテナ */}
        <div className="bg-white/30 backdrop-blur-lg p-6 sm:p-8 rounded-2xl shadow-xl border border-white/20"> {/* ガラス風カード */}
          <p className="text-xl sm:text-2xl text-center leading-relaxed text-[#4A3B31] font-medium [text-shadow:_0_1px_2px_rgb(255_255_255_/_0.7)]">
            オンラインのカフェでちょっと一息。
            <br /> {/* 任意で改行 */}
            気になるあの人に、声をかけてみませんか？
          </p>
        </div>
      </div>

      {/* ★★★ この <main> タグから下の部分を置き換えてください ★★★ */}
            {/* ★★★ この <main> タグから下の部分を置き換えてください ★★★ */}
             {/* ★★★ この <main> タグから下の部分を置き換えてください ★★★ */}
      <main className="z-10 w-full max-w-4xl px-2 sm:px-0 flex flex-col items-center space-y-6">
        <div className="w-full flex justify-between items-center px-2">
          <h2 className="text-2xl sm:text-3xl font-semibold text-[#6F4E37]">現在の空席</h2>
        </div>
        <p className="text-sm text-gray-700 -mt-4 mb-4">オンラインで話せる相手を探しています</p>

        {/* 応答待ちUI */}
        {isClientLoaded && waitingForRequestId && (
          <div className="w-full p-3 my-2 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 rounded-md shadow-sm">
            <p className="font-semibold text-sm">{waitingForTargetNickname || '相手'}さんの応答を待っています...</p>
          </div>
        )}

        {/* オンラインユーザーリストの表示 */}
        <div className="w-full">
          {isClientLoaded && !loading && onlineUsers.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {onlineUsers.map((user) => (
                user.id === currentUser?.id ? null : ( 
                  <div 
                    key={user.id} 
                    className="bg-white/80 backdrop-blur-md rounded-xl shadow-lg p-4 transition-all duration-300 hover:shadow-xl flex flex-col" 
                  >
                    <div> {/* カード上部のコンテンツエリア */}
                      <div className="flex items-center mb-3"> {/* アバターとニックネーム・オンライン状態エリア */}
                        <div className="w-12 h-12 rounded-full mr-3 bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center text-gray-600 text-xl font-semibold shadow-sm shrink-0">
                          {user.profiles?.nickname ? user.profiles.nickname.charAt(0).toUpperCase() : '?'}
                        </div>
                        <div className="flex-grow overflow-hidden">
                          {/* ★ ニックネームとオンライン状態を同じ行に配置 ★ */}
                          <div className="flex justify-between items-center">
                            <p className="text-lg font-semibold text-gray-800 truncate">{user.profiles?.nickname || '名無しさん'}</p>
                            <p className="text-xs text-green-600 font-medium flex items-center shrink-0">
                              <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1 inline-block animate-pulse"></span>
                              オンライン
                            </p>
                          </div>
                          {/* ★ 年齢・居住地はニックネームの下に ★ */}
                          <p className="text-xs text-gray-500 truncate mt-0.5"> {/* mt-0.5 で少し上に詰める */}
                            {user.profiles?.age ? `${user.profiles.age}歳` : ''}
                            {user.profiles?.age && user.profiles?.residence ? ' / ' : ''}
                            {user.profiles?.residence || (user.profiles?.age ? '' : '情報未設定')}
                          </p>
                        </div>
                      </div>
                      {/* 自己紹介文 */}
                      <div className="text-xs text-gray-600 mb-3 border-t border-gray-200 pt-2 mt-2">
                        <p className="h-10 overflow-hidden line-clamp-2"> {/* 自己紹介は2行まで */}
                          {user.profiles?.bio || '自己紹介はありません。'}
                        </p>
                      </div>
                    </div>
                    {/* 「話しかける」ボタン (カード下部に配置) */}
                    <button
                      onClick={() => !initiatingChatWith && handleInitiateChat(user.id)}
                      disabled={!!initiatingChatWith}
                      className={`w-full mt-auto px-3 py-2 text-sm bg-[#A0522D] text-white font-semibold rounded-md shadow hover:bg-[#8B4513] transition duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#6F4E37] ${initiatingChatWith ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      話しかける
                    </button>
                  </div>
                )
              ))}
            </div>
          ) : (
             isClientLoaded && !loading && onlineUsers.length === 0 ? (
                <div className="w-full text-center py-12 bg-white/70 backdrop-blur-sm rounded-xl shadow-md">
                  <p className="text-5xl mb-3">☕</p>
                  <p className="text-gray-600 text-md">現在、空席はありません。</p>
                  <p className="text-gray-500 text-xs mt-1">少し待ってから再度ご確認ください。</p>
                </div>
            ) : ( 
                <div className="w-full text-center py-12">
                  <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-t-2 border-[#6F4E37]"></div>
                  <p className="text-gray-500 text-md mt-3">情報を読み込み中...</p>
                </div>
            )
          )}
        </div>
      </main>
      
      <footer className="z-10 mt-12 text-center text-sm text-[#6F4E37]/80">
        <p>&copy; {new Date().getFullYear()} Momentos Cafe. All rights reserved.</p>
      </footer>
    </div>
  );
}