// app/page.tsx
'use client';

import { useEffect, useState, useCallback, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Session, User } from '@supabase/supabase-js';
import toast, { Toaster } from 'react-hot-toast';
import { Transition } from '@headlessui/react'; // カスタムフックをインポート
// import useLocalStorageState from '../lib/hooks/useLocalStorageState'; // カスタムフックを一時的にコメントアウト
import Link from 'next/link';

import { ChatBubbleLeftRightIcon, HeartIcon } from '@heroicons/react/24/outline'; // アイコンをインポート
// あなたの型定義ファイルからインポート (パスは実際の場所に合わせてください)
import { Profile, UserWithProfile, ChatRequest, ChatHistoryItem, DailyTopic, TopicCycleStatus } from '../lib/types'; // DailyTopic, TopicCycleStatus をインポート

// モーダルコンポーネント
import ChatRequestModal from './components/ChatRequestModal';
import RequestAcceptedModal from './components/RequestAcceptedModal';

// 年の通算日数を取得するヘルパー関数
const getDayOfYear = (date: Date): number => {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
};

// AM5:00を基準とした話題の参照日付を取得するヘルパー関数
const getTopicReferenceDate = (date: Date): Date => {
  const refDate = new Date(date.getTime());
  if (refDate.getHours() < 5) { // AM5:00より前の場合
    refDate.setDate(refDate.getDate() - 1); // 前日の日付とする
  }
  refDate.setHours(5, 0, 0, 0); // その日のAM5:00:00.000に設定
  return refDate;
}


