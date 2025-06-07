// app/page.tsx
'use client';

import { useEffect, useState, useCallback, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Session, User } from '@supabase/supabase-js';
import toast, { Toaster } from 'react-hot-toast';
//import Image from 'next/image'; // Next.js Imageコンポーネント
import { Transition } from '@headlessui/react'; // ★★★ この行を追加 ★★★

// あなたの型定義ファイルからインポート (パスは実際の場所に合わせてください)
import { Profile, UserWithProfile, ChatRequest } from '../lib/types'; 

// モーダルコンポーネントのインポート (パスは実際の場所に合わせてください)
import ChatRequestModal from './components/ChatRequestModal';
import RequestAcceptedModal from './components/RequestAcceptedModal';

export default function HomePage() {
  const router = useRouter();
  const [isClientLoaded, setIsClientLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // session ステートは currentUser の設定に使われるため、ESLintの警告を無視するか、
  // 意図的に console.log(session) などで使うことで回避も可能
  // eslint-disable-next-line @typescript-eslint/no-unused-vars 
  const [session, setSession] = useState<Session | null>(null); 
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  const [onlineUsers, setOnlineUsers] = useState<UserWithProfile[]>([]);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [chatMode, setChatMode] = useState<'online' | 'offline'>('online'); // デフォルトはオンライン
  const [initiatingChatWith, setInitiatingChatWith] = useState<string | null>(null);
  const [waitingForRequestId, setWaitingForRequestId] = useState<string | null>(null);
  const [waitingForRoomId, setWaitingForRoomId] = useState<string | null>(null);
  const [waitingForTargetNickname, setWaitingForTargetNickname] = useState<string | null>(null);
  
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [processingRequest, setProcessingRequest] = useState<ChatRequest | null>(null);
  const [modalSenderNickname, setModalSenderNickname] = useState<string>('');
  const [isAcceptingOrRejecting, setIsAcceptingOrRejecting] = useState(false);

  const [isRequestAcceptedModalOpen, setIsRequestAcceptedModalOpen] = useState(false);
  const [hasMounted, setHasMounted] = useState(false); // ★★★ この行を追加 ★★★
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
        router.push('/auth/login'); setLoading(false); return;
      }
      setSession(currentSessionObj); 
      const userToSet = currentSessionObj.user;
      setCurrentUser(userToSet);

      // profileData は直接使わないので、エラーチェックのみに
      const { error: profileError } = await supabase.from('profiles').select('user_id', { count: 'exact', head: true }).eq('user_id', userToSet.id);
      if (profileError && profileError.code === 'PGRST116') { // count が0の場合など
        router.push('/profile'); setLoading(false); return;
      } else if (profileError) { 
        console.error('Error checking profile:', profileError); 
      }
      setLoading(false);
    }
    checkUserAndProfile();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession); 
      // oldUserId は未使用なので削除
      setCurrentUser(newSession?.user ?? null);
      if (!newSession) router.push('/auth/login');
    });
    return () => { authListener?.subscription?.unsubscribe(); };
  }, [router, isClientLoaded]);

  useEffect(() => {
    setHasMounted(true); // ★★★ この useEffect を追加 ★★★
  }, []); // 空の依存配列なので、クライアントでの初回マウント時に一度だけ実行される

// オンラインユーザーの取得
const fetchOnlineUsers = useCallback(async () => {
  if (!currentUser || !isClientLoaded) return;
  const oneMinuteAgoISO = new Date(Date.now() - 60 * 1000).toISOString(); // ★ 変数名変更し使用
  const { data, error } = await supabase.from('user_statuses')
    .select('user_id, last_active_at, profiles(nickname, age, residence, bio)')
    .eq('is_online', true)
    .gte('last_active_at', oneMinuteAgoISO); // ★ 修正した変数名を使用

  if (error) { console.error('Error fetching online users:', error); setOnlineUsers([]); }
  else {
    const currentAuthUserId = currentUser.id;
    const formattedUsers = data?.map(u => {
      const profileData = (Array.isArray(u.profiles) && u.profiles.length > 0) ? u.profiles[0] : (Array.isArray(u.profiles) ? null : u.profiles);
      return { id: u.user_id, last_active_at: u.last_active_at, profiles: profileData as Profile | null };
    }).filter(u => u.id !== currentAuthUserId && u.profiles !== null) || [];
    setOnlineUsers(formattedUsers);
  }
}, [currentUser, isClientLoaded]); // ★ useCallbackの依存配列

