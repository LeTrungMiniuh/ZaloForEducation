import { StyleSheet, Dimensions } from 'react-native';
import { Colors, Typography } from '../../../constants/Theme';

const { width, height } = Dimensions.get('window');

export default StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1a1a1a', // Deep dark for calls
    zIndex: 1000,
  },
  content: {
    flex: 1,
    paddingTop: 80,
    paddingBottom: 60,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  userInfo: {
    alignItems: 'center',
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.2)',
    marginBottom: 20,
  },
  name: {
    ...Typography.h2,
    color: '#fff',
    fontSize: 28,
  },
  status: {
    ...Typography.body,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 8,
    fontSize: 16,
  },
  timer: {
    ...Typography.h1,
    color: '#fff',
    fontSize: 32,
    fontVariant: ['tabular-nums'],
  },
  videoStage: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  remoteHeader: {
    position: 'absolute',
    top: 52,
    alignSelf: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
  },
  remoteHeaderName: {
    ...Typography.body,
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  remoteHeaderTimer: {
    ...Typography.body,
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  cameraOffContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#101010',
    paddingHorizontal: 24,
  },
  cameraOffAvatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
    marginBottom: 12,
    opacity: 0.82,
  },
  cameraOffIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 26,
    color: '#fff',
    marginBottom: 6,
  },
  cameraOffTitle: {
    ...Typography.body,
    color: 'rgba(255,255,255,0.86)',
    fontSize: 14,
    textAlign: 'center',
  },
  localPipContainer: {
    position: 'absolute',
    width: 118,
    height: 168,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    elevation: 10,
    zIndex: 9999,
  },
  localCameraOff: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e1e1e',
  },
  localAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    marginBottom: 8,
    opacity: 0.9,
  },
  localCameraOffIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 20,
    color: '#fff',
  },
  localPipBadge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    backgroundColor: 'rgba(0,0,0,0.58)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  localPipBadgeText: {
    ...Typography.body,
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },

  // Actions for Incoming
  incomingActions: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-around',
    paddingHorizontal: 40,
  },
  actionButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  rejectButton: {
    backgroundColor: '#ff3b30',
  },
  acceptButton: {
    backgroundColor: '#4cd964',
  },
  actionIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 32,
    color: '#fff',
  },
  actionLabel: {
    ...Typography.body,
    color: '#fff',
    marginTop: 8,
    fontSize: 14,
  },

  // Actions for Ongoing
  ongoingActions: {
    width: '100%',
    alignItems: 'center',
    gap: 40,
  },
  mediaControls: {
    flexDirection: 'row',
    width: '80%',
    justifyContent: 'space-between',
  },
  mediaButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaButtonActive: {
    backgroundColor: '#fff',
  },
  mediaIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 24,
    color: '#fff',
  },
  mediaIconActive: {
    color: '#1a1a1a',
  },
  hangupButton: {
    backgroundColor: '#ff3b30',
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoControlOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 24,
    backgroundColor: 'transparent',
    gap: 20,
  },
});
