import { Keyboard } from 'react-native';
import { create } from 'zustand';
import { apiRequest } from '../utils/api';

const DEFAULT_AVATAR =
  'https://fptupload.s3.ap-southeast-1.amazonaws.com/Zalo_Edu_Logo_2e176b6b7f.png';

// ─── Constants ────────────────────────────────────────────────────────────────
const DEBOUNCE_MS = 400;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_ENTRIES = 50;
const RECENT_SEARCHES_LIMIT = 10;
const MIN_QUERY_LENGTH = 2;

export interface SearchItem {
  type: 'CONTACT' | 'MESSAGE' | 'FILE';
  id?: string;
  userId?: string;
  messageId?: string;
  conversationId?: string;
  displayName: string;
  avatar: string;
  content?: string;
  createdAt?: number | string;
  [key: string]: any;
}

export interface SearchSection {
  title: string;
  data: SearchItem[];
}

interface SearchCacheEntry {
  results: SearchItem[];
  sections: SearchSection[];
  ts: number;
}

interface SearchStore {
  query: string;
  results: SearchItem[];
  sections: SearchSection[];
  isLoading: boolean;
  error: string | null;
  recentSearches: string[];
  activeId: string | null;
  activeType: string | null;
  cache: Record<string, SearchCacheEntry>;
  lastQuery: string;

