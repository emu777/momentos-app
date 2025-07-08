import React from 'react';
import { Group, Rect, Text, Image as KonvaImage } from 'react-konva';
import useImage from 'use-image';

const PLAYER_SIZE = 32;

const DEFAULT_AVATAR_CONFIG = {
  body: 'default_body.png',
  hair: 'default_hair.png',
  outfit: 'default_outfit.png',
};

const PlayerAvatar = ({ player, isMe }) => {
  const [bodyImage] = useImage(`/assets/avatars/${player.avatar_config?.body || DEFAULT_AVATAR_CONFIG.body}`);
  const [hairImage] = useImage(`/assets/avatars/${player.avatar_config?.hair || DEFAULT_AVATAR_CONFIG.hair}`);
  const [outfitImage] = useImage(`/assets/avatars/${player.avatar_config?.outfit || DEFAULT_AVATAR_CONFIG.outfit}`);

  return (
    <Group x={player.x_pos} y={player.y_pos}>
      <Rect
        width={PLAYER_SIZE}
        height={PLAYER_SIZE}
        fill={isMe ? 'blue' : 'red'}
        stroke="black"
        strokeWidth={1}
      />
      {bodyImage && <KonvaImage image={bodyImage} width={PLAYER_SIZE} height={PLAYER_SIZE} />}
      {outfitImage && <KonvaImage image={outfitImage} width={PLAYER_SIZE} height={PLAYER_SIZE} />}
      {hairImage && <KonvaImage image={hairImage} width={PLAYER_SIZE} height={PLAYER_SIZE} />}

      <Text
        text={player.nickname}
        fontSize={12}
        fill="white"
        align="center"
        width={PLAYER_SIZE}
        y={PLAYER_SIZE + 2}
      />
      {player.latestMessage && (
        <Text
          text={player.latestMessage}
          fontSize={14}
          padding={5}
          align="center"
          verticalAlign="middle"
          width={150}
          height={30}
          x={PLAYER_SIZE / 2 - 75}
          y={-35}
          fontStyle="bold"
          shadowColor="black"
          shadowBlur={5}
          shadowOffset={{ x: 1, y: 1 }}
          shadowOpacity={0.5}
          fill="white"
          stroke="black"
          strokeWidth={1}
          cornerRadius={5}
        />
      )}
    </Group>
  );
};

export default PlayerAvatar;