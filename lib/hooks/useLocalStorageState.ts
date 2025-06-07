// lib/hooks/useLocalStorageState.ts
'use client';

import { useState, useEffect } from 'react';

function useLocalStorageState<T>(
  key: string,
  defaultValue: T
): [T, React.Dispatch<React.SetStateAction<T>>] {
  
  const [state, setState] = useState<T>(defaultValue); // ★ サーバーでは必ずデフォルト値で初期化

  // ★ クライアントサイドでのみ、マウント後にlocalStorageから値を読み込む
  useEffect(() => {
    // このeffectはクライアントでの初回マウント時に一度だけ実行される
    try {
      const storedValue = window.localStorage.getItem(key);
      if (storedValue !== null) {
        setState(JSON.parse(storedValue));
      }
    } catch (error) {
      console.error('Error reading from localStorage for key “' + key + '”:', error);
    }
  }, [key]); // keyが変わることは通常ないが、依存配列に含めておく

  // ★ クライアントサイドでのみ、stateが変更されたらlocalStorageに書き込む
  useEffect(() => {
    // stateが初期値(defaultValue)のままの場合は書き込まない、という選択も可能
    // (ただし、ユーザーが意図してデフォルト値に戻した場合も書き込まれないため注意)
    // if (state !== defaultValue) {
      try {
        window.localStorage.setItem(key, JSON.stringify(state));
      } catch (error) {
        console.error('Error writing to localStorage for key “' + key + '”:', error);
      }
    // }
  }, [key, state]);

  return [state, setState];
}

export default useLocalStorageState;