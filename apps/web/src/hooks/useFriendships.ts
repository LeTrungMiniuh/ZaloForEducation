import { useState, useEffect } from 'react';
import api from '../services/api';

export interface Friendship {
  sender_id: string;
  receiver_id: string;
  status: 'pending' | 'accepted';
}

export const useFriendships = () => {
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchFriendships = async () => {
    setLoading(true);
    try {
      const res = await api.get('/chat/friends');
      setFriendships(res.data || []);
    } catch (err) {
      console.error('Failed to fetch friendships', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFriendships();
  }, []);

  const acceptedFriends = friendships
    .filter((f) => f.status === 'accepted');
    
  const pendingFriends = friendships
    .filter((f) => f.status === 'pending');

  return {
    friendships,
    acceptedFriends,
    pendingFriends,
    loading,
    refreshFriendships: fetchFriendships
  };
};
