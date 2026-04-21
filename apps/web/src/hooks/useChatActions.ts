import { useNavigate } from 'react-router-dom';
import { useChatStore } from '../store/chatStore';
import api from '../services/api';

export const useChatActions = () => {
  const navigate = useNavigate();
  const { 
    conversations, 
    setConversations, 
    setActiveConversation,
    setIsSearching,
    setSearchQuery
  } = useChatStore();

  const handleOpenDirectChat = async (partnerEmail: string) => {
    try {
      // 1. Find existing direct conversation
      const existing = conversations.find(c => 
        c.type === 'direct' && 
        (Array.isArray(c.members) && c.members.includes(partnerEmail))
      );

      if (existing) {
        setActiveConversation(existing.id);
        navigate('/chat');
      } else {
        // 2. Create new direct conversation if not exists
        const res = await api.post('/chat/conversations/direct', { 
          targetEmail: partnerEmail
        });
        const newConv = res.data;
        
        // Add to list and select
        setConversations(prev => [newConv, ...prev]);
        setActiveConversation(newConv.id);
        navigate('/chat');
      }

      // Cleanup search UI
      setIsSearching(false);
      setSearchQuery('');
    } catch (err) {
      console.error('Failed to open direct chat', err);
      // Fallback: just navigate to chat
      navigate('/chat');
    }
  };

  return {
    handleOpenDirectChat
  };
};
