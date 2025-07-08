import React from 'react';

const VirtualDPad = ({ onKeyPress, onKeyRelease }) => {
  const handleTouchStart = (key) => (e) => {
    e.preventDefault(); // 画面のスクロールやズームを防ぐ
    onKeyPress(key);
  };

  const handleTouchEnd = (key) => (e) => {
    e.preventDefault();
    onKeyRelease(key);
  };

  const buttonStyle = {
    width: '60px',
    height: '60px',
    border: '2px solid white',
    borderRadius: '50%',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    color: 'white',
    fontSize: '24px',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    userSelect: 'none',
    WebkitTapHighlightColor: 'transparent', // タップ時のハイライトを消す
  };

  const dpadContainerStyle = {
    position: 'absolute',
    bottom: '30px',
    left: '30px',
    display: 'grid',
    gridTemplateAreas: `
      '. up .'
      'left . right'
      '. down .'
    `,
    gap: '15px',
    zIndex: 10, // キャンバスより手前に表示
  };

  return (
    <div style={dpadContainerStyle}>
      <div
        style={{ ...buttonStyle, gridArea: 'up' }}
        onTouchStart={handleTouchStart('ArrowUp')}
        onTouchEnd={handleTouchEnd('ArrowUp')}
      >
        ▲
      </div>
      <div
        style={{ ...buttonStyle, gridArea: 'left' }}
        onTouchStart={handleTouchStart('ArrowLeft')}
        onTouchEnd={handleTouchEnd('ArrowLeft')}
      >
        ◀
      </div>
      <div
        style={{ ...buttonStyle, gridArea: 'right' }}
        onTouchStart={handleTouchStart('ArrowRight')}
        onTouchEnd={handleTouchEnd('ArrowRight')}
      >
        ▶
      </div>
      <div
        style={{ ...buttonStyle, gridArea: 'down' }}
        onTouchStart={handleTouchStart('ArrowDown')}
        onTouchEnd={handleTouchEnd('ArrowDown')}
      >
        ▼
      </div>
    </div>
  );
};

export default VirtualDPad;