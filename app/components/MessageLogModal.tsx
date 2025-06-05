// app/components/MessageLogModal.tsx
'use client';

import { Dialog, Transition } from '@headlessui/react';
import { Fragment, useRef, useEffect } from 'react';
//import { Message,  } from '../../app/chat/[roomId]/page'; // ★ 名前付きインポート
import { Message, Profile, ChatRoomInfo, UserLeftPayload, MessageLogModalProps } from '@/lib/types'; // '@/types' は types.ts への正しいパスに置き換えてください


export default function MessageLogModal({
  isOpen,
  onClose,
  messages,
  currentUserId,
  otherUserNickname,
}: MessageLogModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null); // 自動スクロール用

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => { // モーダルが開いたときやメッセージが更新されたときに最下部へスクロール
    if (isOpen) {
      scrollToBottom();
    }
  }, [isOpen, messages]);

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog
        as="div"
        className="relative z-50"
        initialFocus={closeButtonRef}
        onClose={onClose}
      >
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/40 backdrop-blur-md" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-lg h-[80vh] transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all flex flex-col">
                <Dialog.Title
                  as="h3"
                  className="text-lg font-medium leading-6 text-gray-900 border-b pb-3 mb-3"
                >
                  {otherUserNickname} さんとのメッセージログ
                </Dialog.Title>
                
                {/* メッセージリスト */}
                <div className="flex-grow overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                  {messages.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">メッセージ履歴はありません。</p>
                  ) : (
                    messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.sender_id === currentUserId ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] p-2.5 rounded-lg shadow-sm ${
                            msg.sender_id === currentUserId
                              ? 'bg-blue-500 text-white rounded-br-none'
                              : 'bg-gray-100 text-gray-800 rounded-bl-none'
                          }`}
                        >
                          {msg.sender_id !== currentUserId && ( // 相手のメッセージのみニックネーム表示
                             <p className="text-xs font-medium text-gray-500 mb-0.5">
                               {msg.profiles?.nickname || otherUserNickname}
                             </p>
                          )}
                          <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                          <p className={`text-xs mt-1 ${msg.sender_id === currentUserId ? 'text-blue-200' : 'text-gray-400'} text-right`}>
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} /> {/* 自動スクロール用の空要素 */}
                </div>

                <div className="mt-5 pt-4 border-t">
                  <button
                    type="button"
                    className="inline-flex justify-center rounded-md border border-transparent bg-blue-100 px-4 py-2 text-sm font-medium text-blue-900 hover:bg-blue-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                    onClick={onClose}
                    ref={closeButtonRef}
                  >
                    閉じる
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}