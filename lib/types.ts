// lib/types.ts (またはあなたのプロジェクトでの型定義ファイル)

// プロフィール情報
export interface Profile {
    user_id: string; // Supabaseのauth.users.idと一致するUUID
    nickname: string | null;
    age?: number;
    residence?: string;
    bio?: string;
    // 必要に応じて他のプロフィール項目 (例: avatar_url?: string;)
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
    otherUserNickname: string | null;
    isOnline: boolean;
    // 必要に応じて最終メッセージやタイムスタンプなどを追加
    // last_message_content?: string | null;
    // last_message_at?: string | null;
    // unread_count?: number;
  }
  
  // オンラインユーザーリスト用の型 (app/page.tsx で使用)
  export interface UserWithProfile {
    id: string; // auth.users.id と同義
    last_active_at?: string;
    profiles: Profile | null; // Profile型を参照
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
  export interface MessageLogModalProps { // ★ これが MessageLogModal のプロパティ型
    isOpen: boolean;
    onClose: () => void;
    messages: Message[]; // ★ Message 型を参照
    currentUserId: string;
    otherUserNickname: string;
  }
  // 他にもアプリケーション全体で共有したい型があればここに追加