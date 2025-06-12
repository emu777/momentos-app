// app/chat/[roomId]/page.tsx
'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';
import toast, { Toaster } from 'react-hot-toast';
import Image from 'next/image';

// あなたの型定義ファイルからインポート (パスは実際の場所に合わせてください)
import { Message, ChatRoomInfo, UserLeftPayload } from '../../../lib/types';

// モーダルコンポーネントのインポート
import PartnerLeftModal from '../../components/PartnerLeftModal';
import MessageLogModal from '../../components/MessageLogModal';
import ConfirmLeaveChatModal from '../../components/ConfirmLeaveChatModal';

// このページ内で使うルーム情報の型を拡張
interface ChatRoomWithAffection extends ChatRoomInfo {
  affection_level: number;
}

export default function PrivateChatPage() {
  const router = useRouter();
  const params = useParams();
  const roomId = params.roomId as string;

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState(''); // ★★★ この行が重要です ★★★
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [chatRoomData, setChatRoomData] = useState<ChatRoomWithAffection | null>(null);
  const [otherUserNickname, setOtherUserNickname] = useState<string>('相手');
  const [latestOpponentMessage, setLatestOpponentMessage] = useState<Message | null>(null);
  const [isPartnerLeftModalOpen, setIsPartnerLeftModalOpen] = useState(false);
  const [leavingPartnerNickname, setLeavingPartnerNickname] = useState<string>('');
  const [isConfirmLeaveModalOpen, setIsConfirmLeaveModalOpen] = useState(false);
  const [isMessageLogModalOpen, setIsMessageLogModalOpen] = useState(false);

  const chatContainerRef = useRef<HTMLDivElement | null>(null);

  // ページの初期化処理 (認証、ルーム情報、メッセージ取得など)
  useEffect(() => {
    let isActive = true;
    setLoading(true);

    const initializePage = async () => {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (!isActive || sessionError || !session?.user) {
        if (isActive) router.push('/auth/login');
        return;
      }
      setCurrentUser(session.user);

      if (!roomId) { if (isActive) router.push('/'); return; }

      const { data: roomData, error: roomError } = await supabase.from('chat_rooms').select('user1_id, user2_id, affection_level').eq('id', roomId).single();
      if (!isActive) return;
      if (roomError || !roomData) { toast.error('ルーム情報取得エラー'); if (isActive) router.push('/'); return; }
      if (roomData.user1_id !== session.user.id && roomData.user2_id !== session.user.id) { toast.error('アクセス権がありません'); if (isActive) router.push('/'); return; }
      setChatRoomData(roomData as ChatRoomWithAffection);

      const otherUserId = roomData.user1_id === session.user.id ? roomData.user2_id : roomData.user1_id;
      const { data: profileData } = await supabase.from('profiles').select('nickname').eq('user_id', otherUserId).single();
      if (isActive) setOtherUserNickname(profileData?.nickname || '相手');

      const { data: messagesData, error: messagesError } = await supabase.from('messages').select('*, profiles(nickname)').eq('room_id', roomId).order('created_at', { ascending: true });
      if (messagesError) console.error('Error fetching messages:', messagesError);
      if (!isActive) return;

      const fetchedMessages = messagesData || [];
      setMessages(fetchedMessages);
      const opponentMsgs = fetchedMessages.filter(msg => msg.sender_id !== session.user.id);
      setLatestOpponentMessage(opponentMsgs.length > 0 ? opponentMsgs[opponentMsgs.length - 1] : null);
      setLoading(false);
    };

    initializePage();

    return () => { isActive = false; };
  }, [roomId, router]);

  // リアルタイムリスナー用のuseEffect
  useEffect(() => {
    if (!roomId || !currentUser) return;

    // メッセージのリアルタイム受信
    const messagesChannel = supabase.channel(`public_messages_in_room_${roomId}_realtime`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}`},
        async (payload) => {
          const newMessagePayload = payload.new as Omit<Message, 'profiles'>;
          const { data: profileData } = await supabase.from('profiles').select('nickname').eq('user_id', newMessagePayload.sender_id).single();
          const fullNewMessage: Message = { ...newMessagePayload, profiles: profileData as {nickname: string | null} | null };
          setMessages((prev) => [...prev, fullNewMessage]);
          if (fullNewMessage.sender_id !== currentUser.id) setLatestOpponentMessage(fullNewMessage);
        }
      ).subscribe();

    // 親密度のリアルタイム更新
    const roomUpdateChannel = supabase.channel(`chat_room_updates_for_${roomId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_rooms', filter: `id=eq.${roomId}`},
        (payload) => {
          const updatedRoom = payload.new as { affection_level: number };
          if (updatedRoom && typeof updatedRoom.affection_level === 'number') {
            setChatRoomData(prev => prev ? { ...prev, affection_level: updatedRoom.affection_level } : null);
          }
        }
      ).subscribe();

    // 相手退出検知
    const roomNotificationChannel = supabase.channel(`chat_room_notifications-${roomId}`)
      .on('broadcast', { event: 'user_left_room' }, (message) => {
        const payload = message.payload as UserLeftPayload;
        if (payload && payload.userIdWhoLeft && currentUser && payload.userIdWhoLeft !== currentUser.id) {
          setLeavingPartnerNickname(payload.nicknameWhoLeft || otherUserNickname || '相手');
          setIsPartnerLeftModalOpen(true);
        }
      }).subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(roomUpdateChannel);
      supabase.removeChannel(roomNotificationChannel);
    };
  }, [roomId, currentUser, otherUserNickname]);

  // 自動スクロール
  useEffect(() => {
    if (chatContainerRef.current) chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentUser || !roomId || !chatRoomData) return;
    const { error: messageError } = await supabase.from('messages').insert({ sender_id: currentUser.id, content: newMessage, room_id: roomId });
    if (messageError) { toast.error('メッセージ送信失敗'); return; }
    setNewMessage('');
    const newAffectionLevel = Math.min(100, chatRoomData.affection_level + 2);
    const { error: affectionError } = await supabase.from('chat_rooms').update({ affection_level: newAffectionLevel }).eq('id', roomId);
    if (affectionError) console.error("Failed to update affection level:", affectionError);
  };
  
  const handleGoBackToCafe = () => setIsConfirmLeaveModalOpen(true);
  const handlePartnerLeftModalClose = () => { setIsPartnerLeftModalOpen(false); router.push('/'); };
  const executeLeaveChat = async () => {
    setIsConfirmLeaveModalOpen(false);
    if (!roomId || !currentUser) { router.push('/'); return; }
    let myNickname = (currentUser.user_metadata?.nickname as string) || '誰か';
    const { data: profile } = await supabase.from('profiles').select('nickname').eq('user_id', currentUser.id).single();
    if (profile?.nickname) myNickname = profile.nickname;
    const channelName = `chat_room_notifications-${roomId}`;
    try { await supabase.channel(channelName).send({ type: 'broadcast', event: 'user_left_room', payload: { userIdWhoLeft: currentUser.id, nicknameWhoLeft: myNickname }});
    } catch (err) { console.error('Error sending leave event:', err); }
    router.push('/');
  };

  if (loading) { return ( <div className="fixed inset-0 flex items-center justify-center bg-black/50"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-t-2 border-white"></div></div> ); }
  if (!currentUser || !chatRoomData) { return (<div className="fixed inset-0 flex items-center justify-center bg-gray-100"><p className="text-xl font-semibold text-gray-700">チャット情報を読み込めませんでした...</p></div>); }

  return (
    <>
      <Toaster position="top-center" />
      <PartnerLeftModal isOpen={isPartnerLeftModalOpen} onClose={handlePartnerLeftModalClose} partnerNickname={leavingPartnerNickname} />
      <ConfirmLeaveChatModal isOpen={isConfirmLeaveModalOpen} onConfirm={executeLeaveChat} onCancel={() => setIsConfirmLeaveModalOpen(false)} partnerNickname={otherUserNickname} />
      <MessageLogModal isOpen={isMessageLogModalOpen} onClose={() => setIsMessageLogModalOpen(false)} messages={messages} currentUserId={currentUser.id} otherUserNickname={otherUserNickname} />

      <div className="fixed inset-0 bg-cover bg-center opacity-50 z-[-1]" style={{ backgroundImage: "url('/cafe-bg.jpg')" }}></div>
      <div className="fixed inset-0 bg-black/10 z-[-1]"></div>

      <div className="relative w-full h-screen overflow-hidden flex flex-col items-center p-2 sm:p-4">
        <button onClick={handleGoBackToCafe} className="absolute top-4 right-4 sm:top-6 sm:right-6 p-2 text-white hover:text-gray-200 z-30" title="カフェへ戻る">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-7 h-7"><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /></svg>
        </button>

        <div className="relative w-full flex-grow flex flex-col items-center justify-end min-h-0">
          <div className="relative h-full w-full max-w-sm">
            <Image src="/silhouette-female.png" alt="相手のシルエット" fill style={{objectFit: 'contain', objectPosition: 'bottom'}} className="opacity-70" priority/>
          </div>
        </div>

        <div className="w-full max-w-2xl flex-shrink-0 flex flex-col space-y-3">
          
            {/* メッセージウィンドウ */}
          <div className="relative w-full px-4">
            <div className="relative bg-[#F5F0E8]/95 pt-10 p-5 rounded-lg shadow-lg border-2 border-[#5C3A21]/50">
              {/* 名前表示タグ */}
              <div className="absolute -top-4 left-3 bg-[#4a2e19] text-white px-4 py-1.5 rounded-md shadow-md text-sm font-semibold tracking-wider">
                {otherUserNickname}
              </div>

              {/* 右上のエリア: 親密度メーター と ログボタン */}
              <div className="absolute top-2 right-2 flex items-center space-x-3 z-20">
                {/* 親密度メーター */}
                <div className="flex items-center space-x-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-pink-500">
                    <path d="M9.653 16.915l-.005-.003-.019-.01a20.759 20.759 0 01-1.162-.682 22.045 22.045 0 01-2.582-1.9-19.318 19.318 0 01-2.665-2.448 11.413 11.413 0 01-1.272-3.355C1.742 8.35 2.47 6.666 4.09 5.378A6.273 6.273 0 0110 5.006c2.812 0 4.973 1.835 5.91 3.372a11.413 11.413 0 01-1.272 3.355 19.317 19.317 0 01-2.665 2.448 22.049 22.049 0 01-2.582 1.9 20.758 20.758 0 01-1.162.682l-.019.01-.005.003z" />
                  </svg>
                  <div className="w-16 bg-gray-200/70 rounded-full h-2 shadow-inner">
                    <div 
                      className="bg-gradient-to-r from-pink-400 to-red-500 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${chatRoomData?.affection_level || 0}%` }}
                    ></div>
                  </div>
                </div>
                {/* メッセージログ閲覧ボタン */}
                <button
                  onClick={() => setIsMessageLogModalOpen(true)}
                  className="text-xs bg-[#6F4E37]/10 hover:bg-[#6F4E37]/20 text-[#6F4E37] font-medium py-1 px-2 rounded-md shadow-sm transition-colors"
                >
                  ログ
                </button>
              </div>

              {/* 最新メッセージ表示 */}
              <div className="h-20 text-lg text-[#4A3B31] overflow-y-auto custom-scrollbar-thin font-semibold">
                {latestOpponentMessage ? (
                  <p className="whitespace-pre-wrap break-words leading-relaxed">{latestOpponentMessage.content}</p>
                ) : (
                  <p className="italic text-gray-500 text-base font-normal">（会話を始めましょう…）</p>
                )}
              </div>
            </div>
          </div>
          <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
            <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="メッセージをどうぞ..." className="flex-1 p-3 border border-gray-300 bg-white/90 rounded-full focus:outline-none focus:ring-2 focus:ring-[#A0522D] text-sm text-gray-800" disabled={!currentUser}/>
            <button type="submit" className="p-3 bg-[#5C3A21] text-white font-semibold rounded-full hover:bg-[#4a2e19] transition duration-200 disabled:opacity-50" disabled={!currentUser || !newMessage.trim()}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path d="M3.105 3.105a.75.75 0 01.814-.102l14.25 4.25a.75.75 0 010 1.504l-14.25 4.25a.75.75 0 01-.916-.996V3.207a.75.75 0 01.102-.102z" /></svg>
            </button>
          </form>
        </div>
      </div>
    </>
  );
}