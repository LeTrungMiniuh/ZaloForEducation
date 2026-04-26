import { useQuery } from '@tanstack/react-query';
import { chatGet } from '../../utils/api';

export const useContacts = () => {
  return useQuery({
    queryKey: ['contacts'],
    queryFn: async () => {
      const [friendRes, requestRes, suggestionRes] = await Promise.all([
        chatGet("/friends"),
        chatGet("/friends/requests"),
        chatGet("/friends/suggestions"),
      ]);

      return {
        friendships: Array.isArray(friendRes?.data) ? friendRes.data : [],
        incomingRequests: Array.isArray(requestRes?.data) ? requestRes.data : [],
        suggestions: Array.isArray(suggestionRes?.data) ? suggestionRes.data : [],
      };
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};
