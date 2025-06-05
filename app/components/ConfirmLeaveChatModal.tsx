// app/components/ConfirmLeaveChatModal.tsx
'use client';

import { Dialog, Transition } from '@headlessui/react';
import { Fragment, useRef } from 'react';

interface ConfirmLeaveChatModalProps {
  isOpen: boolean;
  onConfirm: () => void; // 「はい」が押されたときのコールバック
  onCancel: () => void;  // 「いいえ」または背景クリックで閉じたときのコールバック
  partnerNickname: string;
}

export default function ConfirmLeaveChatModal({
  isOpen,
  onConfirm,
  onCancel,
  partnerNickname,
}: ConfirmLeaveChatModalProps) {
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null); // キャンセルボタンに初期フォーカス

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog
        as="div"
        className="relative z-50"
        initialFocus={cancelButtonRef} // キャンセルボタンに初期フォーカス
        onClose={onCancel} // 背景クリックやEscキーで閉じる場合はキャンセル扱い
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
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" />
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
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <Dialog.Title
                  as="h3"
                  className="text-xl font-semibold leading-6 text-gray-900"
                >
                  チャット終了の確認
                </Dialog.Title>
                <div className="mt-4">
                  <p className="text-sm text-gray-600">
                    <span className="font-medium text-gray-800">{partnerNickname}</span> さんとの会話を終了してカフェに戻ります。
                  </p>
                  <p className="text-sm text-gray-600 mt-2">
                    本当に宜しいですか？
                  </p>
                </div>

                <div className="mt-8 flex justify-end space-x-4">
                  <button
                    type="button"
                    className="inline-flex justify-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                    onClick={onCancel} // 「いいえ」で onCancel を呼ぶ
                    ref={cancelButtonRef}
                  >
                    いいえ（続ける）
                  </button>
                  <button
                    type="button"
                    className="inline-flex justify-center rounded-lg border border-transparent bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
                    onClick={onConfirm} // 「はい」で onConfirm を呼ぶ
                  >
                    はい（終了する）
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