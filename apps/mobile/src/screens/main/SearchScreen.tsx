import React, {
  useRef,
  useEffect,
  useCallback,
  useState,
  memo,
  useMemo,
} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Image,
  FlatList,
  SectionList,
  ActivityIndicator,
  Animated,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import styles from './style/SearchScreen.styles';
import { useSearchStore } from '../../store/searchStore';
import { useChatStore } from '../../store/chatStore';
import SafeImage from '../../components/common/SafeImage';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_AVATAR = require('../../../assets/logo_blue.png');
const RESULTS_PER_PAGE = 5;

const TAG_CONFIG = {
  CONTACT: { label: 'LIÊN HỆ', color: '#0068FF' },
  MESSAGE: { label: 'TIN NHẮN', color: '#00AA44' },
  FILE: { label: 'TỆP TIN', color: '#FF6600' },
};

// ─── Utility: keyword highlighter ────────────────────────────────────────────

/**
 * Splits `text` around case-insensitive matches of `keyword` and wraps
 * each match in a bold blue <Text>. Returns an array safe for React Native.
 */
const highlightKeyword = (text, keyword) => {
  if (!text || !keyword?.trim()) return text;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = String(text).split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === keyword.toLowerCase() ? (
      <Text key={i} style={{ fontWeight: 'bold', color: '#0068FF' }}>
        {part}
      </Text>
    ) : (
      part
    ),
  );
};

const getFileIcon = (mimeType = "", fileName = "") => {
  const lowerName = String(fileName || "").toLowerCase();
  const lowerMime = String(mimeType || "").toLowerCase();
  if (lowerMime.includes("pdf") || lowerName.endsWith(".pdf"))
    return "picture_as_pdf";
  if (
    lowerMime.includes("word") ||
    lowerName.endsWith(".doc") ||
    lowerName.endsWith(".docx")
  )
    return "description";
  if (
    lowerMime.includes("excel") ||
    lowerName.endsWith(".xls") ||
    lowerName.endsWith(".xlsx")
  )
    return "table_chart";
  if (lowerMime.startsWith("image/")) return "image";
  if (lowerMime.startsWith("video/")) return "movie";
  return "draft";
};

const formatFileSize = (size) => {
  const n = Number(size || 0);
  if (!n) return "--";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

const formatTime = (date) => {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

// ─── SearchItem ───────────────────────────────────────────────────────────────
/**
 * Fully memoized result row.
 * Each item owns its own Animated.Value so animations never conflict.
 */
const SearchItem = memo(
  ({ item, isActive, isHighlighting, highlightAnim, query, onPress, userProfiles }) => {
    const tag = TAG_CONFIG[item.type];
    const isFile = item.type === 'FILE';
    const isMessage = item.type === 'MESSAGE';
    const isContact = item.type === 'CONTACT';

    // Identity Resolution
    const senderEmail = item.senderId || item.email;
    const profile = senderEmail ? userProfiles[senderEmail.trim().toLowerCase()] : null;
    
    const title = isContact 
      ? (profile?.nickname || profile?.fullName || profile?.fullname || item.fullName || item.displayName || item.sender?.name || '')
      : (profile?.nickname || profile?.fullName || profile?.fullname || item.sender?.name || item.displayName || 'Người dùng');
    
    const subtitle = (isMessage || isFile) ? item.content : '';
    const fileMeta = isFile ? formatFileSize(item.size) : null;

    const itemAvatarUri = profile?.avatarUrl || item.sender?.avatar || item.sender?.avatarUrl || item.avatar;
    const avatarSource = itemAvatarUri ? { uri: itemAvatarUri } : DEFAULT_AVATAR;

    const animatedBorderColor = isHighlighting
      ? highlightAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['#f0f0f0', '#FFD700'],
      })
      : '#f0f0f0';

    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        <Animated.View
          style={[
            styles.resultItem,
            isActive && styles.resultItemActive,
            {
              borderColor: animatedBorderColor,
              borderWidth: isHighlighting ? 2 : 0,
            },
          ]}
        >
          {isFile ? (
            <View style={[styles.avatar, { backgroundColor: '#f0f7ff', justifyContent: 'center', alignItems: 'center' }]}>
              <Text style={{ fontFamily: 'Material Symbols Outlined', fontSize: 24, color: '#0068FF' }}>
                {getFileIcon(item.mimeType, item.name || item.content)}
              </Text>
            </View>
          ) : (
            <SafeImage
              source={avatarSource}
              style={styles.avatar}
              fallback={DEFAULT_AVATAR}
            />
          )}
          <View style={styles.resultInfo}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[styles.resultName, { flex: 1 }]} numberOfLines={1}>
                {highlightKeyword(title, query)}
              </Text>
              {(isMessage || isFile) && (
                <Text style={{ fontSize: 10, color: '#9ba3b2', marginLeft: 8 }}>
                  {formatTime(item.createdAt)}
                </Text>
              )}
            </View>
            {subtitle ? (
              <Text style={styles.resultSub} numberOfLines={1}>
                {highlightKeyword(subtitle, query)}
              </Text>
            ) : null}
            {fileMeta && (
              <Text style={{ fontSize: 10, color: '#9ba3b2', marginTop: 2 }}>
                {fileMeta}
              </Text>
            )}
          </View>
          {tag ? (
            <Text style={[styles.resultTypeTag, { color: tag.color }]}>
              {tag.label}
            </Text>
          ) : null}
        </Animated.View>
      </TouchableOpacity>
    );
  },
);