// オンラインユーザーリストのリアルタイム更新
useEffect(() => {
  if (!isClientLoaded || !currentUser) return;
  fetchOnlineUsers();
  const userStatusChannel = supabase.channel('public_user_statuses_realtime_page_v_linted')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'user_statuses' }, 
      () => fetchOnlineUsers() // payload は直接使わないので受け取らない
    )
    .subscribe();
  return () => { supabase.removeChannel(userStatusChannel); };
}, [isClientLoaded, currentUser, fetchOnlineUsers]); // ★ fetchOnlineUsers を依存配列に追加

// DMリクエスト受信リスナー
// Warning: React Hook useEffect has a missing dependency: 'currentUser?.id'.
// 対処: currentUser?.id を依存配列に追加、または currentUser を使用する箇所で ?. を徹底
useEffect(() => {
  const userIdForEffect = currentUser?.id;
  if (!isClientLoaded || !userIdForEffect) return;
  
  const requestsChannel = supabase.channel(`public_chat_requests_for_${userIdForEffect}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_requests', filter: `receiver_id=eq.${userIdForEffect}`},
      async (payload) => {
        if (payload.table !== 'chat_requests' || payload.eventType !== 'INSERT') return; 
        const newRequest = payload.new as ChatRequest;
        if (!currentUser || newRequest.receiver_id !== currentUser.id || newRequest.status !== 'pending') return;
        const { data: senderProfile, error: profileFetchError } = await supabase.from('profiles').select('nickname').eq('user_id', newRequest.sender_id).single();
        let senderNickname = '名無しさん';
        if (profileFetchError && profileFetchError.code !== 'PGRST116') { console.error('Error fetching sender profile:', profileFetchError); }
        else if (senderProfile) { senderNickname = senderProfile.nickname || '名無しさん'; }
        setProcessingRequest(newRequest); setModalSenderNickname(senderNickname); setIsRequestModalOpen(true);
      }
    )
    .subscribe();
  return () => { if (requestsChannel) supabase.removeChannel(requestsChannel); };
}, [currentUser, isClientLoaded, router]); // ★ currentUser?.id を currentUser に変更
// ユーザーAが送信したリクエストの応答を待つためのuseEffectフック
// Warning: React Hook useEffect has a missing dependency: 'currentUser'.
// 対処: currentUser を依存配列に追加するか、currentUser?.id にする
// Error: 'currentWaitingRoomId' is assigned a value but never used. -> ログ出力または使用
useEffect(() => {
  // effectId は未使用なので削除
  if (!waitingForRequestId || !currentUser?.id) return; // ★ currentUser?.id でチェック
  const currentWaitingRequestId = waitingForRequestId;
  const currentWaitingRoomIdValue = waitingForRoomId; // ★ 使用するために変数名変更
  const currentWaitingTargetNickname = waitingForTargetNickname;
  const userIdForChannel = currentUser.id;

  console.log(`[User A Response Listener] Now waiting for request ID: ${currentWaitingRequestId}, Room ID: ${currentWaitingRoomIdValue}`); // ★ Room IDもログに出力
  
  const requestStatusChannel = supabase.channel(`user_a_awaits_request_${currentWaitingRequestId}_${userIdForChannel}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_requests', filter: `id=eq.${currentWaitingRequestId}`},
      (payload) => {
        const updatedRequest = payload.new as ChatRequest;
        if (updatedRequest.id === currentWaitingRequestId) {
          if (updatedRequest.status === 'accepted') {
            setIsRequestAcceptedModalOpen(true);
          } else if (updatedRequest.status === 'rejected') {
            toast(`${currentWaitingTargetNickname || '相手'}にリクエストを拒否されました。`);
            setWaitingForRequestId(null); setWaitingForRoomId(null); setWaitingForTargetNickname(null);
            if (requestStatusChannel) supabase.removeChannel(requestStatusChannel);
          }
        }
      }
    )
    .subscribe((status, subscribeError) => { // ★ err 変数名変更
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        console.error(`User A Resp Listener Channel error for request ID ${currentWaitingRequestId}: ${status}`, subscribeError); // ★ subscribeError を使用
        setWaitingForRequestId(null); setWaitingForRoomId(null); setWaitingForTargetNickname(null);
      }
    });
  return () => { supabase.removeChannel(requestStatusChannel); };
}, [waitingForRequestId, currentUser?.id, router, waitingForRoomId, waitingForTargetNickname]); // ★ currentUser?.id を使用
// app/page.tsx 内の handleInitiateChat 関数

