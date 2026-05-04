import { StateCreator } from "zustand";
import { chatGet, apiRequest } from "../../utils/api";
import { ChatStore } from "../chatStore";

export interface ProfileSlice {
  userProfiles: Record<string, any>;
  currentUserEmail: string | null;
  setCurrentUserEmail: (email: string | null) => void;
  upsertProfiles: (newProfiles: Record<string, any>) => void;
  loadUserProfile: (email: string) => Promise<void>;
  loadMultipleProfiles: (emails: string[]) => Promise<void>;
}

export const createProfileSlice: StateCreator<
  ChatStore,
  [],
  [],
  ProfileSlice
> = (set, get) => ({
  userProfiles: {},
  currentUserEmail: null,

  setCurrentUserEmail: (email) =>
    set({ currentUserEmail: email?.toLowerCase() }),

  upsertProfiles: (newProfiles) =>
    set((state) => ({
      userProfiles: { ...state.userProfiles, ...newProfiles },
    })),

  loadUserProfile: async (email) => {
    if (!email) return;
    const normalizedEmail = email.trim().toLowerCase();
    const { currentUserEmail, userProfiles } = get();
    if (normalizedEmail === currentUserEmail) return;

    const existing = userProfiles[normalizedEmail];
    if (existing && (existing.fullName || existing.fullname)) return;

    try {
      let res = await chatGet("/friends/search", { email: normalizedEmail });
      if (!res?.ok || !res?.found) {
        const fallbackRes = await chatGet("/friends/search", {
          email: normalizedEmail,
        });
        if (fallbackRes?.ok) {
          const data = fallbackRes.data || {};
          if (data.found && data.user) {
            res = { ok: true, status: 200, found: true, user: data.user };
          }
        }
      }

      if (res?.ok && res?.found && res?.user) {
        set((state) => ({
          userProfiles: {
            ...state.userProfiles,
            [normalizedEmail]: {
              ...state.userProfiles[normalizedEmail],
              ...res.user,
              email: normalizedEmail,
            },
          },
        }));
      }
    } catch (err) {
      console.warn(
        `[ChatStore] Load profile failed for ${normalizedEmail}`,
        err,
      );
    }
  },

  loadMultipleProfiles: async (emails) => {
    const uniqueEmails = [
      ...new Set(emails.map((e) => e.trim().toLowerCase())),
    ];
    const { currentUserEmail, userProfiles } = get();

    const emailsToFetch = uniqueEmails.filter((email) => {
      if (email === currentUserEmail) return false;
      const existing = userProfiles[email];
      return !(existing && (existing.fullName || existing.fullname));
    });

    if (emailsToFetch.length === 0) return;

    // Parallel fetch with limit or just all at once if small
    // For now, all at once
    await Promise.allSettled(
      emailsToFetch.map((email) => get().loadUserProfile(email)),
    );
  },
});
