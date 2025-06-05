// types.ts (例: lib/types.ts やプロジェクトルート/types.ts)

export interface Profile { // もし Profile 型も共有するなら
    nickname: string | null;
    // ... 他のプロパティ
  }
  
  export interface Message {
    id: string;
    sender_id: string;
    content: string;
    created_at: string;
    profiles: { nickname: string | null; } | null;
  }
  export interface MessageLogModalProps {
    isOpen: boolean;
    onClose: () => void;
    messages: Message[];
    currentUserId: string;
    otherUserNickname: string;
  }
  export interface ChatRoomInfo { user1_id: string; user2_id: string; }
  export interface UserLeftPayload { userIdWhoLeft: string; nicknameWhoLeft?: string; }
  // 他の共有したい型定義もここに追加
  // export interface ChatRoomInfo { ... }
  // export interface UserLeftPayload { ... }