const handleInitiateChat = async (targetUserId: string) => {
  // callTimestamp を宣言 (これが177行目あたりだと仮定)
  const callTimestamp = new Date().toISOString(); 
  
  // ★ callTimestamp をログで使用する
  console.log(`[handleInitiateChat START - ${callTimestamp}] Called with targetUserId:`, targetUserId);

  // 二重実行防止ガード (initiatingChatWith と setInitiatingChatWith は正しく宣言されている前提)
  if (initiatingChatWith === targetUserId || initiatingChatWith === "ANY_USER_PENDING") {
    console.log(`[handleInitiateChat IGNORED - ${callTimestamp}] Chat initiation already in progress for ${initiatingChatWith}.`);
    return;
  }
  setInitiatingChatWith(targetUserId);

  try {
    if (!currentUser || !targetUserId) {
      toast.error('認証エラーまたは相手不明');
      return; // finallyブロックで initiatingChatWith はリセットされます
    }
    const currentUserId = currentUser.id;
    if (currentUserId === targetUserId) {
      toast.error('自分自身には話しかけられません。');
      return; // finallyブロックで initiatingChatWith はリセットされます
    }

    const user1 = currentUserId < targetUserId ? currentUserId : targetUserId;
    const user2 = currentUserId < targetUserId ? targetUserId : currentUserId;
    const targetUserProfile = onlineUsers.find(u => u.id === targetUserId)?.profiles;
    const targetUserNickname = targetUserProfile?.nickname || '相手';

    // ★ callTimestamp をログで使用する
    console.log(`[handleInitiateChat LOGIC START - ${callTimestamp}] User1: ${user1}, User2: ${user2}, TargetNickname: ${targetUserNickname}`);
    
    const { data: existingRoom, error: roomError } = await supabase
      .from('chat_rooms')
      .select('id')
      .eq('user1_id', user1)
      .eq('user2_id', user2)
      .single();

    // ★ callTimestamp をログで使用する
    console.log(`[handleInitiateChat LOGIC - ${callTimestamp}] existingRoom:`, existingRoom, 'roomError:', roomError);
    if (roomError && roomError.code !== 'PGRST116') {
      console.error(`[handleInitiateChat ERROR - ${callTimestamp}] Checking room:`, roomError);
      toast.error('ルーム確認エラー');
      return; // finallyブロックで initiatingChatWith はリセットされます
    }

    let chatRoomIdToWaitFor: string | null = null;
    let newlyCreatedChatRequestId: string | null = null;

    if (existingRoom) {
      chatRoomIdToWaitFor = existingRoom.id;
      // ★ callTimestamp をログで使用する
      console.log(`[handleInitiateChat EXISTING_ROOM_PATH - ${callTimestamp}] Existing room found. ID: ${chatRoomIdToWaitFor}. Creating join request.`);
      const { data: newJoinRequestData, error: joinRequestError } = await supabase
        .from('chat_requests')
        .insert({ sender_id: currentUserId, receiver_id: targetUserId, room_id: chatRoomIdToWaitFor, status: 'pending' })
        .select('id')
        .single();
      if (joinRequestError || !newJoinRequestData) {
        console.error(`[handleInitiateChat ERROR - ${callTimestamp}] Creating join request:`, joinRequestError);
        toast.error('参加リクエスト送信失敗');
        return; // finallyブロックで initiatingChatWith はリセットされます
      }
      newlyCreatedChatRequestId = newJoinRequestData.id;
      // ★ callTimestamp をログで使用する
      console.log(`[handleInitiateChat EXISTING_ROOM_PATH - ${callTimestamp}] Join request created. ID: ${newlyCreatedChatRequestId}`);
    } else {
      // ★ callTimestamp をログで使用する
      console.log(`[handleInitiateChat NEW_ROOM_PATH - ${callTimestamp}] No existing room. Creating new room and request.`);
      const { data: newRoomData, error: createRoomError } = await supabase
        .from('chat_rooms')
        .insert({ user1_id: user1, user2_id: user2 })
        .select('id')
        .single();
      if (createRoomError || !newRoomData) {
        console.error(`[handleInitiateChat ERROR - ${callTimestamp}] Creating new room:`, createRoomError);
        toast.error('ルーム作成失敗');
        return; // finallyブロックで initiatingChatWith はリセットされます
      }
      chatRoomIdToWaitFor = newRoomData.id;
      // ★ callTimestamp をログで使用する
      console.log(`[handleInitiateChat NEW_ROOM_PATH - ${callTimestamp}] New room created. ID: ${chatRoomIdToWaitFor}`);
      
      const { data: newChatRequestData, error: initialRequestError } = await supabase
        .from('chat_requests')
        .insert({ sender_id: currentUserId, receiver_id: targetUserId, room_id: chatRoomIdToWaitFor, status: 'pending' })
        .select('id')
        .single();
      if (initialRequestError || !newChatRequestData) {
        console.error(`[handleInitiateChat ERROR - ${callTimestamp}] Creating initial request:`, initialRequestError);
        toast.error('チャットリクエスト送信失敗');
        return; // finallyブロックで initiatingChatWith はリセットされます
      }
      newlyCreatedChatRequestId = newChatRequestData.id;
      // ★ callTimestamp をログで使用する
      console.log(`[handleInitiateChat NEW_ROOM_PATH - ${callTimestamp}] Initial request created. ID: ${newlyCreatedChatRequestId}`);
    }

    if (newlyCreatedChatRequestId && chatRoomIdToWaitFor) {
      setWaitingForRequestId(newlyCreatedChatRequestId);
      setWaitingForRoomId(chatRoomIdToWaitFor);
      setWaitingForTargetNickname(targetUserNickname);
      toast.success(`${targetUserNickname} にリクエストを送信しました。応答をお待ちください。`);
    } else {
      // ★ callTimestamp をログで使用する
      console.error(`[handleInitiateChat ERROR - ${callTimestamp}] Missing request ID or room ID for waiting state.`);
      toast.error('リクエスト処理エラー');
    }
  } catch (e: unknown) { // 型を unknown に
      let msg = 'チャット開始エラー';
      if (e instanceof Error) msg = `チャット開始エラー: ${e.message}`;
      toast.error(msg);
      // ★ callTimestamp をログで使用する (任意)
      console.error(`[handleInitiateChat CATCH - ${callTimestamp}] Exception:`, e);
  } finally {
    setInitiatingChatWith(null);
    // ★ callTimestamp をログで使用する
    console.log(`[handleInitiateChat FINALLY - ${callTimestamp}] Reset initiatingChatWith.`);
  }
};

