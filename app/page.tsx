// app/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Session, User } from '@supabase/supabase-js';
import toast, { Toaster } from 'react-hot-toast';
import Image from 'next/image'; // Next.js Imageコンポーネント

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

  const [initiatingChatWith, setInitiatingChatWith] = useState<string | null>(null);
  const [waitingForRequestId, setWaitingForRequestId] = useState<string | null>(null);
  const [waitingForRoomId, setWaitingForRoomId] = useState<string | null>(null);
  const [waitingForTargetNickname, setWaitingForTargetNickname] = useState<string | null>(null);

  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [processingRequest, setProcessingRequest] = useState<ChatRequest | null>(null);
  const [modalSenderNickname, setModalSenderNickname] = useState<string>('');
  const [isAcceptingOrRejecting, setIsAcceptingOrRejecting] = useState(false);

  const [isRequestAcceptedModalOpen, setIsRequestAcceptedModalOpen] = useState(false);

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
}, [currentUser?.id, isClientLoaded, router]); // ★ currentUser?.id を依存配列に追加

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
// handleInitiateChat 関数
const handleInitiateChat = async (targetUserId: string) => {
  // ... (この関数内の error: any は Turn 287/289 のように unknown と型ガードで修正済みと仮定)
  // ここでは 'statusError' is defined but never used. のエラーを修正します。
  const callTimestamp = new Date().toISOString();
  if (initiatingChatWith === targetUserId || initiatingChatWith === "ANY_USER_PENDING") return;
  setInitiatingChatWith(targetUserId);
  try {
    if (!currentUser || !targetUserId) { toast.error('認証エラーまたは相手不明'); return; }
    const currentUserId = currentUser.id;
    if (currentUserId === targetUserId) { toast.error('自分自身には話しかけられません。'); return; }
    const user1 = currentUserId < targetUserId ? currentUserId : targetUserId;
    const user2 = currentUserId < targetUserId ? targetUserId : currentUserId;
    const targetUserProfile = onlineUsers.find(u => u.id === targetUserId)?.profiles;
    const targetUserNickname = targetUserProfile?.nickname || '相手';
    const { data: existingRoom, error: roomError } = await supabase.from('chat_rooms').select('id').eq('user1_id', user1).eq('user2_id', user2).single();
    if (roomError && roomError.code !== 'PGRST116') { toast.error('ルーム確認エラー'); return; }
    let chatRoomIdToWaitFor: string | null = null;
    let newlyCreatedChatRequestId: string | null = null;
    if (existingRoom) {
      chatRoomIdToWaitFor = existingRoom.id;
      const { data: newJoinRequestData, error: joinRequestError } = await supabase.from('chat_requests').insert({ sender_id: currentUserId, receiver_id: targetUserId, room_id: chatRoomIdToWaitFor, status: 'pending' }).select('id').single();
      if (joinRequestError || !newJoinRequestData) { toast.error('参加リクエスト送信失敗'); return; }
      newlyCreatedChatRequestId = newJoinRequestData.id;
    } else {
      const { data: newRoomData, error: createRoomError } = await supabase.from('chat_rooms').insert({ user1_id: user1, user2_id: user2 }).select('id').single();
      if (createRoomError || !newRoomData) { toast.error('ルーム作成失敗'); return; }
      chatRoomIdToWaitFor = newRoomData.id;
      const { data: newChatRequestData, error: initialRequestError } = await supabase.from('chat_requests').insert({ sender_id: currentUserId, receiver_id: targetUserId, room_id: chatRoomIdToWaitFor, status: 'pending' }).select('id').single();
      if (initialRequestError || !newChatRequestData) { toast.error('チャットリクエスト送信失敗'); return; }
      newlyCreatedChatRequestId = newChatRequestData.id;
    }
    if (newlyCreatedChatRequestId && chatRoomIdToWaitFor) {
      setWaitingForRequestId(newlyCreatedChatRequestId); setWaitingForRoomId(chatRoomIdToWaitFor); setWaitingForTargetNickname(targetUserNickname);
      toast.success(`${targetUserNickname} にリクエストを送信しました。応答をお待ちください。`);
    } else { toast.error('リクエスト処理エラー'); }
  } catch (e: unknown) { // ★ any を unknown に修正
      let msg = 'チャット開始エラー';
      if (e instanceof Error) msg = `チャット開始エラー: ${e.message}`;
      toast.error(msg);
  } finally { setInitiatingChatWith(null); }
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

return (
  <>
     <Toaster position="top-center" toastOptions={{className: 'text-sm rounded-md bg-white text-gray-800 shadow-lg'}} />
    
    {/* チャットリクエスト受信モーダル (ユーザーB用) */}
    {processingRequest && currentUser && isRequestModalOpen && ( // ★ isRequestModalOpen も条件に含める
      <ChatRequestModal 
        isOpen={isRequestModalOpen}
        onClose={handleChatRequestResponse}
        senderNickname={modalSenderNickname}
        isLoading={isAcceptingOrRejecting}
      />
    )}

    {/* チャットリクエスト承諾通知モーダル (ユーザーA用) */}
    {currentUser && isRequestAcceptedModalOpen && ( // ★ isRequestAcceptedModalOpen を条件に使用
      <RequestAcceptedModal
        isOpen={isRequestAcceptedModalOpen}
        onClose={handleRequestAcceptedModalClose}
        accepterNickname={waitingForTargetNickname || '相手'}
      />
    )}


    <div className="min-h-screen bg-gradient-to-br from-[#F0EAD6] to-[#EADDCA] flex flex-col items-center pt-8 sm:pt-12 px-4 relative overflow-x-hidden">
      {/* ... (header, p, main (UI改善版)) ... */}
      {/* ログアウトボタン内の statusError は未使用なので削除するか、ログ出力する */}
      <header className="z-20 w-full max-w-6xl mx-auto mb-10 sm:mb-12 flex justify-between items-center p-4 bg-white/60 backdrop-blur-lg shadow-lg rounded-2xl">
        <h1 className="text-3xl sm:text-4xl font-bold text-[#5C3A21] tracking-tight cursor-pointer" onClick={() => router.push('/')}>
          Momentos Café
        </h1>
        <div className="relative">
          <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2 rounded-full hover:bg-gray-200/70 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#6F4E37] transition-colors" aria-label="メニューを開く">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-7 h-7 text-[#6F4E37]">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
            </svg>
          </button>
          {isMenuOpen && (
            <div className="absolute right-0 mt-2 w-60 origin-top-right bg-white rounded-xl shadow-2xl ring-1 ring-black ring-opacity-5 focus:outline-none py-2 z-30" role="menu" aria-orientation="vertical" aria-labelledby="menu-button">
              {[
                { label: 'プロフィール', href: '/profile', icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 mr-3 text-gray-500"><path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.095a1.23 1.23 0 00.41-1.412A9.99 9.99 0 0010 12.75a9.99 9.99 0 00-6.535 1.743z" /></svg> },
                { label: 'チャット履歴', href: '/chat-history', icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 mr-3 text-gray-500"><path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10zm0 5.25a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z" clipRule="evenodd" /></svg> },
                { label: '設定', action: () => toast('設定機能は準備中です。', {icon: '⚙️'}), icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 mr-3 text-gray-500"><path fillRule="evenodd" d="M11.078 2.25c-.217-.065-.439-.1-.678-.1H9.6c-.24 0-.46.035-.678.1S8.573 2.573 8.373 2.738a4.5 4.5 0 00-2.638 2.638c-.166.2-.28.432-.347.678S5.25 6.401 5.25 6.64V9.6c0 .24.035.46.1.678s.18.421.347.678a4.5 4.5 0 002.638 2.638c.2.165.432.28.678.347s.401.1.64.1H10.4c.24 0 .46-.035.678-.1s.421-.18.678-.347a4.5 4.5 0 002.638-2.638c.165-.2.28-.432-.347-.678s.1-.401.1-.64V6.64c0-.24-.035-.46-.1-.678s-.18-.421-.347-.678a4.5 4.5 0 00-2.638-2.638c-.2-.165-.432-.28-.678-.347S10.64 2.25 10.4 2.25h-.801c-.24 0-.46.035-.678.1zM10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" clipRule="evenodd" /><path d="M10 6.5a.5.5 0 00-.5.5v3a.5.5 0 001 0v-3a.5.5 0 00-.5-.5z" /></svg> },
              ].map((item) => (
                <button key={item.label} onClick={() => { if (item.href) router.push(item.href); if (item.action) item.action(); setIsMenuOpen(false);}}
                  className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 flex items-center transition-colors" role="menuitem">
                  {item.icon} {item.label}
                </button>
              ))}
              <div className="border-t border-gray-200 my-1"></div>
              <button 
                onClick={async () => {
                  setIsMenuOpen(false); 
                  if (currentUser) { 
                    try { 
                      await supabase.from('user_statuses').upsert({ user_id: currentUser.id, is_online: false, last_active_at: new Date().toISOString() }, { onConflict: 'user_id' }); 
                    } catch (e: unknown) { // ★ statusError を e に、型を unknown に
                      console.error('[LogoutButton] Error setting offline status:', e);
                      // statusError は使用されていなかったので、ここでは e をログに出力
                    }
                  } 
                  const { error: signOutError } = await supabase.auth.signOut(); 
                  if (signOutError) toast.error(`ログアウト失敗: ${signOutError.message}`);
                  // else toast.success('ログアウトしました。'); // onAuthStateChangeがリダイレクトを処理
                }}
                className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 hover:text-red-700 flex items-center transition-colors"
                role="menuitem"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 mr-3 text-red-500"><path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 015.25 2h5.5A2.25 2.25 0 0113 4.25v2a.75.75 0 01-1.5 0v-2A.75.75 0 0010.75 3h-5.5A.75.75 0 004.5 3.75v12.5c0 .414.336.75.75.75h5.5a.75.75 0 00.75-.75v-2a.75.75 0 011.5 0v2A2.25 2.25 0 0110.75 18h-5.5A2.25 2.25 0 013 15.75V4.25z" clipRule="evenodd" /><path fillRule="evenodd" d="M6 10a.75.75 0 01.75-.75h9.546l-1.048-1.047a.75.75 0 111.06-1.06l2.5 2.5a.75.75 0 010 1.06l-2.5 2.5a.75.75 0 11-1.06-1.06L16.296 10.75H6.75A.75.75 0 016 10z" clipRule="evenodd" /></svg>
                ログアウト
              </button>
            </div>
          )}
        </div>
      </header>
      
      <p className="text-lg sm:text-xl text-center mb-10 z-10 max-w-2xl leading-relaxed bg-clip-text text-transparent bg-gradient-to-r from-[#6F4E37] to-[#A0522D] font-medium">
        カフェで偶然隣り合った人と、ふとした会話を。<br/>気になる相手に話しかけてみましょう。
      </p>

      <main className="z-10 w-full max-w-3xl px-2 sm:px-0 flex flex-col items-center space-y-8">
        <div className="w-full flex justify-between items-center px-2">
          <h2 className="text-2xl sm:text-3xl font-semibold text-[#6F4E37]">現在の空席</h2>
        </div>

        {isClientLoaded && waitingForRequestId && (
          <div className="w-full p-4 my-2 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 rounded-md shadow-md">
            <p className="font-semibold">{waitingForTargetNickname || '相手'}さんの応答を待っています...</p>
          </div>
        )}

        {isClientLoaded && !loading && onlineUsers.length > 0 ? (
          <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {onlineUsers.map((user) => (
              user.id === currentUser?.id ? null : ( 
                <div key={user.id} className="bg-white/80 backdrop-blur-md rounded-xl shadow-lg p-5 transition-all duration-300 hover:shadow-2xl hover:scale-105 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center mb-3">
                      <div className="w-12 h-12 rounded-full mr-4 bg-gradient-to-br from-gray-300 to-gray-400 flex items-center justify-center text-white text-xl font-bold">
                        {user.profiles?.nickname ? user.profiles.nickname.charAt(0).toUpperCase() : '?'}
                      </div>
                      <div>
                        <p className="text-lg font-semibold text-gray-800 truncate">{user.profiles?.nickname || '名無しさん'}</p>
                        <p className="text-xs text-green-500 font-medium flex items-center">
                          <span className="w-2 h-2 bg-green-500 rounded-full mr-1.5 inline-block animate-pulse"></span>
                          オンライン
                        </p>
                      </div>
                    </div>
                    <div className="text-sm text-gray-600 space-y-1 mb-4">
                      <p><span className="font-medium text-gray-700">年齢: </span>{user.profiles?.age ? `${user.profiles.age}歳` : '未設定'}</p>
                      <p><span className="font-medium text-gray-700">居住地: </span>{user.profiles?.residence || '未設定'}</p>
                      <p className="text-xs text-gray-500 h-10 overflow-hidden line-clamp-2">{user.profiles?.bio || '自己紹介はありません'}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => !initiatingChatWith && handleInitiateChat(user.id)}
                    disabled={!!initiatingChatWith}
                    className={`w-full mt-auto px-4 py-2.5 bg-gradient-to-r from-[#A0522D] to-[#8B4513] text-white font-semibold rounded-lg shadow-md hover:from-[#8B4513] hover:to-[#A0522D] transition duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#6F4E37] ${initiatingChatWith ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    話しかける
                  </button>
                </div>
              )
            ))}
          </div>
        ) : (
           isClientLoaded && !loading && onlineUsers.length === 0 ? (
              <div className="w-full text-center py-16 bg-white/70 backdrop-blur-sm rounded-xl shadow-md">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-16 h-16 mx-auto text-gray-400 mb-4"><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-3.471-5.628M12 12a3 3 0 100-6 3 3 0 000 6zm6 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <p className="text-gray-600 text-lg">現在、空席はありません。</p>
                <p className="text-gray-500 text-sm mt-2">少し待ってから再度ご確認ください。</p>
              </div>
          ) : ( 
              <div className="w-full text-center py-16">
                <svg className="animate-spin h-10 w-10 text-[#6F4E37] mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                <p className="text-gray-500 text-lg mt-4">情報を読み込み中...</p>
              </div>
          )
        )}
      </main>

      <footer className="z-10 mt-16 mb-8 text-center text-sm text-[#6F4E37]/70">
        <p>&copy; {new Date().getFullYear()} Momentos Café. All rights reserved.</p>
      </footer>
    </div>
  </>
);
}
