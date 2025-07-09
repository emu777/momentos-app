import React, { useState, useRef, useCallback } from 'react';

const JOYSTICK_SIZE = 120;
const KNOB_SIZE = 50;
const DEAD_ZONE = 10;

const VirtualJoystick = ({ onKeyPress, onKeyRelease }) => {
  const [isActive, setIsActive] = useState(false);
  const [basePos, setBasePos] = useState({ x: 0, y: 0 });
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });
  const activeKeyRef = useRef(null);

  const handleTouchStart = (e) => {
    e.preventDefault();
    const touch = e.changedTouches[0];
    if (!touch) return;

    const pos = { x: touch.clientX, y: touch.clientY };
    setBasePos(pos);
    setKnobPos(pos);
    setIsActive(true);
  };

  const handleTouchMove = useCallback((e) => {
    e.preventDefault();
    if (!isActive) return;

    const touch = e.changedTouches[0];
    if (!touch) return;

    const currentPos = { x: touch.clientX, y: touch.clientY };
    
    const deltaX = currentPos.x - basePos.x;
    const deltaY = currentPos.y - basePos.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const angle = Math.atan2(deltaY, deltaX);

    // Clamp knob position within the joystick base
    const maxDistance = (JOYSTICK_SIZE - KNOB_SIZE) / 2;
    const clampedDistance = Math.min(distance, maxDistance);
    const newKnobPos = {
      x: basePos.x + Math.cos(angle) * clampedDistance,
      y: basePos.y + Math.sin(angle) * clampedDistance,
    };
    setKnobPos(newKnobPos);

    let newKey = null;
    if (distance > DEAD_ZONE) {
      const angleDeg = angle * (180 / Math.PI);
      if (angleDeg > -45 && angleDeg <= 45) newKey = 'ArrowRight';
      else if (angleDeg > 45 && angleDeg <= 135) newKey = 'ArrowDown';
      else if (angleDeg > 135 || angleDeg <= -135) newKey = 'ArrowLeft';
      else if (angleDeg > -135 && angleDeg <= -45) newKey = 'ArrowUp';
    }

    if (activeKeyRef.current !== newKey) {
      if (activeKeyRef.current) {
        onKeyRelease(activeKeyRef.current);
      }
      if (newKey) {
        onKeyPress(newKey);
      }
      activeKeyRef.current = newKey;
    }
  }, [isActive, basePos, onKeyPress, onKeyRelease]);

  const handleTouchEnd = useCallback((e) => {
    e.preventDefault();
    if (!isActive) return;
    
    setIsActive(false);
    if (activeKeyRef.current) {
      onKeyRelease(activeKeyRef.current);
      activeKeyRef.current = null;
    }
  }, [isActive, onKeyRelease]);

  const styles = {
    joystickArea: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      zIndex: 10,
    },
    base: {
      position: 'absolute',
      width: `${JOYSTICK_SIZE}px`,
      height: `${JOYSTICK_SIZE}px`,
      borderRadius: '50%',
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
      backdropFilter: 'blur(5px)',
      border: '1px solid rgba(255, 255, 255, 0.2)',
      transform: 'translate(-50%, -50%)',
    },
    knob: {
      position: 'absolute',
      width: `${KNOB_SIZE}px`,
      height: `${KNOB_SIZE}px`,
      borderRadius: '50%',
      backgroundColor: 'rgba(255, 255, 255, 0.3)',
      border: '1px solid rgba(255, 255, 255, 0.4)',
      transform: 'translate(-50%, -50%)',
    },
  };

  return (
    <div style={styles.joystickArea} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} onTouchCancel={handleTouchEnd}>
      {isActive && (
        <>
          <div style={{ ...styles.base, left: basePos.x, top: basePos.y }} />
          <div style={{ ...styles.knob, left: knobPos.x, top: knobPos.y }} />
        </>
      )}
    </div>
  );
};

export default VirtualJoystick;