// モーダルの結果を処理する関数
const handleChatRequestResponse = async (accepted: boolean) => {
  // ... (この関数内の error: any は Turn 287/289 のように unknown と型ガードで修正済みと仮定)
  setIsRequestModalOpen(false); 
  if (!processingRequest || !currentUser) { setProcessingRequest(null); setModalSenderNickname(''); return; }
  setIsAcceptingOrRejecting(true);
  const requestId = processingRequest.id, roomId = processingRequest.room_id, localModalSenderNickname = modalSenderNickname;
  if (accepted) {
    const { error: updateError } = await supabase.from('chat_requests').update({ status: 'accepted' }).eq('id', requestId);
    if (updateError) { toast.error('承諾処理失敗。'); }
    else { toast.success(`${localModalSenderNickname}からのリクエストを承諾！`); router.push(`/chat/${roomId}`); }
  } else {
    const { error: updateError } = await supabase.from('chat_requests').update({ status: 'rejected' }).eq('id', requestId);
    if (updateError) { toast.error('拒否処理失敗。'); }
    else { toast(`${localModalSenderNickname}からのリクエストを拒否。`); }
  }
  setProcessingRequest(null); setModalSenderNickname(''); setIsAcceptingOrRejecting(false);
};

// ユーザーAが承諾通知モーダルを閉じる処理
const handleRequestAcceptedModalClose = () => {
  setIsRequestAcceptedModalOpen(false);
  if (waitingForRoomId) router.push(`/chat/${waitingForRoomId}`);
  else toast.error('ルーム情報が見つかりません。');
  setWaitingForRequestId(null); setWaitingForRoomId(null); setWaitingForTargetNickname(null);
};
// --- JSXのレンダリングロジック ---
if (!isClientLoaded) { /* ... */ }
if (loading) { /* ... */ }
if (!currentUser) { /* ... */ }

