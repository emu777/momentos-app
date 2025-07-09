// GameCanvas.js
import React, { useState, useEffect, useRef } from 'react';
import { Stage, Layer, Rect, Image as KonvaImage } from 'react-konva';
import useImage from 'use-image';
import { supabase } from '../lib/supabase';
import PlayerAvatar from './PlayerAvatar';
import useWindowSize from '../hooks/useWindowSize';
import VirtualDPad from './VirtualDPad'; // 作成したコンポーネントをインポート
import { useAuth } from '../contexts/AuthContext';
import GameMenu from './GameMenu'; // メニューコンポーネントをインポート

const CAFE_MAP_WIDTH = 800;
const CAFE_MAP_HEIGHT = 600;
const CHAT_UI_HEIGHT = 220; // チャットUIのおおよその高さ
const PLAYER_SIZE = 32;

const GameCanvas = () => {
  const { session } = useAuth();
  const [myPlayer, setMyPlayer] = useState(null);
  const [otherPlayers, setOtherPlayers] = useState({});
  const [chatMessages, setChatMessages] = useState([]);
  const [newChatMessage, setNewChatMessage] = useState('');
  const [keysPressed, setKeysPressed] = useState(new Set());
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  // アニメーションループ内で最新のステートを参照するためのRef
  const keysPressedRef = useRef(keysPressed);
  const playerRef = useRef(myPlayer);
  const animationFrameId = useRef(null);
  // DB更新を間引くためのRef
  const updateTimeoutRef = useRef(null);

  const { width: windowWidth, height: windowHeight } = useWindowSize();
  const [cafeBgImage] = useImage('/assets/cafe_background.png');

  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  // プレイヤーデータとリアルタイム購読
  useEffect(() => {
    if (!session) {
      return;
    }

    // 1. 初期データを並列で取得してパフォーマンスを向上
    const fetchInitialData = async () => {
      const myProfilePromise = supabase
        .from('profiles')
        .select('*')
        .eq('user_id', session.user.id)
        .single();

      const myPlayerStatePromise = supabase
        .from('player_states')
        .select('*')
        .eq('user_id', session.user.id)
        .single();

      const otherProfilesPromise = supabase
        .from('profiles')
        .select('id, user_id, nickname, avatar_config');

      const otherPlayerStatesPromise = supabase
        .from('player_states')
        .select('user_id, x_pos, y_pos');

      const [
        { data: profile, error: profileError },
        { data: playerState, error: stateError },
        { data: otherProfiles, error: otherProfilesError },
        { data: otherPlayerStates, error: otherStatesError },
      ] = await Promise.all([
        myProfilePromise,
        myPlayerStatePromise,
        otherProfilesPromise,
        otherPlayerStatesPromise,
      ]);

      // エラーハンドリングをより詳細に
      if (profileError) {
        console.error('Error fetching initial data (my profile):', { profileError });
        return;
      }
      if (otherProfilesError) {
        console.error('Error fetching initial data (other profiles):', { otherProfilesError });
        return;
      }
      if (otherStatesError) {
        console.error('Error fetching initial data (other states):', { otherStatesError });
        return;
      }

      // 自分のプレイヤー情報をセットアップ
      if (stateError && stateError.code === 'PGRST116') { // プレイヤー状態がまだ存在しない場合
        const { data: newPlayerState, error: insertError } = await supabase
          .from('player_states')
          .insert({ user_id: session.user.id, x_pos: 100, y_pos: 100 })
          .select()
          .single();
        if (insertError) {
          console.error('Error inserting player state:', insertError);
        } else {
          // profileのidを優先するために、マージの順序を修正
          setMyPlayer({ ...newPlayerState, ...profile });
        }
      } else if (stateError) {
        console.error('Error fetching player state:', stateError);
      } else {
        // profileのidを優先するために、マージの順序を修正
        setMyPlayer({ ...playerState, ...profile });
      }

      // 他のプレイヤー情報をセットアップ
      const combinedPlayers = {};
      otherProfiles.forEach(p => {
        const state = otherPlayerStates.find(s => s.user_id === p.user_id);
        if (state && p.user_id !== session.user.id) {
          // p (profile) のidを優先するために、マージの順序を修正
          combinedPlayers[p.user_id] = { ...state, ...p };
        }
      });
      setOtherPlayers(combinedPlayers);
    };

    fetchInitialData();

    // 2. リアルタイム購読を設定
    const playerSubscription = supabase
      .channel('player_positions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'player_states' }, payload => {
        const updatedPlayerState = payload.new;
        if (updatedPlayerState.user_id === session.user.id) {
          return;
        }
        setOtherPlayers(prev => ({
          ...prev,
          [updatedPlayerState.user_id]: {
            ...prev[updatedPlayerState.user_id],
            ...updatedPlayerState,
          },
        }));
      })
      .subscribe();

    const chatSubscription = supabase
      .channel('chat_messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, async payload => {
        const newMessage = payload.new;
        const { data: senderProfile, error: profileError } = await supabase
          .from('profiles')
          .select('nickname')
          .eq('user_id', newMessage.user_id)
          .single();

        if (profileError) {
          console.error('Error fetching sender nick_name for chat:', profileError);
          return;
        }

        const messageWithUsername = {
          ...newMessage,
          username: senderProfile?.nickname || 'Unknown',
        };

        setChatMessages(prev => [...prev, messageWithUsername].slice(-100));

        setOtherPlayers(prev => {
          const updatedPlayers = { ...prev };
          if (updatedPlayers[newMessage.user_id]) {
            updatedPlayers[newMessage.user_id].latestMessage = newMessage.message;
            setTimeout(() => {
              setOtherPlayers(current => {
                const temp = { ...current };
                if (temp[newMessage.user_id]) {
                  delete temp[newMessage.user_id].latestMessage;
                }
                return temp;
              });
            }, 5000);
          }
          return updatedPlayers;
        });
      })
      .subscribe();

    // 3. クリーンアップ関数
    return () => {
      playerSubscription.unsubscribe();
      chatSubscription.unsubscribe();
    };
  }, [session]);

  // キーボード入力のハンドリング
  useEffect(() => {
    const handleKeyDown = (e) => setKeysPressed(prev => new Set(prev).add(e.key));
    const handleKeyUp = (e) => {
      setKeysPressed(prev => {
        const next = new Set(prev);
        next.delete(e.key);
        return next;
      });
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // D-pad用のキー操作関数
  const handleVirtualKeyPress = (key) => {
    setKeysPressed(prev => new Set(prev).add(key));
  };

  const handleVirtualKeyRelease = (key) => {
    setKeysPressed(prev => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  // ゲームループ (requestAnimationFrameによるスムーズな描画)
  useEffect(() => {
    // Refを常に最新の状態に保つ
    keysPressedRef.current = keysPressed;
    playerRef.current = myPlayer;
  });

  useEffect(() => {
    const gameLoop = () => {
      if (playerRef.current) {
        const keys = keysPressedRef.current;
        const moveAmount = 5; // 移動量を調整して滑らかに
        let newX = playerRef.current.x_pos;
        let newY = playerRef.current.y_pos;
        let moved = false;

        if (keys.has('ArrowUp')) { newY -= moveAmount; moved = true; }
        if (keys.has('ArrowDown')) { newY += moveAmount; moved = true; }
        if (keys.has('ArrowLeft')) { newX -= moveAmount; moved = true; }
        if (keys.has('ArrowRight')) { newX += moveAmount; moved = true; }

        if (moved) {
          newX = Math.max(0, Math.min(CAFE_MAP_WIDTH - PLAYER_SIZE, newX));
          newY = Math.max(0, Math.min(CAFE_MAP_HEIGHT - PLAYER_SIZE, newY));
          setMyPlayer(prev => ({ ...prev, x_pos: newX, y_pos: newY }));
        }
      }
      animationFrameId.current = requestAnimationFrame(gameLoop);
    };

    animationFrameId.current = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animationFrameId.current);
  }, []); // このeffectはマウント時に一度だけ実行

  // データベース更新の最適化（スロットリング）
  useEffect(() => {
    if (!myPlayer) return;

    if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current);

    updateTimeoutRef.current = setTimeout(async () => {
      await supabase
        .from('player_states')
        .update({ x_pos: myPlayer.x_pos, y_pos: myPlayer.y_pos, last_seen: new Date().toISOString() })
        .eq('user_id', myPlayer.user_id);
    }, 100); // 100msごとに入力をまとめてDBに送信

  }, [myPlayer?.x_pos, myPlayer?.y_pos]); // 位置が変わった時だけ実行

  // チャット送信処理
  const handleSendChatMessage = async () => {
    if (!session || !newChatMessage.trim()) return;

    const { error } = await supabase
      .from('chat_messages')
      .insert({ user_id: session.user.id, message: newChatMessage.trim() });

    if (error) {
      console.error('Error sending chat message:', error);
    } else {
      setNewChatMessage('');
      setChatMessages(prev => [...prev, {
        user_id: session.user.id,
        username: myPlayer?.nickname || 'Me',
        message: newChatMessage.trim(),
        created_at: new Date().toISOString(),
      }].slice(-100));
      setMyPlayer(prev => ({ ...prev, latestMessage: newChatMessage.trim() }));
      setTimeout(() => {
        setMyPlayer(current => {
          const temp = { ...current };
          if (temp) {
            delete temp.latestMessage;
          }
          return temp;
        });
      }, 5000);
    }
  };

  if (!session) {
    return <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">Loading or redirecting...</div>;
  }

  // 利用可能なスペースに基づいてキャンバスのスケールを計算
  // 画面サイズが取得できていない、またはチャットUIより小さい場合は0として扱う
  const availableWidth = windowWidth || 0;
  const availableHeight = Math.max(0, (windowHeight || 0) - CHAT_UI_HEIGHT);

  // ゼロ除算を避け、常に正のスケール値を計算する
  const scaleX = availableWidth > 0 ? availableWidth / CAFE_MAP_WIDTH : 0;
  const scaleY = availableHeight > 0 ? availableHeight / CAFE_MAP_HEIGHT : 0;
  const scale = Math.max(0, Math.min(scaleX, scaleY, 1)); // 1倍以上には拡大せず、負の値も防ぐ
  const scaledWidth = CAFE_MAP_WIDTH * scale;
  const scaledHeight = CAFE_MAP_HEIGHT * scale;

  return ( // GameCanvasコンポーネントは、ゲームキャンバス部分のみをレンダリング
    <div className="h-full w-full flex flex-col bg-gray-900 select-none">
      {/* ゲームエリア */}
      <div className="flex-grow relative flex items-center justify-center overflow-hidden">
        {/* メニューボタンをゲームエリアの右上に配置 */}
        <GameMenu />
        {/* isTouchDeviceのチェックをStageの外に移動 */}
        {isTouchDevice && (
          <VirtualDPad
            onKeyPress={handleVirtualKeyPress}
            onKeyRelease={handleVirtualKeyRelease}
          />
        )}
        {/* KonvaのStage自体にスケーリングを適用 */}
        <Stage width={scaledWidth} height={scaledHeight} scaleX={scale} scaleY={scale}>
          <Layer>
            {cafeBgImage && (
              <KonvaImage image={cafeBgImage} x={0} y={0} width={CAFE_MAP_WIDTH} height={CAFE_MAP_HEIGHT} />
            )}
            {!cafeBgImage && (
              <Rect x={0} y={0} width={CAFE_MAP_WIDTH} height={CAFE_MAP_HEIGHT} fill="#6B4226" />
            )}

            {Object.values(otherPlayers).map((player) => (
              <PlayerAvatar key={player.id} player={player} isMe={false} />
            ))}

            {myPlayer && (
              <PlayerAvatar key={myPlayer.id} player={myPlayer} isMe={true} />
            )}
          </Layer>
        </Stage>
      </div>

      {/* チャットUI */}
      <div className="w-full bg-gray-800 p-4 shadow-lg flex-shrink-0" style={{ height: `${CHAT_UI_HEIGHT}px` }}>
        <h2 className="text-xl font-semibold mb-2">チャット</h2>
        <div className="h-40 overflow-y-auto border border-gray-700 p-2 rounded mb-2 bg-gray-900">
          {chatMessages.map((msg) => (
            <p key={`${msg.created_at}-${msg.user_id}`} className="text-sm text-white">
              <span className="font-bold">{msg.username}: </span>{msg.message}
            </p>
          ))}
        </div>
        <div className="flex">
          <input
            type="text"
            className="flex-grow p-2 rounded-l-lg border border-gray-700 bg-gray-900 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            placeholder="メッセージを入力..."
            value={newChatMessage}
            onChange={(e) => setNewChatMessage(e.target.value)}
            onKeyPress={(e) => { if (e.key === 'Enter') { handleSendChatMessage(); }}}
          />
          <button
            className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-r-lg transition duration-200"
            onClick={handleSendChatMessage}
          >
            送信
          </button>
        </div>
      </div>
    </div>
  );
};

export default GameCanvas;
