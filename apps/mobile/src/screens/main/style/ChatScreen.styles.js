import { StyleSheet, Platform } from 'react-native';
import { Colors } from '../../../constants/Theme';

export default StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7fb',
  },
  header: {
    paddingBottom: 12,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 60,
  },
  backButton: {
    padding: 8,
    marginRight: 4,
  },
  backIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 28,
    color: '#fff',
  },
  headerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  onlineBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4CAF50',
    borderWidth: 2,
    borderColor: '#0058bc',
  },
  headerText: {
    flex: 1,
  },
  name: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  status: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 1,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIconButton: {
    padding: 8,
    marginLeft: 4,
  },
  headerIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 24,
    color: '#fff',
  },
  
  // Pin Strip
  pinStrip: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    flexDirection: 'column',
    maxHeight: 120,
  },
  pinItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 2,
  },
  pinIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 16,
    color: Colors.primary,
    marginRight: 8,
  },
  pinText: {
    flex: 1,
    fontSize: 13,
    color: '#444',
  },
  pinUnpin: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '600',
    paddingLeft: 8,
  },

  // List
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 20,
    paddingBottom: 20,
  },

  // Overlay & Action Sheet
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  actionSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
  },
  reactionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#f8f9fa',
    borderRadius: 30,
    padding: 10,
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  reactionOption: {
    padding: 6,
  },
  reactionEmoji: {
    fontSize: 28,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  actionItem: {
    width: '23%',
    alignItems: 'center',
    marginBottom: 15,
  },
  actionIconBox: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 24,
  },
  actionText: {
    fontSize: 12,
    color: '#444',
    textAlign: 'center',
  },
  actionList: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 10,
  },
  actionListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  actionListIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 22,
    color: '#444',
    marginRight: 12,
  },
  actionListText: {
    fontSize: 16,
    color: '#111',
  },

  // Forward Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  forwardSheet: {
    backgroundColor: '#fff',
    height: '70%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
  },
  closeIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 24,
    color: '#666',
  },
  forwardList: {
    flex: 1,
  },
  forwardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  forwardAvatar: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    backgroundColor: '#eee',
    marginRight: 12,
  },
  forwardName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#111',
  },
  forwardSendIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 20,
    color: Colors.primary,
  },
});