// ... (コンポーネント内の既存のuseEffectや関数定義はそのまま)

// ... (コンポーネント内の既存のuseEffectや関数定義はそのまま)

return (
  <>
    <Toaster position="top-center" toastOptions={{className: 'text-sm rounded-md bg-white text-gray-800 shadow-lg'}} />
    
    {/* モーダルコンポーネントの呼び出し */}
    {processingRequest && currentUser && (
      <ChatRequestModal 
        isOpen={isRequestModalOpen}
        onClose={handleChatRequestResponse}
        senderNickname={modalSenderNickname}
        isLoading={isAcceptingOrRejecting}
      />
    )}
    {currentUser && isRequestAcceptedModalOpen && (
      <RequestAcceptedModal
        isOpen={isRequestAcceptedModalOpen}
        onClose={handleRequestAcceptedModalClose}
        accepterNickname={waitingForTargetNickname || '相手'}
      />
    )}

    {/* ★★★ ここからが新しいレイアウトとスタイリング ★★★ */}
    <div className="w-full min-h-screen bg-black">
      {/* 背景画像とオーバーレイ (画面に固定) */}
      <div 
          className="fixed inset-0 bg-cover bg-center opacity-90" // ★ opacity-10 から opacity-60 に変更
          style={{ backgroundImage: "url('/cafe-bg.jpg')" }}
        ></div>
        {/* ★ 黒のオーバーレイを、明るいクリーム系のグラデーションに変更 ★ */}
        <div className="fixed inset-0 bg-gradient-to-b from-white/30 via-[#F5F0E8]/20 to-[#F0EAD6]/50"></div> 
      
      {/* スクロールするコンテンツのコンテナ */}
      <div className="relative z-10 h-screen overflow-y-auto overflow-x-hidden">
        <div className="flex flex-col items-center min-h-full px-4">
          
       {/* ★★★ この <header> タグから下の部分を置き換えてください ★★★ */}
       <header className="z-20 w-full max-w-6xl mx-auto mb-10 sm:mb-12 flex justify-between items-center p-4">
        <h1 
          className="text-4xl sm:text-5xl font-bold text-white tracking-wider cursor-pointer [text-shadow:_2px_3px_5px_rgb(0_0_0_/_0.5)]"
          onClick={() => router.push('/')}
        >
          Momentos <span className="text-[#FFD700]">Café</span>
        </h1>
        <div className="relative">
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="p-2 rounded-full text-white/80 hover:text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black/50 focus:ring-white/50 transition-colors"
            aria-label="メニューを開く"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-7 h-7">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
            </svg>
          </button>

          {/* ★★★ ここからがメニューのデザイン変更部分 ★★★ */}
          <Transition
            show={isMenuOpen}
            as={Fragment} // React.Fragment を使用
            enter="transition ease-out duration-200"
            enterFrom="transform opacity-0 scale-95"
            enterTo="transform opacity-100 scale-100"
            leave="transition ease-in duration-150"
            leaveFrom="transform opacity-100 scale-100"
            leaveTo="transform opacity-0 scale-95"
          >
            <div 
              className="absolute right-0 mt-2 w-60 origin-top-right bg-white rounded-xl shadow-2xl ring-1 ring-black ring-opacity-5 focus:outline-none py-2 z-30"
              role="menu" aria-orientation="vertical" aria-labelledby="menu-button"
              onMouseLeave={() => setIsMenuOpen(false)} // マウスが離れたら閉じる（オプション）
            >
              {[
                { label: 'プロフィール', href: '/profile', icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 mr-3 text-gray-400"><path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.095a1.23 1.23 0 00.41-1.412A9.99 9.99 0 0010 12.75a9.99 9.99 0 00-6.535 1.743z" /></svg> },
                { label: 'チャット履歴', href: '/chat-history', icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 mr-3 text-gray-400"><path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10zm0 5.25a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z" clipRule="evenodd" /></svg> },
                { label: '設定', action: () => toast('設定機能は準備中です。', {icon: '⚙️'}), icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 mr-3 text-gray-400"><path fillRule="evenodd" d="M11.078 2.25c-.217-.065-.439-.1-.678-.1H9.6c-.24 0-.46.035-.678.1S8.573 2.573 8.373 2.738a4.5 4.5 0 00-2.638 2.638c-.166.2-.28.432-.347.678S5.25 6.401 5.25 6.64V9.6c0 .24.035.46.1.678s.18.421.347.678a4.5 4.5 0 002.638 2.638c.2.165.432.28.678.347s.401.1.64.1H10.4c.24 0 .46-.035.678-.1s.421-.18.678-.347a4.5 4.5 0 002.638-2.638c.165-.2.28-.432-.347-.678s.1-.401.1-.64V6.64c0-.24-.035-.46-.1-.678s-.18-.421-.347-.678a4.5 4.5 0 00-2.638-2.638c-.2-.165-.432-.28-.678-.347S10.64 2.25 10.4 2.25h-.801c-.24 0-.46.035-.678.1zM10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" clipRule="evenodd" /><path d="M10 6.5a.5.5 0 00-.5.5v3a.5.5 0 001 0v-3a.5.5 0 00-.5-.5z" /></svg> },
              ].map((item) => (
                <button key={item.label} onClick={() => { if (item.href) router.push(item.href); if (item.action) item.action(); setIsMenuOpen(false);}}
                  className="w-full text-left px-4 py-3 text-sm text-gray-800 hover:bg-gray-100 hover:text-gray-900 flex items-center transition-colors rounded-lg" // ★ 角丸とパディング調整
                  role="menuitem">
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
              <div className="border-t border-gray-200 mx-2 my-1"></div> {/* ★ 区切り線 */}
              <button 
                onClick={async () => { /* ... (既存のログアウト処理) ... */ }}
                className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 hover:text-red-700 flex items-center transition-colors rounded-lg" // ★ 角丸とパディング調整
                role="menuitem"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 mr-3"><path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 015.25 2h5.5A2.25 2.25 0 0113 4.25v2a.75.75 0 01-1.5 0v-2A.75.75 0 0010.75 3h-5.5A.75.75 0 004.5 3.75v12.5c0 .414.336.75.75.75h5.5a.75.75 0 00.75-.75v-2a.75.75 0 011.5 0v2A2.25 2.25 0 0110.75 18h-5.5A2.25 2.25 0 013 15.75V4.25z" clipRule="evenodd" /><path fillRule="evenodd" d="M6 10a.75.75 0 01.75-.75h9.546l-1.048-1.047a.75.75 0 111.06-1.06l2.5 2.5a.75.75 0 010 1.06l-2.5 2.5a.75.75 0 11-1.06-1.06L16.296 10.75H6.75A.75.75 0 016 10z" clipRule="evenodd" /></svg>
                <span>ログアウト</span>
              </button>
            </div>
          </Transition>
          {/* ★★★ ここまでがメニューのデザイン変更部分 ★★★ */}
        </div>
      </header>
          
          {/* キャッチコピー (背景を透明に) */}
          <div className="z-10 mb-2 sm:mb-12 max-w-3xl mx-auto text-center">
            <p className="text-xl sm:text-2xl leading-relaxed text-white font-medium [text-shadow:_1px_1px_3px_rgb(0_0_0_/_0.7)]">
              オンラインのカフェでちょっと一息。
              <br />
              気になるあの人に、声をかけてみませんか？
            </p>
          </div>

   {/* ★★★ この <main> タグから下の部分を置き換えてください ★★★ */}
   <main className="z-10 w-full px-4 flex flex-col items-center">
        
        {/* 看板とカードコンテナを重ねるためのラッパー */}
        <div className="relative w-full max-w-4xl mt-24">
        
          {/* 木の看板 (絶対配置で上部中央に) */}
          <div 
            className="w-full max-w-lg h-48 bg-contain bg-no-repeat bg-center flex flex-col items-center justify-center text-center p-4 absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10"
            style={{ backgroundImage: "url('/wood_kanban_01.png')" }}
          >
            <h2 className="text-2xl sm:text-3xl font-bold text-white [text-shadow:_2px_2px_4px_rgb(0_0_0_/_0.6)]">
            </h2>
          </div>

          {/* 「現在の空席」セクション全体のコンテナ */}
          <div className="w-full bg-white/40 backdrop-blur-xl rounded-2xl shadow-lg border border-white/30 pt-24 p-6"> {/* ★ pt-28 から pt-24 に変更 */}
            
            {/* ★ 説明文にネガティブマージンを追加して上に引き上げる */}
            <p className="text-sm text-gray-600 text-center mb-6 -mt-4">オンラインで話せる相手を探しています</p>

            {/* モード切り替えスイッチ */}
            <div className="flex items-center justify-center space-x-4 mb-4 pb-4 border-b border-white/20">
              <span className={`font-medium transition-colors ${chatMode === 'online' ? 'text-gray-800' : 'text-gray-500'}`}>
                オンライン
              </span>
              <button
                onClick={() => setChatMode(prev => prev === 'online' ? 'offline' : 'online')}
                type="button"
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#A0522D] focus:ring-offset-2
                            ${chatMode === 'online' ? 'bg-[#A0522D]' : 'bg-gray-300'}`}
                role="switch"
                aria-checked={chatMode === 'online'}
              >
                <span className="sr-only">Use setting</span>
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out
                              ${chatMode === 'online' ? 'translate-x-0' : 'translate-x-5'}`}
                />
              </button>
              <span className={`font-medium transition-colors ${chatMode === 'offline' ? 'text-gray-800' : 'text-gray-500'}`}>
                オフライン
              </span>
            </div>
            
            {/* オンライン/オフラインのコンテンツ表示エリア */}
            <div className="min-h-[300px] pt-2">
              {!hasMounted ? (
                <div className="w-full text-center py-12">
                  <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-t-2 border-[#6F4E37]"></div>
                  <p className="text-gray-500 text-md mt-3">モードを読み込み中...</p>
                </div>
              ) : chatMode === 'online' ? (
                // --- オンラインモードの場合 ---
                <>
                  {!loading && onlineUsers.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                      {onlineUsers.map((user) => (
                        user.id === currentUser?.id ? null : ( 
                          <div 
                            key={user.id} 
                            className="bg-white/50 backdrop-blur-md rounded-xl p-4 flex flex-col border border-white/50 shadow-md transition-all duration-300 hover:shadow-lg"
                          >
                            <div className="flex items-start mb-3">
                              <div className="w-12 h-12 rounded-full mr-3 bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center text-gray-600 text-xl font-semibold shadow-sm shrink-0">
                                {user.profiles?.nickname ? user.profiles.nickname.charAt(0).toUpperCase() : '?'}
                              </div>
                              <div className="flex-grow overflow-hidden">
                                <p className="text-lg font-semibold text-[#5C3A21] truncate">{user.profiles?.nickname || '名無しさん'}</p>
                                <p className="text-xs text-gray-500 truncate mt-0.5">
                                  {user.profiles?.age ? `${user.profiles.age}歳` : ''}
                                  {user.profiles?.age && user.profiles?.residence ? ' / ' : ''}
                                  {user.profiles?.residence || '情報未設定'}
                                </p>
                              </div>
                              <div className="flex flex-col items-end space-y-1.5 shrink-0 ml-2">
                                <p className="text-xs text-green-600 font-medium flex items-center">
                                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1 inline-block animate-pulse"></span>
                                  オンライン
                                </p>
                                <button
                                  onClick={() => !initiatingChatWith && handleInitiateChat(user.id)}
                                  disabled={!!initiatingChatWith}
                                  className={`px-3 py-1 text-xs bg-[#4a2e19] text-white font-semibold rounded-full shadow hover:bg-[#6d4c3a] transition duration-200 focus:outline-none focus:ring-1 focus:ring-offset-1 focus:ring-[#6F4E37] ${initiatingChatWith ? 'opacity-60 cursor-not-allowed' : ''}`}
                                >
                                  話しかける
                                </button>
                              </div>
                            </div>
                            <div className="text-xs text-gray-700 border-t border-gray-900/10 pt-2 mt-2 flex-grow min-h-[40px]">
                              <p className="line-clamp-2"> 
                                {user.profiles?.bio || '自己紹介はありません。'}
                              </p>
                            </div>
                          </div>
                        )
                      ))}
                    </div>
                  ) : (
                     !loading && onlineUsers.length === 0 ? (
                        <div className="w-full text-center py-12">
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
                </>
              ) : (
                // --- オフラインモードの場合 ---
                <div className="w-full text-center py-12">
                  <p className="text-5xl mb-3">🌙</p>
                  <p className="text-gray-700 text-lg font-semibold">オフラインモード</p>
                  <p className="text-gray-500 text-sm mt-2">新しいメッセージはプッシュ通知でお知らせします。</p>
                  <button 
                    onClick={() => router.push('/chat-history')}
                    className="mt-6 px-5 py-2.5 bg-[#A0522D] text-white font-semibold rounded-lg shadow hover:bg-[#8B4513] transition"
                  >
                    チャット履歴を見る
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 応答待ちUI (この要素と看板グループの間のスペースは、親の main タグの space-y で制御されます) */}
        {isClientLoaded && waitingForRequestId && (
          <div className="w-full max-w-4xl p-3 my-4 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 rounded-md shadow-sm">
            <p className="font-semibold text-sm">{waitingForTargetNickname || '相手'}さんの応答を待っています...</p>
          </div>
        )}

      </main>
      {/* ★★★ ここまでが置き換える <main> タグの範囲です ★★★ */}

          <footer className="mt-auto mb-8 text-center text-sm text-white/60 pt-8">
            <p>&copy; {new Date().getFullYear()} Momentos Café. All rights reserved.</p>
          </footer>
          
        </div>
      </div>
    </div>
  </>
);
}
