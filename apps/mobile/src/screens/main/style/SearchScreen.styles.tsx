import { StyleSheet } from 'react-native';
import { Colors } from '../../../constants/Theme';

export default StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f6fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
    paddingTop: 8,
    backgroundColor: '#0058bc',
    gap: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 24,
    color: '#fff',
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    paddingHorizontal: 12,
    height: 38,
    gap: 6,
  },
  searchIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 18,
    color: 'rgba(255,255,255,0.8)',
  },
  searchInput: {
    flex: 1,
    height: 38,
    color: '#fff',
    fontSize: 15,
    paddingVertical: 0,
  },
  clearBtn: {
    padding: 4,
  },
  clearIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 18,
    color: 'rgba(255,255,255,0.8)',
  },
  // SECTIONS
  sectionHeaderContainer: {
    backgroundColor: '#fff',
    borderTopWidth: 8,
    borderTopColor: '#f5f6fa',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0058bc',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionFooterSpacer: {
    height: 8,
    backgroundColor: '#f5f6fa',
  },
  sectionExpandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    gap: 4,
  },
  sectionExpandText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0058bc',
  },
  sectionExpandIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 20,
    color: '#0058bc',
  },
  // RECENT SEARCHES
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  recentIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 18,
    color: '#aaa',
  },
  recentText: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  // RESULT ITEMS
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
    gap: 12,
  },
  resultItemActive: {
    borderWidth: 2,
    borderColor: '#FFD700',
    borderRadius: 8,
    marginHorizontal: -2,
    marginBottom: -1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ddd',
  },
  resultInfo: {
    flex: 1,
  },
  resultName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
  },
  resultSub: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  resultTypeTag: {
    fontSize: 11,
    color: Colors.primary || '#0058bc',
    fontWeight: '600',
    backgroundColor: '#e8f0fe',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  // LOADING / EMPTY
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    gap: 10,
  },
  emptyIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 56,
    color: '#ccc',
  },
  emptyText: {
    fontSize: 14,
    color: '#aaa',
  },
  // Clear history
  clearHistoryBtn: {
    alignSelf: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  clearHistoryText: {
    fontSize: 12,
    color: Colors.primary || '#0058bc',
    fontWeight: '600',
  },
});
