import { useInfiniteQuery } from '@tanstack/react-query';
import { chatGet } from '../../utils/api';

export const useMessages = (conversationId: string) => {
  return useInfiniteQuery({
    queryKey: ['messages', conversationId],
    queryFn: async ({ pageParam }) => {
      const res = await chatGet(
        `/conversations/${encodeURIComponent(conversationId)}/messages`,
        { limit: 30, cursor: pageParam }
      );
      return res?.data || { messages: [], nextCursor: null };
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor || null,
    enabled: !!conversationId,
  });
};
