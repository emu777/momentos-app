import React, { useState, useCallback } from 'react';

// モダンな見た目のためのSVGアイコン
const ChevronUpIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" style={{ width: '2rem', height: '2rem' }}>
    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
  </svg>
);
const ChevronDownIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" style={{ width: '2rem', height: '2rem' }}>
    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
  </svg>
);
const ChevronLeftIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" style={{ width: '2rem', height: '2rem' }}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
  </svg>
);
const ChevronRightIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" style={{ width: '2rem', height: '2rem' }}>
    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
  </svg>
);

// ボタンのコンポーネントをVirtualDPadの外に定義し、安定したコンポーネントにする
const DpadButton = ({ direction, gridArea, icon, isPressed, onTouchStart, onTouchEnd }) => {
  const style = {
    gridArea,
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    color: 'white',
    // ガラスのような質感（グラスモーフィズム）
    backgroundColor: isPressed ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.1)',
    backdropFilter: 'blur(5px)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    boxShadow: '0 4px 30px rgba(0, 0, 0, 0.1)',
    // ユーザー操作に関するスタイル
    userSelect: 'none',
    WebkitUserSelect: 'none',
    touchAction: 'manipulation',
    WebkitTapHighlightColor: 'transparent',
    // 押したときのアニメーション
    transition: 'background-color 100ms ease-out, transform 100ms ease-out',
    transform: isPressed ? 'scale(0.95)' : 'scale(1)',
  };

  return (
    <div
      style={style}
      onTouchStart={(e) => { e.preventDefault(); onTouchStart(direction); }}
      onTouchEnd={(e) => { e.preventDefault(); onTouchEnd(direction); }}
      onTouchCancel={(e) => { e.preventDefault(); onTouchEnd(direction); }} // タッチがキャンセルされた場合も考慮
    >
      {icon}
    </div>
  );
};

const VirtualDPad = ({ onKeyPress, onKeyRelease }) => {
  // 複数のキーが同時に押されることを想定し、Setで状態を管理する
  const [pressedKeys, setPressedKeys] = useState(new Set());

  // useCallbackで関数をメモ化し、不要な再生成を防ぐ
  const handleTouchStart = useCallback((key) => {
    setPressedKeys(prev => new Set(prev).add(key));
    onKeyPress(key);
  }, [onKeyPress]);

  const handleTouchEnd = useCallback((key) => {
    setPressedKeys(prev => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    onKeyRelease(key);
  }, [onKeyRelease]);

  const dpadContainerStyle = {
    position: 'absolute',
    bottom: '40px', // 位置を微調整
    left: '40px',
    display: 'grid',
    gridTemplateAreas: `
      '. up .'
      'left . right'
      '. down .'
    `,
    gap: '10px', // ボタン間のスペースを調整
    zIndex: 10, // キャンバスより手前に表示
  };

  return (
    <div style={dpadContainerStyle}>
      <DpadButton direction="ArrowUp" gridArea="up" icon={<ChevronUpIcon />} isPressed={pressedKeys.has('ArrowUp')} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} />
      <DpadButton direction="ArrowLeft" gridArea="left" icon={<ChevronLeftIcon />} isPressed={pressedKeys.has('ArrowLeft')} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} />
      <DpadButton direction="ArrowRight" gridArea="right" icon={<ChevronRightIcon />} isPressed={pressedKeys.has('ArrowRight')} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} />
      <DpadButton direction="ArrowDown" gridArea="down" icon={<ChevronDownIcon />} isPressed={pressedKeys.has('ArrowDown')} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} />
    </div>
  );
};

export default VirtualDPad;