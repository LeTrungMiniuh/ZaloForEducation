import api from './api';

export const chatService = {
  get: async (path: string, params?: any) => {
    return api.get(`/chat${path}`, { params });
  },
  post: async (path: string, body: any) => {
    return api.post(`/chat${path}`, body);
  },
  patch: async (path: string, body: any) => {
    return api.patch(`/chat${path}`, body);
  },
  upload: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/chat/uploads', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  }
};
