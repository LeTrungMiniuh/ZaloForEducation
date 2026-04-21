import React, { useState } from 'react';
import { Image } from 'react-native';
import { ASSETS } from '../../utils/assets';

/**
 * SafeImage - A wrapper around React Native Image that handles broken URIs
 * and null sources gracefully, showing a fallback image instead.
 */
const SafeImage = ({ source, style, fallback, ...props }) => {
  const [error, setError] = useState(false);

  const resolvedFallback = fallback || ASSETS.DEFAULT_AVATAR;

  const resolveSource = () => {
    if (error) return resolvedFallback;
    if (!source) return resolvedFallback;
    if (typeof source === 'object' && source !== null) {
      if (source.uri && typeof source.uri === 'string' && source.uri.trim().length > 0) {
        return source;
      }
      // It's a require()'d local asset (number)
      if (typeof source === 'number') return source;
      return resolvedFallback;
    }
    if (typeof source === 'number') return source; // local require
    return resolvedFallback;
  };

  return (
    <Image
      source={resolveSource()}
      style={style}
      onError={() => setError(true)}
      {...props}
    />
  );
};

export default SafeImage;