export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [session, setSession] = useState<Session | null>(null); 
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
    // ★ モード管理用のステート
 // const [chatMode, setChatMode] = useLocalStorageState<'online' | 'offline'>('chatMode', 'online');
 const [chatMode, setChatMode] = useState<'online' | 'offline'>('online'); // ★ useState に一時変更
 // console.log('[HomePage Render] Current chatMode is:', chatMode); // ★ レンダリング時の状態確認ログ
  const [hasMounted, setHasMounted] = useState(false);

  // 今日の話題と一言関連のステート
  const [setDbDailyTopics] = useState<DailyTopic[]>([]); // DBから取得した話題リスト
  const [todayTopicDisplay, setTodayTopicDisplay] = useState(''); // 表示用の「今日の話題」
  const [currentUserTopicInput, setCurrentUserTopicInput] = useState(''); // ユーザーが入力する「今日の話題」への返答
  const [isSavingTopic, setIsSavingTopic] = useState(false); // 保存中のフラグ
  const [isTopicSectionOpen, setIsTopicSectionOpen] = useState(false); // 今日の話題セクション開閉用

  // ★ モードごとのデータ用ステート
  const [onlineUsers, setOnlineUsers] = useState<UserWithProfile[]>([]);
  const [chatPartners, setChatPartners] = useState<ChatHistoryItem[]>([]);
  const [loadingPartners, setLoadingPartners] = useState(false);
  
  // DM開始・応答待ち関連のステート
  const [initiatingChatWith, setInitiatingChatWith] = useState<string | null>(null);
  const [waitingForRequestId, setWaitingForRequestId] = useState<string | null>(null);
  const [waitingForRoomId, setWaitingForRoomId] = useState<string | null>(null);
  const [waitingForTargetNickname, setWaitingForTargetNickname] = useState<string | null>(null);
  
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [processingRequest, setProcessingRequest] = useState<ChatRequest | null>(null);
  const [modalSenderNickname, setModalSenderNickname] = useState<string>('');
  const [isAcceptingOrRejecting, setIsAcceptingOrRejecting] = useState(false);
  const [isRequestAcceptedModalOpen, setIsRequestAcceptedModalOpen] = useState(false);

  // --- 関数定義をuseEffectよりも前に配置 ---

  const fetchOnlineUsers = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    const oneMinuteAgoISO = new Date(Date.now() - 60 * 1000).toISOString();
    const { data, error } = await supabase.from('user_statuses')
      .select('user_id, last_active_at, profiles(nickname, age, residence, bio, topic)') // topic も取得
      .eq('is_online', true)
      .gte('last_active_at', oneMinuteAgoISO);
    if (error) { console.error('Error fetching online users:', error); }
    else {
      const formattedUsers = data?.map(u => {
        // profiles が配列で返ってくるケースとオブジェクトで返ってくるケースを考慮
        const profileData = (Array.isArray(u.profiles) && u.profiles.length > 0) ? u.profiles[0] : (Array.isArray(u.profiles) ? null : u.profiles);
        // 型 UserWithProfile および Profile に topic?: string が追加されている前提
        return { id: u.user_id, last_active_at: u.last_active_at, profiles: profileData as Profile | null };
      }).filter(u => u.id !== currentUser.id && u.profiles !== null) || [];
      setOnlineUsers(formattedUsers);
    }
    setLoading(false);
  }, [currentUser]);

  const fetchChatPartners = useCallback(async () => {
    if (!currentUser) return;
    setLoadingPartners(true);
    try {
      const { data: rooms, error: roomsError } = await supabase.from('chat_rooms').select('id, user1_id, user2_id, affection_level').or(`user1_id.eq.${currentUser.id},user2_id.eq.${currentUser.id}`);
      if (roomsError) throw roomsError; // エラーがあればここでスローしてcatchブロックで処理する
      if (!rooms || rooms.length === 0) {
        setChatPartners([]);
        setLoadingPartners(false);
        return;
      }
      
      const partnersPromises = rooms.map(async (room) => {
        const otherUserId = room.user1_id === currentUser.id ? room.user2_id : room.user1_id;
        const { data: profile } = await supabase.from('profiles').select('nickname, bio, topic').eq('user_id', otherUserId).single(); // bio と topic を取得
        const { data: lastMessage } = await supabase.from('messages').select('content, created_at').eq('room_id', room.id).order('created_at', { ascending: false }).limit(1).single();
        
        return {
          roomId: room.id,
          otherUserId: otherUserId,
          otherUserNickname: profile?.nickname || '名無しさん',
          affectionLevel: room.affection_level || 0,
          otherUserBio: profile?.bio || '', // パートナーの自己紹介文
          otherUserTopic: profile?.topic || '', // パートナーの「今日の話題」への返答
          lastMessage: lastMessage?.content || null,
          lastMessageAt: lastMessage?.created_at || null,
          isOnline: false, // isOnlineは後で設定
          unreadCount: 0,
        };
      });

      let partnerList = await Promise.all(partnersPromises);
      
      const otherUserIds = partnerList.map(p => p.otherUserId);
      if (otherUserIds.length > 0) {
        const oneMinuteAgoISO = new Date(Date.now() - 60 * 1000).toISOString();
        const { data: onlineStatuses } = await supabase.from('user_statuses').select('user_id').in('user_id', otherUserIds).eq('is_online', true).gte('last_active_at', oneMinuteAgoISO);
        
        const onlineIds = new Set(onlineStatuses?.map(s => s.user_id));
        partnerList = partnerList.map(partner => ({
          ...partner,
          isOnline: onlineIds.has(partner.otherUserId)
        }));
      }

      partnerList.sort((a, b) => {
        if (!a.lastMessageAt) return 1; if (!b.lastMessageAt) return -1;
        return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
      });
      setChatPartners(partnerList);
    } catch (error) {
      console.error("Error fetching chat partners:", error);
      toast.error("チャットパートナーのリスト取得に失敗しました。");
    } finally {
      setLoadingPartners(false);
    }
  }, [currentUser]);

  // 今日の話題を決定しセットするEffect
  useEffect(() => {
    const determineAndSetDailyTopic = async () => {
      let topicToDisplay = '今日の話題を準備中です...';
      try {
        const { data: allDbTopics, error: fetchAllTopicsError } = await supabase
          .from('daily_topics')
          .select('id, topic_text');

        if (fetchAllTopicsError || !allDbTopics || allDbTopics.length === 0) {
          console.error('Error fetching daily topics or no topics found:', fetchAllTopicsError);
          toast.error('今日の話題の取得に失敗しました。');
          setTodayTopicDisplay('今日はどんな一日でしたか？'); // フォールバック
          return;
        }
        setDbDailyTopics(allDbTopics as DailyTopic[]); // 全ての話題リストを保存

        const { data: cycleStatusData, error: cycleStatusError } = await supabase
          .from('topic_cycle_status')
          .select('*')
          .eq('config_id', 'default_cycle_status')
          .maybeSingle<TopicCycleStatus>();

        if (cycleStatusError) {
          console.error('Error fetching topic cycle status:', cycleStatusError);
          toast.error('話題のサイクル状態取得に失敗しました。');
          // フォールバックとして、日付の剰余で単純にトピックを選択 (以前のロジックに近い)
          const dayOfYear = getDayOfYear(new Date());
          const topicIndex = dayOfYear % allDbTopics.length;
          setTodayTopicDisplay(allDbTopics[topicIndex].topic_text);
          return;
        }

        const now = new Date();
        let needsNewTopicSelection = true;
        let currentTopicIdFromStatus: number | null = null;

        if (cycleStatusData && cycleStatusData.last_changed_at) {
          const lastChangedDate = new Date(cycleStatusData.last_changed_at);
          const currentTopicRefDate = getTopicReferenceDate(now);
          const lastTopicRefDate = getTopicReferenceDate(lastChangedDate);

          if (currentTopicRefDate.getTime() <= lastTopicRefDate.getTime() && cycleStatusData.current_topic_id) {
            needsNewTopicSelection = false;
            currentTopicIdFromStatus = cycleStatusData.current_topic_id;
          }
        }

        if (needsNewTopicSelection) {
          let usedIds = (cycleStatusData?.used_topic_ids as number[] | undefined) || [];
          const availableTopicObjects = allDbTopics as { id: number; topic_text: string }[];
          const availableTopicIds = availableTopicObjects.map(t => t.id);

          let candidateIds = availableTopicIds.filter(id => !usedIds.includes(id));

          if (candidateIds.length === 0 && availableTopicIds.length > 0) {
            // 全ての話題を使用済みの場合、サイクルをリセット
            usedIds = [];
            candidateIds = availableTopicIds;
            //toast('全ての話題が一巡しました。新しいサイクルを開始します。', { duration: 4000 });
          }

          if (candidateIds.length > 0) {
            const randomIndex = Math.floor(Math.random() * candidateIds.length);
            const newSelectedTopicId = candidateIds[randomIndex];
            const newSelectedTopic = availableTopicObjects.find(t => t.id === newSelectedTopicId);
            
            if (newSelectedTopic) {
              topicToDisplay = newSelectedTopic.topic_text;
              const newUsedIds = [...usedIds, newSelectedTopicId];

              const { error: updateStatusError } = await supabase
                .from('topic_cycle_status')
                .upsert({
                  config_id: 'default_cycle_status',
                  current_topic_id: newSelectedTopicId,
                  last_changed_at: now.toISOString(),
                  used_topic_ids: newUsedIds,
                }, { onConflict: 'config_id' });

              if (updateStatusError) {
                console.error('Error updating topic cycle status:', updateStatusError);
                toast.error('話題のサイクル状態更新に失敗しました。');
              }
            } else {
               topicToDisplay = '適切な話題が見つかりませんでした。';
            }
          } else {
            topicToDisplay = '表示できる話題がありません。';
          }
        } else if (currentTopicIdFromStatus) {
          const currentTopic = (allDbTopics as { id: number; topic_text: string }[]).find(t => t.id === currentTopicIdFromStatus);
          topicToDisplay = currentTopic ? currentTopic.topic_text : '今日の話題の読み込みに問題がありました。';
        }
        setTodayTopicDisplay(topicToDisplay);

      } catch (e) {
        console.error("Unexpected error in determineAndSetDailyTopic:", e);
        toast.error('今日の話題の取得に失敗しました。');
        setTodayTopicDisplay('今日の話題の読み込み中にエラーが発生しました。');
      }
    };
    determineAndSetDailyTopic();
  }, []);

  // ユーザーの「今日の話題」への返答(topic)を読み込むEffect
  useEffect(() => {
    if (!currentUser) {
      setCurrentUserTopicInput(''); // ログアウトなどでユーザーがいなくなったらクリア
      return;
    }
    const fetchUserTopicInput = async () => {
      const { data, error } = await supabase.from('profiles').select('topic').eq('user_id', currentUser.id).single();
      if (error) {
        console.error('Error fetching user topic input:', error);
        setCurrentUserTopicInput(''); // 取得失敗時は空に
      } else {
        setCurrentUserTopicInput(data?.topic || ''); // 取得したtopicをセット、なければ空に
      }
    };
    fetchUserTopicInput();
  }, [currentUser]); // currentUserが変わったら再実行

  // --- useEffectフック群 ---

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((_, session) => {
      const user = session?.user ?? null;
      setCurrentUser(user);
      if (!user && hasMounted) { // hasMounted チェックを追加
        router.push('/auth/login');
      }
    });
    return () => { authListener.subscription.unsubscribe(); };
  }, [router, hasMounted]);

  useEffect(() => {
    if (hasMounted && currentUser) {
      if (chatMode === 'online') {
        fetchOnlineUsers();
      } else {
        fetchChatPartners();
      }
    } else if (hasMounted && !currentUser) {
      setLoading(false);
    }
  }, [chatMode, hasMounted, currentUser, fetchOnlineUsers, fetchChatPartners]);

  // オンラインユーザーリストのリアルタイム更新
  useEffect(() => {
    if (!currentUser || chatMode !== 'online') return;
    const userStatusChannel = supabase.channel('public_user_statuses_realtime_page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_statuses' }, 
        () => fetchOnlineUsers()
      )
      .subscribe();
    return () => { supabase.removeChannel(userStatusChannel); };
  }, [currentUser, chatMode, fetchOnlineUsers]);

  // DMリクエスト受信リスナー
  useEffect(() => {
    if (!currentUser) return;
    const userIdForEffect = currentUser.id;
    const requestsChannel = supabase.channel(`public_chat_requests_for_${userIdForEffect}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_requests', filter: `receiver_id=eq.${userIdForEffect}`},
        async (payload) => {
          if (payload.table !== 'chat_requests' || payload.eventType !== 'INSERT') return; 
          const newRequest = payload.new as ChatRequest;
          if (newRequest.status !== 'pending') return;
          const { data: senderProfile } = await supabase.from('profiles').select('nickname').eq('user_id', newRequest.sender_id).single();
          setProcessingRequest(newRequest); 
          setModalSenderNickname(senderProfile?.nickname || '名無しさん'); 
          setIsRequestModalOpen(true);
        }
      )
      .subscribe();
    return () => { if (requestsChannel) supabase.removeChannel(requestsChannel); };
  }, [currentUser]);

  // ユーザーAの応答待ちリスナー
  useEffect(() => {
    if (!waitingForRequestId) return;
    const requestStatusChannel = supabase.channel(`user_a_awaits_request_${waitingForRequestId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_requests', filter: `id=eq.${waitingForRequestId}`},
        (payload) => {
          const updatedRequest = payload.new as ChatRequest;
          if (updatedRequest.status === 'accepted') {
            setIsRequestAcceptedModalOpen(true);
          } else if (updatedRequest.status === 'rejected') {
            toast(`${waitingForTargetNickname || '相手'}にリクエストを拒否されました。`);
            setWaitingForRequestId(null); setWaitingForRoomId(null); setWaitingForTargetNickname(null);
          }
        }
      ).subscribe();
    return () => { supabase.removeChannel(requestStatusChannel); };
  }, [waitingForRequestId, waitingForTargetNickname]);
  
  const handleInitiateChat = async (targetUserId: string) => {
    if (initiatingChatWith) return;
    setInitiatingChatWith(targetUserId);
    try {
      if (!currentUser) { toast.error('認証エラー'); return; }
      const currentUserId = currentUser.id;
      if (currentUserId === targetUserId) { toast.error('自分自身には話しかけられません。'); return; }
      const user1 = currentUserId < targetUserId ? currentUserId : targetUserId;
      const user2 = currentUserId < targetUserId ? targetUserId : currentUserId;
      const targetUser = onlineUsers.find(u => u.id === targetUserId);
      const targetUserNickname = targetUser?.profiles?.nickname || '相手';
      const { data: existingRoom } = await supabase.from('chat_rooms').select('id').eq('user1_id', user1).eq('user2_id', user2).single();
      let roomId = existingRoom?.id;
      if (!roomId) {
        const { data: newRoom, error: newRoomError } = await supabase.from('chat_rooms').insert({ user1_id: user1, user2_id: user2 }).select('id').single();
        if (newRoomError || !newRoom) { toast.error('ルーム作成失敗'); return; }
        roomId = newRoom.id;
      }
      const { data: request, error: requestError } = await supabase.from('chat_requests').insert({ sender_id: currentUser.id, receiver_id: targetUserId, room_id: roomId, status: 'pending' }).select('id').single();
      if (requestError || !request) { toast.error('リクエスト送信失敗'); return; }
      setWaitingForRequestId(request.id);
      setWaitingForRoomId(roomId);
      setWaitingForTargetNickname(targetUserNickname);
      toast.success(`${targetUserNickname} にリクエストを送信しました。`);
    } catch (e) {
      if (e instanceof Error) toast.error(`チャット開始エラー: ${e.message}`);
      else toast.error('チャット開始中に不明なエラーが発生しました。');
    } finally {
      setInitiatingChatWith(null);
    }
  };

  // ユーザーの「今日の話題」への返答を保存する関数
  const handleSaveTopic = async () => {
    if (!currentUser) {
      toast.error('認証されていません。');
      return;
    }
    setIsSavingTopic(true);
    try {
      const { error } = await supabase.from('profiles').update({ topic: currentUserTopicInput }).eq('user_id', currentUser.id);
      if (error) {
        throw error;
      }
      toast.success('今日の話題への返答を保存しました！');
    } catch (error) {
      console.error('Error saving topic:', error);
      toast.error('返答の保存に失敗しました。');
    } finally { setIsSavingTopic(false); }
  };
  const handleChatRequestResponse = async (accepted: boolean) => {
    setIsRequestModalOpen(false); 
    if (!processingRequest) return;
    setIsAcceptingOrRejecting(true);
    const { id, room_id } = processingRequest;
    if (accepted) {
      const { error } = await supabase.from('chat_requests').update({ status: 'accepted' }).eq('id', id);
      if (error) { toast.error('承諾処理失敗。'); }
      else { toast.success(`${modalSenderNickname}からのリクエストを承諾！`); router.push(`/chat/${room_id}`); }
    } else {
      const { error } = await supabase.from('chat_requests').update({ status: 'rejected' }).eq('id', id);
      if (error) { toast.error('拒否処理失敗。'); }
      else { toast(`${modalSenderNickname}からのリクエストを拒否。`); }
    }
    setProcessingRequest(null); setModalSenderNickname(''); setIsAcceptingOrRejecting(false);
  };

  const handleRequestAcceptedModalClose = () => {
    const roomIdToNavigate = waitingForRoomId;
    setIsRequestAcceptedModalOpen(false);
    setWaitingForRequestId(null); setWaitingForRoomId(null); setWaitingForTargetNickname(null);
    if (roomIdToNavigate) {
      setTimeout(() => router.push(`/chat/${roomIdToNavigate}`), 50);
    } else {
      toast.error('ルーム情報が見つかりません。');
    }
  };

  if (!hasMounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <>
      <Toaster position="top-center" />
      <ChatRequestModal isOpen={isRequestModalOpen} onClose={handleChatRequestResponse} senderNickname={modalSenderNickname} isLoading={isAcceptingOrRejecting} />
      <RequestAcceptedModal isOpen={isRequestAcceptedModalOpen} onClose={handleRequestAcceptedModalClose} accepterNickname={waitingForTargetNickname || '相手'} />

      <div className="w-full min-h-screen bg-[#F0EAD6]">
        <div className="fixed inset-0 bg-cover bg-center opacity-90" style={{ backgroundImage: "url('/cafe-bg.jpg')" }}></div>
        <div className="fixed inset-0 bg-gradient-to-b from-white/30 via-[#F5F0E8]/20 to-[#F0EAD6]/50"></div>
        
        <div className="relative z-10 h-screen overflow-y-auto overflow-x-hidden">
          <div className="flex flex-col items-center min-h-full px-4">
            <header className="w-full max-w-6xl mx-auto my-8 sm:my-12 flex justify-between items-center p-4">
              <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-wider cursor-pointer [text-shadow:_2px_3px_5px_rgb(0_0_0_/_0.5)]" onClick={() => router.push('/')}>Momentos <span className="text-[#FFD700]">Café</span></h1>
              <div className="relative">
                <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2 rounded-full text-white/80 hover:text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black/50 focus:ring-white/50 transition-colors" aria-label="メニューを開く">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-7 h-7"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" /></svg>
                </button>
                <Transition show={isMenuOpen} as={Fragment} enter="transition ease-out duration-200" enterFrom="transform opacity-0 scale-95" enterTo="transform opacity-100 scale-100" leave="transition ease-in duration-150" leaveFrom="transform opacity-100 scale-100" leaveTo="transform opacity-0 scale-95">
                  <div className="absolute right-0 mt-2 w-60 origin-top-right bg-white rounded-xl shadow-2xl ring-1 ring-black ring-opacity-5 focus:outline-none py-2 z-30" role="menu" onMouseLeave={() => setIsMenuOpen(false)}>
                    {[
                      { label: 'プロフィール', href: '/profile', icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 mr-3 text-gray-400"><path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.095a1.23 1.23 0 00.41-1.412A9.99 9.99 0 0010 12.75a9.99 9.99 0 00-6.535 1.743z" /></svg> },
                      { label: 'チャット履歴', href: '/chat-history', icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 mr-3 text-gray-400"><path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10zm0 5.25a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z" clipRule="evenodd" /></svg> },
                      { label: '設定', action: () => toast('設定機能は準備中です。', {icon: '⚙️'}), icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 mr-3 text-gray-400"><path fillRule="evenodd" d="M11.078 2.25c-.217-.065-.439-.1-.678-.1H9.6c-.24 0-.46.035-.678.1S8.573 2.573 8.373 2.738a4.5 4.5 0 00-2.638 2.638c-.166.2-.28.432-.347.678S5.25 6.401 5.25 6.64V9.6c0 .24.035.46.1.678s.18.421.347.678a4.5 4.5 0 002.638 2.638c.2.165.432.28.678.347s.401.1.64.1H10.4c.24 0 .46-.035.678-.1s.421-.18.678-.347a4.5 4.5 0 002.638-2.638c.165-.2.28-.432-.347-.678s.1-.401.1-.64V6.64c0-.24-.035-.46-.1-.678s-.18-.421-.347-.678a4.5 4.5 0 00-2.638-2.638c-.2-.165-.432-.28-.678-.347S10.64 2.25 10.4 2.25h-.801c-.24 0-.46.035-.678.1zM10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" clipRule="evenodd" /><path d="M10 6.5a.5.5 0 00-.5.5v3a.5.5 0 001 0v-3a.5.5 0 00-.5-.5z" /></svg> },
                    ].map((item) => (
                      <button key={item.label} onClick={() => { if (item.href) router.push(item.href); if (item.action) item.action(); setIsMenuOpen(false);}}
                        className="w-full text-left px-4 py-3 text-sm text-gray-800 hover:bg-gray-100 hover:text-gray-900 flex items-center transition-colors rounded-lg" role="menuitem">
                        {item.icon} <span>{item.label}</span>
                      </button>
                    ))}
                    <div className="border-t border-gray-200 mx-2 my-1"></div>
                    <button onClick={async () => {
                        setIsMenuOpen(false);
                        if (currentUser) {
                          try { await supabase.from('user_statuses').upsert({ user_id: currentUser.id, is_online: false, last_active_at: new Date().toISOString() }, { onConflict: 'user_id' }); }
                          catch (e: unknown) { console.error(e); }
                        }
                        const { error } = await supabase.auth.signOut();
                        if (error) toast.error(`ログアウト失敗: ${error.message}`);
                      }}
                      className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 hover:text-red-700 flex items-center transition-colors rounded-lg" role="menuitem">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 mr-3"><path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 015.25 2h5.5A2.25 2.25 0 0113 4.25v2a.75.75 0 01-1.5 0v-2A.75.75 0 0010.75 3h-5.5A.75.75 0 004.5 3.75v12.5c0 .414.336.75.75.75h5.5a.75.75 0 00.75-.75v-2a.75.75 0 011.5 0v2A2.25 2.25 0 0110.75 18h-5.5A2.25 2.25 0 013 15.75V4.25z" clipRule="evenodd" /><path fillRule="evenodd" d="M6 10a.75.75 0 01.75-.75h9.546l-1.048-1.047a.75.75 0 111.06-1.06l2.5 2.5a.75.75 0 010 1.06l-2.5 2.5a.75.75 0 11-1.06-1.06L16.296 10.75H6.75A.75.75 0 016 10z" clipRule="evenodd" /></svg>
                      <span>ログアウト</span>
                    </button>
                  </div>
                </Transition>
              </div>
            </header>
            
            <div className="z-10 mb-2 sm:mb-12 max-w-3xl mx-auto text-center">
              <p className="text-xl sm:text-2xl leading-relaxed text-white font-medium [text-shadow:_1px_1px_3px_rgb(0_0_0_/_0.7)]">
                オンラインのカフェでちょっと一息。<br />気になるあの人に、声をかけてみませんか？
              </p>
            </div>

            <main className="w-full flex flex-col items-center">
              <div className="relative w-full max-w-4xl mt-12">
                <div className="w-full max-w-lg h-48 bg-contain bg-no-repeat bg-center flex flex-col items-center justify-center text-center p-4 absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none" style={{ backgroundImage: "url('/wood_kanban_01.png')" }}>
                  <h2 className="text-2xl sm:text-3xl font-bold text-white [text-shadow:_2px_2px_4px_rgb(0_0_0_/_0.6)]"></h2>
                </div>
                <div className="w-full bg-white/40 backdrop-blur-xl rounded-2xl shadow-lg border-4 border-[#5C3A21] pt-24 p-6">
                  <p className="text-sm text-gray-600 text-center mb-6 -mt-16"></p>
                  <div className="flex items-center justify-center space-x-4 mb-4 pb-4 border-b border-white/20">
                    <span className={`font-medium transition-colors ${chatMode === 'online' ? 'text-gray-800' : 'text-gray-500'}`}>オンライン</span>
                    <button onClick={() => setChatMode(prev => prev === 'online' ? 'offline' : 'online')} type="button" className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#A0522D] focus:ring-offset-2 ${chatMode === 'online' ? 'bg-[#A0522D]' : 'bg-gray-300'}`} role="switch" aria-checked={chatMode === 'online'}>
                      <span className="sr-only">Use setting</span>
                      <span aria-hidden="true" className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${chatMode === 'online' ? 'translate-x-0' : 'translate-x-5'}`} />
                    </button>
                    <span className={`font-medium transition-colors ${chatMode === 'offline' ? 'text-gray-800' : 'text-gray-500'}`}>オフライン</span>
                  </div>

                  {/* 今日の話題と一言入力欄 */}
                  <div className="mb-6">
                    <button
                      onClick={() => setIsTopicSectionOpen(!isTopicSectionOpen)}
                      className="w-full flex justify-between items-center p-3 bg-white/50 hover:bg-white/70 rounded-lg border border-white/50 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#A0522D] focus:ring-offset-1 focus:ring-offset-transparent transition-colors duration-150"
                    >
                      <h3 className="text-md font-semibold text-[#5C3A21]">今日の話題: {todayTopicDisplay}</h3>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 text-[#5C3A21] transition-transform duration-200 ${isTopicSectionOpen ? 'rotate-180' : ''}`}>
                        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.23 8.29a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                      </svg>
                    </button>
                    <Transition
                      show={isTopicSectionOpen}
                      enter="transition-all ease-out duration-300"
                      enterFrom="opacity-0 max-h-0"
                      enterTo="opacity-100 max-h-96" // 十分な高さを確保
                      leave="transition-all ease-in duration-200"
                      leaveFrom="opacity-100 max-h-96"
                      leaveTo="opacity-0 max-h-0"
                    >
                      <div className="mt-2 p-4 bg-white/60 rounded-lg border border-white/50 shadow-inner">
                        <input
                          type="text"
                          className="w-full p-2.5 text-sm text-gray-700 bg-white/80 rounded-md border border-gray-300 focus:outline-none focus:ring-1 focus:ring-[#A0522D]"
                          placeholder="今日の話題について一言どうぞ..."
                          value={currentUserTopicInput}
                          onChange={(e) => setCurrentUserTopicInput(e.target.value)}
                          disabled={!currentUser || isSavingTopic}
                        />
                        <button onClick={handleSaveTopic} disabled={!currentUser || isSavingTopic} className={`mt-3 px-4 py-2 bg-[#4a2e19] text-white font-semibold rounded-md shadow hover:bg-[#6d4c3a] transition duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#6F4E37] ${(!currentUser || isSavingTopic) ? 'opacity-60 cursor-not-allowed' : ''}`}>
                          {isSavingTopic ? '保存中...' : '今日の話題を保存'}
                        </button>
                      </div>
                    </Transition>
                  </div>
                  <div className="min-h-[300px] pt-2">
                    {!hasMounted ? ( 
                      <div className="w-full text-center py-12">
                        <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-t-2 border-[#6F4E37]"></div>
                        <p className="text-gray-500 text-md mt-3">モードを読み込み中...</p>
                      </div>
                    ) : chatMode === 'online' ? (
                      <>
                        {!loading && onlineUsers.length > 0 ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                            {onlineUsers.map((user) => (
                              user.id === currentUser?.id ? null : ( 
                                <div key={user.id} className="bg-white/50 backdrop-blur-md rounded-xl p-4 flex flex-col border border-white/50 shadow-md transition-all duration-300 hover:shadow-lg">
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
                                      <button onClick={() => !initiatingChatWith && handleInitiateChat(user.id)} disabled={!!initiatingChatWith} className={`px-3 py-1 text-xs bg-[#4a2e19] text-white font-semibold rounded-full shadow hover:bg-[#6d4c3a] transition duration-200 focus:outline-none focus:ring-1 focus:ring-offset-1 focus:ring-[#6F4E37] ${initiatingChatWith ? 'opacity-60 cursor-not-allowed' : ''}`}>
                                        話しかける
                                      </button>
                                    </div>
                                  </div>
                                  <div className="text-xs text-gray-700 border-t border-gray-900/10 pt-2 mt-2 flex-grow min-h-[50px]">
                                    <p className="font-medium text-gray-600 truncate">今日の話題: <span className="font-normal">{user.profiles?.topic || 'まだありません'}</span></p>
                                    <p className="mt-1 line-clamp-2">自己紹介: {user.profiles?.bio || '未設定'}</p> {/* bio は自己紹介文 */}
                                  </div>
                                </div>
                              )
                            ))}
                          </div>
                        ) : ( !loading && onlineUsers.length === 0 ? (
                          <div className="text-center py-12">
                            <p className="text-5xl mb-3">☕</p>
                            <p className="text-gray-600 text-md">現在、空席はありません。</p>
                            <p className="text-gray-500 text-xs mt-1">少し待ってから再度ご確認ください。</p>
                          </div>
                        ) : ( 
                          <div className="w-full text-center py-12">
                            <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-t-2 border-[#6F4E37]"></div>
                            <p className="text-gray-500 text-md mt-3">情報を読み込み中...</p>
                          </div>
                        ) )}
                      </>
                    ) : (
                      <div>
                        {loadingPartners ? (
                          <div className="w-full text-center py-12">
                            <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-t-2 border-[#6F4E37]"></div>
                            <p className="text-gray-500 text-md mt-3">お席の準備中...</p>
                          </div>
                        ) : chatPartners.length > 0 ? (
                          <div className="space-y-4">
                            {chatPartners.map((partner) => (
                              <Link href={`/chat/${partner.roomId}`} key={partner.roomId} className="block bg-white/50 backdrop-blur-md rounded-lg p-4 shadow-md hover:shadow-lg transition-shadow">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center space-x-3">
                                    <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center font-bold text-gray-600 shrink-0">
                                      {partner.otherUserNickname ? partner.otherUserNickname.charAt(0).toUpperCase() : '?'}
                                    </div>
                                    <div>
                                      <div className="flex items-center mb-0.5">
                                        <p className="font-semibold text-md text-[#5C3A21]">{partner.otherUserNickname}</p>
                                        <ChatBubbleLeftRightIcon className="w-4 h-4 ml-1.5 text-gray-400 shrink-0" title="以前話した人" />
                                      </div>
                                      <div className="flex items-center text-xs text-pink-500 mb-1">
                                        <HeartIcon className="w-3.5 h-3.5 mr-0.5 text-pink-400 shrink-0" />
                                        <span>親密度: {partner.affectionLevel}</span>
                                      </div>
                                      <p className="text-xs text-gray-600 font-medium">今日の話題: <span className="font-normal text-gray-500 truncate max-w-[150px] sm:max-w-[180px] inline-block">{partner.otherUserTopic || 'まだありません'}</span></p>
                                      <p className="text-xs text-gray-500 truncate max-w-[150px] sm:max-w-xs mt-0.5">
                                        自己紹介: {partner.otherUserBio || '未設定'} {/* otherUserBio は自己紹介文 */}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex flex-col items-end space-y-1 text-xs shrink-0">
                                    <div className={`flex items-center space-x-1 ${partner.isOnline ? 'text-green-600' : 'text-gray-400'}`}>
                                      <span className={`w-2 h-2 rounded-full inline-block ${partner.isOnline ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></span>
                                      <span>{partner.isOnline ? 'オンライン' : 'オフライン'}</span>
                                    </div>
                                    <span className="text-gray-400">
                                      {partner.lastMessageAt ? new Date(partner.lastMessageAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}
                                    </span>
                                  </div>
                                </div>
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-12">
                            <p className="text-5xl mb-3">💬</p>
                            <p className="text-gray-600 text-md">まだ会話した相手がいません。</p>
                            <p className="text-gray-500 text-xs mt-1">オンラインモードで新しい出会いを探しましょう。</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </main>
            <footer className="mt-auto mb-8 text-center text-sm text-white/60 pt-8">
              <p>&copy; {new Date().getFullYear()} Momentos Café. All rights reserved.</p>
            </footer>
          </div>
        </div>
      </div>
    </>
  );
}