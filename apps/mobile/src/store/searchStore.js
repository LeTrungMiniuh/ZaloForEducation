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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalize query for cache key: trim, lowercase, collapse unicode/diacritics.
 * Prevents duplicate cache entries for "Nguyen" vs "nguyễn " etc.
 */
const normalizeQuery = (query) =>
  query
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const isValidQuery = (query) =>
  typeof query === 'string' && query.trim().length >= MIN_QUERY_LENGTH;

/**
 * LRU-style cache eviction: remove oldest entries when over MAX_CACHE_ENTRIES.
 */
const evictCache = (cache) => {
  const keys = Object.keys(cache);
  if (keys.length <= MAX_CACHE_ENTRIES) return cache;
  // Sort by timestamp ascending, drop the oldest half
  const sorted = keys.sort((a, b) => (cache[a].ts || 0) - (cache[b].ts || 0));
  const toRemove = sorted.slice(0, keys.length - MAX_CACHE_ENTRIES);
  const next = { ...cache };
  toRemove.forEach((k) => delete next[k]);
  return next;
};

const isCacheValid = (entry) =>
  entry && Date.now() - (entry.ts || 0) < CACHE_TTL_MS;

// ─── Enrichers ────────────────────────────────────────────────────────────────

const enrichContact = (c) => ({
  ...c,
  type: 'CONTACT',
  userId: c.userId || c.id || c.email,           // Priority: userId from backend Search V2
  displayName: c.content || c.fullName || c.sender?.name || c.email || '',
  avatar: c.avatarUrl || c.avatar || c.sender?.avatar || DEFAULT_AVATAR,
  isFriend: true,
});

const enrichMessage = (m) => ({
  ...m,
  type: 'MESSAGE',
  messageId: m.id || m._id,
  conversationId: m.conversationId || m.convId,  // Ensure both are handled
  displayName: m.sender?.name || m.senderId || 'Người dùng',
  avatar: m.sender?.avatar || DEFAULT_AVATAR,
});

const enrichFile = (f) => ({
  ...f,
  type: 'FILE',
  messageId: f.messageId || f.id,
  conversationId: f.conversationId || f.convId,
  displayName: f.content || f.filename || f.name || 'Tệp tin',
  avatar: DEFAULT_AVATAR,
});

const buildSections = (contacts, messages, files) =>
  [
    { title: 'LIÊN HỆ', data: contacts },
    { title: 'TIN NHẮN', data: messages },
    { title: 'TỆP TIN', data: files },
  ].filter((s) => s.data.length > 0);

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSearchStore = create((set, get) => {
  // Track the latest request to discard stale responses (race condition guard).
  // Using a counter instead of AbortController for RN compatibility.
  let requestGeneration = 0;

  // Debounce timer ref
  let debounceTimer = null;

  // ── Core fetch logic (shared by debounced + immediate paths) ───────────────
  const fetchSearch = async (query, generation) => {
    const cacheKey = `search_${normalizeQuery(query)}`;
    const state = get();

    // Cache hit
    if (isCacheValid(state.cache[cacheKey])) {
      // Only apply if still the latest request
      if (generation !== requestGeneration) return;
      const { results, sections } = state.cache[cacheKey];
      set({ results, sections, isLoading: false, error: null });
      return;
    }

    try {
      const res = await apiRequest(
        `/chat/search?q=${encodeURIComponent(query.trim())}`,
      );

      // Discard stale response
      if (generation !== requestGeneration) return;

      const data = res?.data || res || { contacts: [], messages: [], files: [] };

      const contacts = (data.contacts || []).map(enrichContact);
      const messages = (data.messages || []).map(enrichMessage);
      const files = (data.files || []).map(enrichFile);
      const sections = buildSections(contacts, messages, files);
      const results = [...contacts, ...messages, ...files];

      // Build new cache with eviction
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
    // ── State ──────────────────────────────────────────────────────────────
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

    // ── Setters ────────────────────────────────────────────────────────────
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

    // ── Debounced search (called on every keystroke) ────────────────────────
    search: (query) => {
      if (!isValidQuery(query)) {
        clearTimeout(debounceTimer);
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

      // Show loading immediately for perceived performance
      set({ isLoading: true, error: null });

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const generation = ++requestGeneration;
        fetchSearch(query, generation);
      }, DEBOUNCE_MS);
    },

    // ── Immediate search (called on submit / recent tap) ───────────────────
    searchNow: (query) => {
      if (!isValidQuery(query)) {
        set({ results: [], sections: [], activeId: null, error: null });
        return;
      }
      clearTimeout(debounceTimer);
      set({ isLoading: true, error: null });
      const generation = ++requestGeneration;
      fetchSearch(query, generation);
    },

    // ── Selection & navigation ─────────────────────────────────────────────
    setActiveId: (id, type) => set({ activeId: id, activeType: type }),
    clearActive: () => set({ activeId: null, activeType: null }),

    handleSelect: (item, onNavigate) => {
      if (!item || typeof onNavigate !== 'function') return;

      // Normalize ID for consistent "isActive" check
      const resolvedId =
        item.type === 'CONTACT'
          ? item.userId || item.id
          : item.messageId || item.id;

      get().setActiveId(resolvedId, item.type);

      // Delay for tap feedback animation
      setTimeout(() => {
        if (item.type === 'CONTACT') {
          // Signature: (screen, params, tab)
          onNavigate('profile', { userId: item.userId || item.id });
        } else if (item.type === 'MESSAGE' || item.type === 'FILE') {
          onNavigate('chat', {
            conversationId: item.conversationId,
            targetMessageId: item.messageId || item.id,
            highlightKeyword: get().lastQuery,
          });
        }
      }, 300);
    },

    // ── Restore cached state when returning to search screen ───────────────
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
        // Cache expired — re-fetch silently
        set({ query, isLoading: true });
        const generation = ++requestGeneration;
        fetchSearch(query, generation);
      }
    },

    // ── Cache management ───────────────────────────────────────────────────
    clearCache: () => set({ cache: {} }),

    /**
     * Invalidate a specific query's cache entry.
     * Useful after sending a message (so search reflects the new message).
     */
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