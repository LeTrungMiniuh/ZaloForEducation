import { useQuery } from '@tanstack/react-query';
import { chatGet } from '../../utils/api';
import { useChatStore } from '../../store/chatStore';

export const useConversations = () => {
  const setConversations = useChatStore((state) => state.setConversations);

  return useQuery({
    queryKey: ['conversations'],
    queryFn: async () => {
      const res = await chatGet("/conversations");
      let data = [];
      if (Array.isArray(res?.data)) {
        data = res.data;
      } else if (res && typeof res === "object") {
        const numericKeys = Object.keys(res).filter(k => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b));
        if (numericKeys.length > 0) {
          data = numericKeys.map(k => res[k]);
        }
      }
      
      // Update Zustand store for components still relying on it
      setConversations(data);
      
      return data;
    },
    staleTime: 1000 * 60, // 1 minute
  });
};
