// lib/hooks/useLocalStorageState.ts
'use client';

import { useState, useEffect, useCallback } from 'react';

function useLocalStorageState<T>(
  key: string,
  defaultValue: T
): [T, React.Dispatch<React.SetStateAction<T>>] {
  
  const [state, setState] = useState<T>(() => {
    // この関数は、クライアントサイドでの初回レンダリング時に一度だけ実行されます。
    // サーバーサイドでは実行されないように、windowオブジェクトの存在を確認します。
    if (typeof window === 'undefined') {
      return defaultValue;
    }
    try {
      const storedValue = window.localStorage.getItem(key);
      // localStorageに保存された値があればそれを使い、なければ初期値を使います。
      return storedValue ? JSON.parse(storedValue) : defaultValue;
    } catch (error) {
      console.error('Error reading from localStorage for key “' + key + '”:', error);
      return defaultValue;
    }
  });

  // このeffectは、stateが変更されるたびにlocalStorageに値を書き込みます。
  useEffect(() => {
    // サーバーサイドでは実行しないようにします。
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(key, JSON.stringify(state));
      } catch (error) {
        console.error('Error writing to localStorage for key “' + key + '”:', error);
      }
    }
  }, [key, state]); // keyまたはstateが変わった時のみ実行

  return [state, setState];
}

export default useLocalStorageState;