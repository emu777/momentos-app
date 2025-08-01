// lib/types.ts (またはあなたのプロジェクトでの型定義ファイル)

// プロフィール情報
export interface Profile {
    user_id: string; // Supabaseのauth.users.idと一致するUUID
    nickname: string | null;
    age?: number;
    residence?: string;
    bio?: string;
    topic?: string;
    // 必要に応じて他のプロフィール項目 (例: avatar_url?: string;)
  }
  export interface UserWithProfile { // User と Profile を組み合わせた型
  id: string;
  last_active_at?: string; // user_statuses から
  profiles: Profile | null; // profiles テーブルのデータ
}
  // メッセージの型
  export interface Message {
    id: string;
    sender_id: string;
    content: string;
    created_at: string;
    profiles: { // 関連する送信者のプロフィール（一部）
      nickname: string | null;
    } | null; // profilesテーブルとのリレーションがない場合や、取得に失敗した場合を考慮
  }
  
  // チャットルームの情報
  export interface ChatRoomInfo {
    id?: string; // chat_roomsテーブルの主キー (取得時にはidも含めると良いでしょう)
    user1_id: string;
    user2_id: string;
    created_at?: string; // 必要であれば
    // 必要に応じて他のルーム情報
  }
  
  // チャットリクエストの型
  export interface ChatRequest {
    id: string;
    sender_id: string;
    receiver_id: string;
    room_id: string;
    status: 'pending' | 'accepted' | 'rejected';
    created_at: string;
  }
  
  // チャット履歴ページのリストアイテムの型
  export interface ChatHistoryItem {
  roomId: string;
  otherUserId: string;
  otherUserNickname: string;
  affectionLevel: number;
  otherUserBio?: string; // ★ パートナーの「自己紹介文」
  otherUserTopic?: string; // ★ パートナーの「今日の話題」への入力内容
  lastMessage: string | null;
  lastMessageAt: string | null;
  isOnline: boolean;
  unreadCount: number;
}
//今日の話題の型
  export interface DailyTopic {
  id: number;
  topic_text: string;
  created_at: string;
}

//話題サイクル管理の型

export interface TopicCycleStatus {
  config_id: string;
  current_topic_id: number | null;
  last_changed_at: string | null; // ISO形式の文字列
  used_topic_ids: number[];
}

  // 相手退出通知のペイロード型 (app/chat/[roomId]/page.tsx で使用)
  export interface UserLeftPayload {
    userIdWhoLeft: string;
    nicknameWhoLeft?: string; // オプショナル
  }
  export interface MessageLogModalProps {
    isOpen: boolean;
    onClose: () => void;
    messages: Message[];
    currentUserId: string;
    otherUserNickname: string;
  }
  // 他にもアプリケーション全体で共有したい型があればここに追加