  setQuery: (query: string) => void;
  clearResults: () => void;
  addRecentSearch: (query: string) => void;
  clearRecentSearches: () => void;
  search: (query: string) => void;
  searchNow: (query: string) => void;
  setActiveId: (id: string | null, type: string | null) => void;
  clearActive: () => void;
  handleSelect: (item: SearchItem, onNavigate: Function) => void;
  restoreSearch: (query: string) => void;
  clearCache: () => void;
  invalidateCache: (query: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const normalizeQuery = (query: string) =>
  query
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const isValidQuery = (query: string) =>
  typeof query === 'string' && query.trim().length >= MIN_QUERY_LENGTH;

const evictCache = (cache: Record<string, SearchCacheEntry>) => {
  const keys = Object.keys(cache);
  if (keys.length <= MAX_CACHE_ENTRIES) return cache;
  const sorted = keys.sort((a, b) => (cache[a].ts || 0) - (cache[b].ts || 0));
  const toRemove = sorted.slice(0, keys.length - MAX_CACHE_ENTRIES);
  const next = { ...cache };
  toRemove.forEach((k) => delete next[k]);
  return next;
};

const isCacheValid = (entry: SearchCacheEntry | undefined) =>
  entry && Date.now() - (entry.ts || 0) < CACHE_TTL_MS;

// ─── Enrichers ────────────────────────────────────────────────────────────────

const enrichContact = (c: any): SearchItem => ({
  ...c,
  type: 'CONTACT',
  userId: c.userId || c.id || c.email,
  displayName: c.content || c.fullName || c.sender?.name || c.email || '',
  avatar: c.avatarUrl || c.avatar || c.sender?.avatar || DEFAULT_AVATAR,
  isFriend: true,
});

const enrichMessage = (m: any): SearchItem => ({
  ...m,
  type: 'MESSAGE',
  messageId: m.id || m._id,
  conversationId: m.conversationId || m.convId,
  senderId: m.senderId || m.sender_id || m.sender?.email || '',
  displayName: m.sender?.name || m.fullName || m.senderId || 'Người dùng',
  avatar: m.sender?.avatar || m.sender?.avatarUrl || DEFAULT_AVATAR,
  createdAt: m.createdAt || m.created_at || Date.now(),
});

const enrichFile = (f: any): SearchItem => ({
  ...f,
  type: 'FILE',
  messageId: f.messageId || f.id,
  conversationId: f.conversationId || f.convId,
  displayName: f.name || f.filename || f.content || 'Tệp tin',
  avatar: DEFAULT_AVATAR,
  createdAt: f.createdAt || f.created_at || Date.now(),
});

const buildSections = (contacts: SearchItem[], messages: SearchItem[], files: SearchItem[]): SearchSection[] =>
  [
    { title: 'LIÊN HỆ', data: contacts },
    { title: 'TIN NHẮN', data: messages },
    { title: 'TỆP TIN', data: files },
  ].filter((s) => s.data.length > 0);

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSearchStore = create<SearchStore>((set, get) => {
  let requestGeneration = 0;
  let debounceTimer: any = null;

  const fetchSearch = async (query: string, generation: number) => {
    const cacheKey = `search_${normalizeQuery(query)}`;
    const state = get();

    if (isCacheValid(state.cache[cacheKey])) {
      if (generation !== requestGeneration) return;
      const { results, sections } = state.cache[cacheKey];
      set({ results, sections, isLoading: false, error: null });
      return;
    }

    try {
      const res = await apiRequest(
        `/chat/search?q=${encodeURIComponent(query.trim())}`,
      );

      if (generation !== requestGeneration) return;

      const data = res?.data || res || { contacts: [], messages: [], files: [] };

      const contacts = (data.contacts || []).map(enrichContact).filter((c: any) => {
        const email = String(c.userId || c.email || "").toLowerCase();
        return email !== 'bot@zaloedu.system' && !email.includes('bot@zaloedu.system');
      });
      const messages = (data.messages || []).map(enrichMessage).filter((m: any) => {
        const senderId = String(m.senderId || "").toLowerCase();
        return senderId !== 'bot@zaloedu.system' && !senderId.includes('bot@zaloedu.system');
      });
      const files = (data.files || []).map(enrichFile);
      const sections = buildSections(contacts, messages, files);
      const results = [...contacts, ...messages, ...files];

      const existingCache = get().cache;
      const newCache = evictCache({
        ...existingCache,
        [cacheKey]: { results, sections, ts: Date.now() },
      });

      set({
        results,
        sections,
        isLoading: false,
        error: null,
        cache: newCache,
        lastQuery: query.trim(),
      });

      get().addRecentSearch(query.trim());
    } catch (err) {
      if (generation !== requestGeneration) return;
      console.error('[SearchStore] fetch error:', err);
      set({ error: 'Không thể tìm kiếm lúc này', isLoading: false });
    }
  };

  return {
    query: '',
    results: [],
    sections: [],
    isLoading: false,
    error: null,
    recentSearches: [],
    activeId: null,
    activeType: null,
    cache: {},
    lastQuery: '',

    setQuery: (query) => set({ query }),

    clearResults: () =>
      set({ results: [], sections: [], error: null, activeId: null }),

    addRecentSearch: (query) => {
      if (!isValidQuery(query)) return;
      set((state) => ({
        recentSearches: [
          query,
          ...state.recentSearches.filter((q) => q !== query),
        ].slice(0, RECENT_SEARCHES_LIMIT),
      }));
    },

    clearRecentSearches: () => set({ recentSearches: [] }),

    search: (query) => {
      if (!isValidQuery(query)) {
        if (debounceTimer) clearTimeout(debounceTimer);
        requestGeneration++;
        set({
          results: [],
          sections: [],
          activeId: null,
          error: null,
          isLoading: false,
        });
        return;
      }

      set({ isLoading: true, error: null });

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const generation = ++requestGeneration;
        fetchSearch(query, generation);
      }, DEBOUNCE_MS);
    },

    searchNow: (query) => {
      if (!isValidQuery(query)) {
        set({ results: [], sections: [], activeId: null, error: null });
        return;
      }
      if (debounceTimer) clearTimeout(debounceTimer);
      set({ isLoading: true, error: null });
      const generation = ++requestGeneration;
      fetchSearch(query, generation);
    },

    setActiveId: (id, type) => set({ activeId: id, activeType: type }),
    clearActive: () => set({ activeId: null, activeType: null }),

    handleSelect: (item, onNavigate) => {
      if (!item || typeof onNavigate !== 'function') return;

      const resolvedId =
        item.type === 'CONTACT'
          ? item.userId || item.id
          : item.messageId || item.id;

      if (resolvedId) get().setActiveId(resolvedId, item.type);

      Keyboard.dismiss();
      setTimeout(() => {
        if (item.type === 'CONTACT') {
          onNavigate('Profile', { userId: item.userId || item.id });
        } else if (item.type === 'MESSAGE' || item.type === 'FILE') {
          onNavigate('Chat', {
            conversationId: item.conversationId,
            targetMessageId: item.messageId || item.id,
            highlightKeyword: get().lastQuery,
          });
        }
      }, 300);
    },

    restoreSearch: (query) => {
      if (!isValidQuery(query)) {
        set({ results: [], sections: [], query: '' });
        return;
      }
      const cacheKey = `search_${normalizeQuery(query)}`;
      const cached = get().cache[cacheKey];
      if (isCacheValid(cached)) {
        set({ query, results: cached.results, sections: cached.sections });
      } else {
        set({ query, isLoading: true });
        const generation = ++requestGeneration;
        fetchSearch(query, generation);
      }
    },

    clearCache: () => set({ cache: {} }),

    invalidateCache: (query) => {
      if (!query) return;
      const cacheKey = `search_${normalizeQuery(query)}`;
      set((state) => {
        const next = { ...state.cache };
        delete next[cacheKey];
        return { cache: next };
      });
    },
  };
});