// ─── RecentItem ───────────────────────────────────────────────────────────────

const RecentItem = memo(({ item, onPress }) => (
  <TouchableOpacity
    style={styles.recentItem}
    onPress={() => onPress(item)}
    activeOpacity={0.7}
  >
    <Text style={styles.recentIcon}>history</Text>
    <Text style={styles.recentText}>{item}</Text>
  </TouchableOpacity>
));

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function SearchScreen({ onNavigate, goBack }) {
  const insets = useSafeAreaInsets();
  const inputRef = useRef(null);

  // Per-item highlight tracking: Map<itemId, Animated.Value>
  const animMap = useRef(new Map());
  const [highlightingId, setHighlightingId] = useState(null);

  // Pagination: which sections are fully expanded (Set of section titles)
  const [expandedSections, setExpandedSections] = useState(new Set());

  const {
    query,
    sections,
    activeId,
    isLoading,
    recentSearches,
    setQuery,
    search,
    searchNow,
    clearResults,
    clearRecentSearches,
    handleSelect,
  } = useSearchStore();

  const { userProfiles } = useChatStore();

  // Auto-focus on mount & Cleanup on exit
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 100);
    return () => {
      clearTimeout(t);
      setQuery('');
      clearResults();
    };
  }, [setQuery, clearResults]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const getItemId = useCallback(
    (item) => item.userId || item.messageId || item.id || '',
    [],
  );

  const getOrCreateAnim = useCallback((id) => {
    if (!animMap.current.has(id)) {
      animMap.current.set(id, new Animated.Value(0));
    }
    return animMap.current.get(id);
  }, []);

  const animateHighlight = useCallback(
    (id) => {
      const anim = getOrCreateAnim(id);
      anim.setValue(0);
      setHighlightingId(id);
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: false,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: false,
        }),
      ]).start(() => setHighlightingId(null));
    },
    [getOrCreateAnim],
  );

  // ── Event handlers ────────────────────────────────────────────────────────

  const handleChangeText = useCallback(
    (text) => {
      setQuery(text);
      setExpandedSections(new Set());
      // `search` handles the isValidQuery guard internally
      search(text);
    },
    [setQuery, search],
  );

  const handleClear = useCallback(() => {
    setQuery('');
    clearResults();
    setExpandedSections(new Set());
    inputRef.current?.focus();
  }, [setQuery, clearResults]);

  const handleSubmitEditing = useCallback(() => {
    if (query.trim().length >= 2) searchNow(query.trim());
  }, [query, searchNow]);

  const handleSelectResult = useCallback(
    (item) => {
      const id = getItemId(item);
      animateHighlight(id);
      // Small delay so the highlight animation starts before navigation
      setTimeout(() => handleSelect(item, onNavigate), 100);
    },
    [animateHighlight, getItemId, handleSelect, onNavigate],
  );

  const handleSelectRecent = useCallback(
    (text) => {
      setQuery(text);
      setExpandedSections(new Set());
      searchNow(text);
    },
    [setQuery, searchNow],
  );

  const toggleSectionExpansion = useCallback((title) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }, []);

  // ── Derived data ──────────────────────────────────────────────────────────

  /**
   * Limit each section's data if not expanded.
   */
  const limitedSections = useMemo(() => {
    return (sections || []).map((section) => {
      const isExpanded = expandedSections.has(section.title);
      const rawData = section.data || [];
      const slicedData = isExpanded ? rawData : rawData.slice(0, RESULTS_PER_PAGE);

      return {
        ...section,
        data: slicedData,
        actualDataCount: rawData.length,
        isExpanded,
      };
    });
  }, [sections, expandedSections]);

  const showRecents =
    !query.trim() && recentSearches?.length > 0;

  // ── Renderers ─────────────────────────────────────────────────────────────

  const renderItem = useCallback(
    ({ item }) => {
      const id = getItemId(item);
      return (
        <SearchItem
          item={item}
          isActive={activeId === id}
          isHighlighting={highlightingId === id}
          highlightAnim={getOrCreateAnim(id)}
          query={query}
          onPress={() => handleSelectResult(item)}
          userProfiles={userProfiles}
        />
      );
    },
    [activeId, highlightingId, query, getItemId, getOrCreateAnim, handleSelectResult],
  );

  const renderRecent = useCallback(
    ({ item }) => <RecentItem item={item} onPress={handleSelectRecent} />,
    [handleSelectRecent],
  );

  const renderSectionHeader = useCallback(
    ({ section }) => (
      <View style={styles.sectionHeaderContainer}>
        <Text style={styles.sectionTitle}>{section.title}</Text>
      </View>
    ),
    [],
  );

  const renderSectionFooter = useCallback(
    ({ section }) => {
      const showExpand = !section.isExpanded && section.actualDataCount > RESULTS_PER_PAGE;
      if (!showExpand) return <View style={styles.sectionFooterSpacer} />;

      return (
        <TouchableOpacity
          style={styles.sectionExpandBtn}
          onPress={() => toggleSectionExpansion(section.title)}
        >
          <Text style={styles.sectionExpandText}>
            Xem thêm {section.title.toLowerCase()} ({section.actualDataCount - RESULTS_PER_PAGE})
          </Text>
          <Text style={styles.sectionExpandIcon}>expand_more</Text>
        </TouchableOpacity>
      );
    },
    [toggleSectionExpansion],
  );

  const keyExtractorResult = useCallback(
    (item, index) =>
      `result-${item.type}-${item.id || item.messageId || item.userId || index}`,
    [],
  );

  const keyExtractorRecent = useCallback(
    (item, index) => `recent-${index}-${item}`,
    [],
  );

  const ListFooter = null; // No global load more, use section footers

  // ── Render ────────────────────────────────────────────────────────────────

  const showLoading = isLoading && query.trim().length >= 2;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={goBack}>
          <Text style={styles.backIcon}>arrow_back</Text>
        </TouchableOpacity>

        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>search</Text>
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder="Tìm tên, email, tin nhắn..."
            placeholderTextColor="rgba(0,0,0,0.4)"
            value={query}
            onChangeText={handleChangeText}
            onSubmitEditing={handleSubmitEditing}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          // Do NOT disable input while loading — bad UX on slow connections
          />
          {query.length > 0 && (
            <TouchableOpacity style={styles.clearBtn} onPress={handleClear}>
              <Text style={styles.clearIcon}>close</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Body ── */}
      {showLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#0058bc" size="large" />
        </View>
      ) : showRecents ? (
        <View style={{ flex: 1 }}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Tìm kiếm gần đây</Text>
            <TouchableOpacity
              style={styles.clearHistoryBtn}
              onPress={clearRecentSearches}
            >
              <Text style={styles.clearHistoryText}>Xóa tất cả</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={recentSearches}
            keyExtractor={keyExtractorRecent}
            renderItem={renderRecent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          />
        </View>
      ) : limitedSections.length > 0 ? (
        <SectionList
          style={{ flex: 1 }}
          sections={limitedSections}
          keyExtractor={keyExtractorResult}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          renderSectionFooter={renderSectionFooter}
          ListFooterComponent={ListFooter}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'on-drag' : 'none'}
          showsVerticalScrollIndicator={false}
          // Performance tuning for large lists
          removeClippedSubviews={Platform.OS === 'android'}
          maxToRenderPerBatch={10}
          windowSize={5}
          initialNumToRender={10}
        />
      ) : query.trim().length >= 2 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>search_off</Text>
          <Text style={styles.emptyText}>Không tìm thấy kết quả nào</Text>
        </View>
      ) : (
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>edit_note</Text>
          <Text style={styles.emptyText}>Nhập ít nhất 2 ký tự để tìm kiếm</Text>
        </View>
      )}
    </View>
  );
}