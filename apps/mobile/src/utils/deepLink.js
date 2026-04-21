/**
 * Deep-Linking Utilities for Universal Search
 * Handles navigation with proper context and message scrolling
 */

/**
 * Navigate to chat with target message highlighting
 * @param {Object} params
 * @param {string} params.conversationId - ID of the conversation
 * @param {string} params.targetMessageId - ID of the message to highlight
 * @param {string} params.keyword - Search keyword to highlight in content
 * @param {Function} params.onNavigate - Navigation callback from react-navigation
 */
export const navigateToChat = async ({
    conversationId,
    targetMessageId,
    keyword,
    onNavigate,
}) => {
    if (!conversationId || !targetMessageId) {
        console.error('[DeepLink] Missing required params for chat navigation');
        return;
    }

    onNavigate('Chat', {
        conversationId,
        targetMessageId,
        highlightKeyword: keyword,
        autoScroll: true, // Auto-scroll to message on mount
    });
};

/**
 * Navigate to user profile
 * @param {Object} params
 * @param {string} params.userId - User ID
 * @param {Function} params.onNavigate - Navigation callback
 */
export const navigateToProfile = ({ userId, onNavigate }) => {
    if (!userId) {
        console.error('[DeepLink] Missing userId for profile navigation');
        return;
    }

    onNavigate('Profile', { userId });
};

/**
 * Extract highlight color based on message type
 */
export const getHighlightColor = (type) => {
    const colors = {
        CONTACT: '#0068FF',
        MESSAGE: '#FFD700',
        FILE: '#FF6600',
    };
    return colors[type] || '#FFD700';
};

/**
 * Prepare message for display with keyword highlight
 * @param {Object} message - Message object
 * @param {string} keyword - Keyword to highlight
 * @returns {Object} Enriched message with highlighted content
 */
export const prepareMessageForDisplay = (message, keyword) => {
    if (!message || !keyword) return message;

    return {
        ...message,
        highlightedContent: message.content,
        keyword,
    };
};
