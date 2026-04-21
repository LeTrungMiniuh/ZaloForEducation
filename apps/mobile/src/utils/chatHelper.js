/**
 * ChatScreen Message Synchronization Helpers
 * Handles scrolling to target message, fetching surrounding context, and highlighting
 */

import { Animated } from 'react-native';

/**
 * Scroll to target message
 * @param {Object} params
 * @param {Array} params.messages - Array of all messages
 * @param {string} params.targetMessageId - ID to scroll to
 * @param {Object} params.flatListRef - FlatList reference
 * @returns {boolean} true if found and scrolled
 */
export const scrollToMessage = ({ messages, targetMessageId, flatListRef }) => {
    if (!messages || !targetMessageId || !flatListRef.current) {
        console.warn('[ChatHelper] Cannot scroll: missing params');
        return false;
    }

    const index = messages.findIndex(msg => msg.id === targetMessageId);

    if (index === -1) {
        console.warn(`[ChatHelper] Message ${targetMessageId} not found in list`);
        return false;
    }

    try {
        setTimeout(() => {
            flatListRef.current?.scrollToIndex({
                index,
                animated: true,
                viewPosition: 0.5, // Center in view
            });
        }, 100);
        return true;
    } catch (err) {
        console.error('[ChatHelper] Scroll error:', err);
        return false;
    }
};

/**
 * Check if message exists locally
 * @param {Array} messages - Current messages
 * @param {string} targetMessageId - Message to find
 * @returns {Object|null} Message object or null
 */
export const findMessage = (messages, targetMessageId) => {
    return messages?.find(msg => msg.id === targetMessageId) || null;
};

/**
 * Animate message highlight (yellow flash 3 times)
 * @param {Object} params
 * @param {Animated.Value} params.animValue - Animated value
 * @param {Function} params.onComplete - Callback when animation ends
 */
export const flashMessageHighlight = ({ animValue, onComplete }) => {
    Animated.sequence([
        // Flash 1
        Animated.timing(animValue, { toValue: 1, duration: 200, useNativeDriver: false }),
        Animated.timing(animValue, { toValue: 0, duration: 200, useNativeDriver: false }),
        // Flash 2
        Animated.timing(animValue, { toValue: 1, duration: 200, useNativeDriver: false }),
        Animated.timing(animValue, { toValue: 0, duration: 200, useNativeDriver: false }),
        // Flash 3
        Animated.timing(animValue, { toValue: 1, duration: 200, useNativeDriver: false }),
        Animated.timing(animValue, { toValue: 0, duration: 200, useNativeDriver: false }),
    ]).start(onComplete);
};

/**
 * Get interpolated background color for highlight animation
 * @param {Animated.Value} animValue - Animated value (0-1)
 * @returns {Animated.Value} Interpolated color
 */
export const getHighlightBackgroundColor = (animValue) => {
    return animValue.interpolate({
        inputRange: [0, 1],
        outputRange: ['transparent', '#FFEB3B40'],
    });
};

/**
 * Prepare search context for display
 * Creates a snippet with surrounding messages
 * @param {Object} params
 * @param {Array} params.messages - All messages
 * @param {string} params.targetMessageId - Target message ID
 * @param {number} params.contextSize - How many messages before/after (default 5)
 * @returns {Array} Filtered messages with context
 */
export const getMessageContext = ({
    messages,
    targetMessageId,
    contextSize = 5,
}) => {
    if (!messages || !targetMessageId) return [];

    const targetIndex = messages.findIndex(msg => msg.id === targetMessageId);
    if (targetIndex === -1) return [];

    const startIdx = Math.max(0, targetIndex - contextSize);
    const endIdx = Math.min(messages.length, targetIndex + contextSize + 1);

    return messages.slice(startIdx, endIdx);
};

/**
 * Highlight keyword in message content
 * @param {string} text - Message content
 * @param {string} keyword - Keyword to highlight
 * @returns {Array} Array of text parts with highlight markers
 */
export const highlightTextContent = (text, keyword) => {
    if (!text || !keyword) return [{ type: 'normal', value: text }];

    const regex = new RegExp(`(${keyword})`, 'gi');
    const parts = [];
    let lastIndex = 0;

    text.replace(regex, (match, p1, offset) => {
        if (offset > lastIndex) {
            parts.push({ type: 'normal', value: text.substring(lastIndex, offset) });
        }
        parts.push({ type: 'highlight', value: match });
        lastIndex = offset + match.length;
    });

    if (lastIndex < text.length) {
        parts.push({ type: 'normal', value: text.substring(lastIndex) });
    }

    return parts.length > 0 ? parts : [{ type: 'normal', value: text }];
};
