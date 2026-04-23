import { create } from "zustand";
import { createConversationSlice, ConversationSlice } from "./slices/conversationSlice";
import { createMessageSlice, MessageSlice } from "./slices/messageSlice";
import { createProfileSlice, ProfileSlice } from "./slices/profileSlice";
import { createNotificationSlice, NotificationSlice } from "./slices/notificationSlice";

export type ChatStore = ConversationSlice & MessageSlice & ProfileSlice & NotificationSlice;

export const useChatStore = create<ChatStore>()((...a) => ({
  ...createConversationSlice(...a),
  ...createMessageSlice(...a),
  ...createProfileSlice(...a),
  ...createNotificationSlice(...a),
}));
