// app/chat/[roomId]/page.tsx
'use client';

import { useEffect, useState, useRef } from 'react'; // useCallback を削除
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Session, User } from '@supabase/supabase-js';
import toast, { Toaster } from 'react-hot-toast';
import Image from 'next/image'; // ★ next/image をインポート

// あなたの型定義ファイルからインポート (パスは実際の場所に合わせてください)
import { Message, ChatRoomInfo, UserLeftPayload } from '../../../lib/types'; 
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { Profile } from '../../../lib/types'; // 型のみのインポートとして明示
// モーダルコンポーネントのインポート
import PartnerLeftModal from '../../components/PartnerLeftModal';
import MessageLogModal from '../../components/MessageLogModal';
import ConfirmLeaveChatModal from '../../components/ConfirmLeaveChatModal';

export default function PrivateChatPage() {
  const router = useRouter();
  const params = useParams();
  const roomId = params.roomId as string;

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [chatRoomInfo, setChatRoomInfo] = useState<ChatRoomInfo | null>(null);
  const [otherUserNickname, setOtherUserNickname] = useState<string>('相手');
  
  const [isMessageLogModalOpen, setIsMessageLogModalOpen] = useState(false);
  const [latestOpponentMessage, setLatestOpponentMessage] = useState<Message | null>(null);

  const [isPartnerLeftModalOpen, setIsPartnerLeftModalOpen] = useState(false);
  const [leavingPartnerNickname, setLeavingPartnerNickname] = useState<string>('');
  const [isConfirmLeaveModalOpen, setIsConfirmLeaveModalOpen] = useState(false);

  const chatContainerRef = useRef<HTMLDivElement | null>(null);

  // 認証とルーム情報取得
  useEffect(() => {
    setLoading(true);
    async function checkAuthAndRoom() {
      const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !currentSession?.user) { router.push('/auth/login'); setLoading(false); return; }
      setSession(currentSession); setCurrentUser(currentSession.user);
      if (!roomId) { router.push('/'); setLoading(false); return; }
      const { data: roomData, error: roomError } = await supabase.from('chat_rooms').select('user1_id, user2_id').eq('id', roomId).single();
      if (roomError || !roomData) { toast.error('ルーム情報取得エラー'); router.push('/'); setLoading(false); return; }
      if (roomData.user1_id !== currentSession.user.id && roomData.user2_id !== currentSession.user.id) { toast.error('アクセス権がありません'); router.push('/'); setLoading(false); return; }
      setChatRoomInfo(roomData);
    }
    checkAuthAndRoom();
  }, [router, roomId]);

  // 相手ニックネーム取得
  useEffect(() => {
    if (chatRoomInfo && currentUser) {
      const otherUserId = chatRoomInfo.user1_id === currentUser.id ? chatRoomInfo.user2_id : chatRoomInfo.user1_id;
      if (otherUserId) {
        supabase.from('profiles').select('nickname').eq('user_id', otherUserId).single()
          .then(({ data, error }) => {
            if (error && error.code !== 'PGRST116') {
              console.error('Error fetching other user nickname:', error);
              setOtherUserNickname('相手');
            } else if (data) {
              setOtherUserNickname(data.nickname || '相手');
            } else {
              setOtherUserNickname('相手');
            }
          });
      }
    }
  }, [chatRoomInfo, currentUser]);

  // メッセージ取得とリアルタイム更新 + 最新相手メッセージの更新
  useEffect(() => {
    if (!currentUser || !chatRoomInfo || !roomId || !session) return;
    setLoading(true);
    const updateLatestOpponentMsg = (allMsgs: Message[]) => {
      if (!currentUser) return; // currentUserの存在を再確認
      const opponentMsgs = allMsgs.filter(msg => msg.sender_id !== currentUser.id);
      if (opponentMsgs.length > 0) {
        setLatestOpponentMessage(opponentMsgs[opponentMsgs.length - 1]);
      } else {
        setLatestOpponentMessage(null);
      }
    };
    async function fetchMessages() {
      const { data, error } = await supabase.from('messages').select('*, profiles(nickname)').eq('room_id', roomId).order('created_at', { ascending: true });
      if (error) {
        console.error('Error fetching messages:', error);
        setMessages([]);
        setLatestOpponentMessage(null);
      } else {
        const fetchedMessages = data || [];
        setMessages(fetchedMessages);
        updateLatestOpponentMsg(fetchedMessages);
      }
      setLoading(false);
    }
    fetchMessages();
    const messagesChannel = supabase.channel(`public_messages_in_room_${roomId}_v_lint_final`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}`},
        async (payload) => {
          const newMessagePayload = payload.new as Omit<Message, 'profiles'>;
          const { data: profileData, error: profileError } = await supabase.from('profiles').select('nickname').eq('user_id', newMessagePayload.sender_id).single();
          const fullNewMessage: Message = { ...newMessagePayload, profiles: profileError ? { nickname: '名無し' } : (profileData as {nickname: string | null} | null) };
          setMessages((prevMessages) => {
            const updatedMsgs = [...prevMessages, fullNewMessage];
            updateLatestOpponentMsg(updatedMsgs);
            return updatedMsgs;
          });
        }
      ).subscribe();
    return () => { supabase.removeChannel(messagesChannel); };
  }, [currentUser, chatRoomInfo, roomId, session]);
  
  // 自動スクロール
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // 相手退出検知リスナー
  useEffect(() => {
    if (!roomId || !currentUser) return;
    // const userId = currentUser.id; // ★ 未使用のため削除
    const roomNotificationChannelName = `chat_room_notifications-${roomId}`;
    const roomNotificationChannel = supabase.channel(roomNotificationChannelName, { config: { broadcast: { ack: true } } });
    roomNotificationChannel.on('broadcast', { event: 'user_left_room' }, (message) => {
      const payload = message.payload as UserLeftPayload;
      if (payload && payload.userIdWhoLeft && currentUser && payload.userIdWhoLeft !== currentUser.id) {
        const nicknameToDisplay = payload.nicknameWhoLeft || otherUserNickname || '相手';
        setLeavingPartnerNickname(nicknameToDisplay);
        setIsPartnerLeftModalOpen(true);
      }
    }).subscribe();
    return () => { supabase.removeChannel(roomNotificationChannel); };
  }, [roomId, currentUser, otherUserNickname]);


  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentUser || !roomId) return;
    const { error } = await supabase.from('messages').insert({ sender_id: currentUser.id, content: newMessage, room_id: roomId });
    if (error) { toast.error('メッセージ送信失敗'); } else { setNewMessage(''); }
  };
  
  const handleGoBackToCafe = () => {
    setIsConfirmLeaveModalOpen(true);
  };

  const executeLeaveChat = async () => {
    setIsConfirmLeaveModalOpen(false);
    if (!roomId || !currentUser) { router.push('/'); return; }
    let myNickname = (currentUser.user_metadata?.nickname as string) || '誰か';
    if (!currentUser.user_metadata?.nickname) {
        try {
            const { data: profile } = await supabase.from('profiles').select('nickname').eq('user_id', currentUser.id).single();
            if (profile?.nickname) myNickname = profile.nickname;
        } catch (e) { console.error("Error fetching own profile for leave event", e); }
    }
    const channelName = `chat_room_notifications-${roomId}`;
    try { await supabase.channel(channelName).send({ type: 'broadcast', event: 'user_left_room', payload: { userIdWhoLeft: currentUser.id, nicknameWhoLeft: myNickname }});
    } catch (err) { console.error('Error sending leave event:', err); }
    router.push('/');
  };

  const handlePartnerLeftModalClose = () => {
    setIsPartnerLeftModalOpen(false);
    router.push('/');
  };

  // --- JSXのレンダリングロジック ---
  if (loading) { 
    return (<div className="min-h-screen flex items-center justify-center bg-gray-100"><p className="text-xl font-semibold text-gray-700">チャットを読み込み中...</p></div>);
  }
  if (!currentUser || !chatRoomInfo) { 
    return (<div className="min-h-screen flex items-center justify-center bg-gray-100"><p className="text-xl font-semibold text-gray-700">チャット情報を読み込めませんでした...</p></div>);
  }

  return (
    <>
      <Toaster position="top-center" />
      <PartnerLeftModal isOpen={isPartnerLeftModalOpen} onClose={handlePartnerLeftModalClose} partnerNickname={leavingPartnerNickname} />
      <ConfirmLeaveChatModal isOpen={isConfirmLeaveModalOpen} onConfirm={executeLeaveChat} onCancel={() => setIsConfirmLeaveModalOpen(false)} partnerNickname={otherUserNickname} />
      <MessageLogModal isOpen={isMessageLogModalOpen} onClose={() => setIsMessageLogModalOpen(false)} messages={messages} currentUserId={currentUser.id} otherUserNickname={otherUserNickname} />

      <div 
        className="fixed inset-0 bg-cover bg-center opacity-40 z-[-1]"
        style={{ backgroundImage: "url('/cafe-bg.jpg')" }}
      ></div>
      <div className="fixed inset-0 bg-black/10 z-[-1]"></div>

      <div className="flex flex-col h-screen w-full items-center justify-center p-2 sm:p-4 relative">
        
        <button
          onClick={handleGoBackToCafe}
          className="absolute top-4 right-4 sm:top-6 sm:right-6 p-2 text-gray-100 hover:text-white z-20 transition-colors"
          title="カフェへ戻る"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-7 h-7">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
          </svg>
        </button>
        
        <div className="relative w-full max-w-md flex flex-col items-center justify-end h-auto min-h-[150px] max-h-[45vh]">
          {/* ★ <img> を <Image /> に変更 */}
          <Image 
            src="/silhouette-female.png" 
            alt="相手のシルエット" 
            width={200}  // ★ 画像の固有の幅 (ピクセル単位) - 実際の画像に合わせて調整してください
            height={350} // ★ 画像の固有の高さ (ピクセル単位) - 実際の画像に合わせて調整してください
            className="max-h-full w-auto object-contain opacity-40" 
            priority // ページ読み込み時に優先的に表示する場合
          />
        </div>

        <div className="relative w-full max-w-xl bg-white/50 backdrop-blur-md rounded-2xl shadow-xl p-4 pt-10 -mt-[25px] z-10">
          <div className="absolute -top-4 left-4 bg-[#6F4E37] text-white px-5 py-2 rounded-lg shadow-lg text-md font-semibold z-20">
            {otherUserNickname}
          </div>
          <div className="h-12 p-2.5 rounded-md text-sm text-gray-700 overflow-hidden line-clamp-2 custom-scrollbar-thin [text-shadow:_1px_1px_1px_rgb(255_255_255_/_0.2)]">
            {latestOpponentMessage ? (
              <p className="whitespace-pre-wrap break-words">{latestOpponentMessage.content}</p>
            ) : (
              <p className="italic text-gray-500">（会話を始めましょう…）</p>
            )}
          </div>
          <button
            onClick={() => setIsMessageLogModalOpen(true)}
            className="absolute top-3 right-3 text-xs bg-black/5 hover:bg-black/10 text-gray-600 hover:text-gray-800 font-medium py-1 px-2.5 rounded-md shadow-sm transition-colors z-20"
          >
            ログ全体
          </button>
        </div>

        <form onSubmit={handleSendMessage} className="w-full max-w-xl flex items-center space-x-2 p-2 bg-white/60 backdrop-blur-sm rounded-full shadow-lg mt-3 z-10">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="メッセージをどうぞ..."
            className="flex-1 p-2.5 border-none bg-transparent focus:outline-none focus:ring-0 text-sm text-gray-800 placeholder-gray-500"
            disabled={!currentUser}
          />
          <button
            type="submit"
            className="p-2.5 bg-[#8B4513] text-white font-semibold rounded-full hover:bg-[#A0522D] transition duration-200 disabled:opacity-50"
            disabled={!currentUser || !newMessage.trim()}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M3.105 3.105a.75.75 0 01.814-.102l14.25 4.25a.75.75 0 010 1.504l-14.25 4.25a.75.75 0 01-.916-.996V3.207a.75.75 0 01.102-.102z" />
            </svg>
          </button>
        </form>
      </div>
    </>
  );
}