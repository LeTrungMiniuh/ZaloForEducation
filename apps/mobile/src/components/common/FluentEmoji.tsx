import React, { useState } from 'react';
import { Image, Text } from 'react-native';
import { FLUENT_EMOJI_MAP } from '../../constants/Emojis';

interface FluentEmojiProps {
  emoji: string;
  style?: any;
}

const FluentEmoji = ({ emoji, style }: FluentEmojiProps) => {
  const [failed, setFailed] = useState(false);
  const url = FLUENT_EMOJI_MAP[emoji];

  if (failed || !url) return <Text style={style}>{emoji}</Text>;

  return (
    <Image
      source={{ uri: url }}
      style={style}
      onError={() => setFailed(true)}
    />
  );
};

export default FluentEmoji;
