// app/components/ChatRequestModal.tsx
'use client';

import { Dialog, Transition } from '@headlessui/react';
import { Fragment, useRef } from 'react';

interface ChatRequestModalProps {
  isOpen: boolean;
  onClose: (accepted: boolean) => void;
  senderNickname: string;
  isLoading?: boolean;
}

export default function ChatRequestModal({
  isOpen,
  onClose,
  senderNickname,
  isLoading = false,
}: ChatRequestModalProps) {
  const rejectButtonRef = useRef<HTMLButtonElement | null>(null);

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog 
        as="div" 
        className="relative z-50" 
        onClose={() => !isLoading && onClose(false)}
        initialFocus={rejectButtonRef}
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
          {/* ★ 背景オーバーレイの透明度を上げる (例: bg-black/30 から bg-black/20 へ) */}
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm" />
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
              {/* ★ モーダルの最大幅を小さくする (例: max-w-md から max-w-sm へ) */}
              <Dialog.Panel className="w-full max-w-sm transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <Dialog.Title
                  as="h3"
                  className="text-lg font-medium leading-6 text-gray-900" // ★ フォントサイズを少し調整 (text-xl から text-lg)
                >
                  チャットリクエスト
                </Dialog.Title>
                <div className="mt-3"> {/* ★ マージンを少し調整 (mt-4 から mt-3) */}
                  <p className="text-sm text-gray-600">
                    <span className="font-medium text-gray-800">{senderNickname}</span> さんからチャットリクエストが届いています。
                  </p>
                  <p className="text-sm text-gray-600 mt-1"> {/* ★ マージンを少し調整 (mt-2 から mt-1) */}
                    応答しますか？
                  </p>
                </div>

                <div className="mt-6 flex justify-end space-x-3"> {/* ★ マージンを少し調整 (mt-8 から mt-6)、ボタン間隔を space-x-3 に */}
                  <button
                    type="button"
                    className={`inline-flex justify-center rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`} // ★ ボタンサイズ調整 (px-3 py-1.5, text-xs)
                    onClick={() => onClose(false)}
                    disabled={isLoading}
                    ref={rejectButtonRef}
                  >
                    拒否する
                  </button>
                  <button
                    type="button"
                    className={`inline-flex justify-center rounded-md border border-transparent bg-blue-500 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`} // ★ ボタンサイズ調整、色を少し変更 (bg-blue-500, hover:bg-blue-600)
                    onClick={() => onClose(true)}
                    disabled={isLoading}
                  >
                    {isLoading ? '処理中...' : '承諾する'}
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