// app/components/RequestAcceptedModal.tsx
'use client';

import { Dialog, Transition } from '@headlessui/react';
import { Fragment, useRef } from 'react';

interface RequestAcceptedModalProps {
  isOpen: boolean;
  onClose: () => void; // OKボタンが押されたら呼ぶコールバック
  accepterNickname: string;
}

export default function RequestAcceptedModal({
  isOpen,
  onClose,
  accepterNickname,
}: RequestAcceptedModalProps) {
  const okButtonRef = useRef<HTMLButtonElement | null>(null);

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog
        as="div"
        className="relative z-50"
        initialFocus={okButtonRef}
        onClose={() => { /* 背景クリックやEscでは閉じない、またはonCloseを呼ぶか設計次第 */ }}
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
                  className="text-xl font-semibold leading-6 text-green-600" // 少しポジティブな色に
                >
                  リクエスト承諾！
                </Dialog.Title>
                <div className="mt-4">
                  <p className="text-sm text-gray-600">
                    <span className="font-medium text-gray-800">{accepterNickname}</span> さんがお誘いを受けてくれました！
                  </p>
                  <p className="text-sm text-gray-600 mt-2">
                    チャット画面へ移動します。
                  </p>
                </div>

                <div className="mt-8 flex justify-end">
                  <button
                    type="button"
                    className="inline-flex justify-center rounded-lg border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                    onClick={onClose} // ボタンクリックで onClose を呼ぶ
                    ref={okButtonRef}
                  >
                    チャットへ進む
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