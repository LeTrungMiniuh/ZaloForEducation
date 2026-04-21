import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Modal, Platform, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { apiRequest } from '../../utils/api';
import Alert from '../../utils/Alert';
import * as LocalAuthentication from 'expo-local-authentication';

const QRScannerScreen = ({ onNavigate, goBack }) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmModal, setConfirmModal] = useState(false);
  const [qrCodeId, setQrCodeId] = useState(null);

  const handleBarCodeScanned = ({ data }) => {
    setScanned(true);
    setQrCodeId(data);
    setConfirmModal(true);
  };

  const confirmLogin = async () => {
    // 1. Check if device has any security (Passcode/PIN)
    const securityLevel = await LocalAuthentication.getEnrolledLevelAsync();
    
    if (securityLevel > 0) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Xác thực bảo mật để tiếp tục',
        fallbackLabel: 'Sử dụng mật mã máy',
      });

      if (!result.success) return;
    }

    // 2. Proceed to API
    setLoading(true);
    try {
      const response = await apiRequest('/auth/qr-confirm', {
        method: 'POST',
        body: JSON.stringify({ 
          qrCodeId,
          isBiometricVerified: false // Flag updated
        }),
      });
      
      if (response.ok) {
        Alert.alert('Thành công', 'Đã đăng nhập thành công trên máy tính!');
        setConfirmModal(false);
        goBack();
      } else {
        Alert.alert('Lỗi', response.message || 'Không thể xác nhận đăng nhập.');
        setScanned(false);
        setConfirmModal(false);
      }
    } catch (error) {
      Alert.alert('Lỗi', 'Có lỗi xảy ra kết nối tới máy chủ.');
      setScanned(false);
      setConfirmModal(false);
    } finally {
      setLoading(false);
    }
  };

  if (!permission) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#006af5" />
        <Text style={{ marginTop: 10 }}>Đang kiểm tra quyền Camera...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Ứng dụng cần quyền Camera để quét mã QR.</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={requestPermission}>
          <Text style={styles.retryText}>Cấp quyền ngay</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ marginTop: 20 }} onPress={goBack}>
          <Text style={{ color: '#666' }}>Quay lại</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn}>
          <Text style={styles.backIcon}>arrow_back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Quét mã QR</Text>
        <View style={{ width: 40 }} />
      </View>

      <CameraView
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ["qr"],
        }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Overlay UI */}
      <View style={styles.overlay}>
        <View style={styles.unfocusedTop} />
        <View style={styles.focusedRow}>
          <View style={styles.unfocusedSide} />
          <View style={styles.focusedContainer}>
            <View style={styles.cornerTopLeft} />
            <View style={styles.cornerTopRight} />
            <View style={styles.cornerBottomLeft} />
            <View style={styles.cornerBottomRight} />
            {scanned && (
               <View style={styles.scannedOverlay}>
                  <ActivityIndicator color="#fff" size="large" />
               </View>
            )}
          </View>
          <View style={styles.unfocusedSide} />
        </View>
        <View style={styles.unfocusedBottom}>
           <Text style={styles.instructionText}>
             Đặt mã QR vào giữa khung hình để đăng nhập nhanh
           </Text>
        </View>
      </View>

      {/* Confirmation Modal */}
      <Modal
        visible={confirmModal}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconBox}>
              <Text style={styles.modalIcon}>important_devices</Text>
            </View>
            <Text style={styles.modalTitle}>Xác nhận đăng nhập</Text>
            
            {loading ? (
              <View style={{ alignItems: 'center', marginVertical: 20 }}>
                <ActivityIndicator size="large" color="#006af5" />
                <Text style={{ marginTop: 12, color: '#666', fontWeight: '500' }}>Đang xác nhận...</Text>
              </View>
            ) : (
              <>
                <Text style={styles.modalDesc}>
                  Bạn có đồng ý đăng nhập tài khoản Zalo Education trên máy tính này không?
                </Text>

                <View style={styles.modalActions}>
                  <TouchableOpacity 
                    style={styles.cancelBtn} 
                    onPress={() => {
                      setConfirmModal(false);
                      setScanned(false);
                    }}
                    disabled={loading}
                  >
                    <Text style={styles.cancelText}>Hủy bỏ</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.confirmBtn} 
                    onPress={confirmLogin}
                    disabled={loading}
                  >
                    <Text style={styles.confirmText}>Đăng nhập</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f2f5' },
  header: {
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    height: Platform.OS === 'ios' ? 100 : 70,
    backgroundColor: 'rgba(0,0,0,0.5)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    zIndex: 10,
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700', fontFamily: 'PlusJakartaSans' },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  backIcon: { fontFamily: 'Material Symbols Outlined', color: '#fff', fontSize: 24 },
  
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  unfocusedTop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  focusedRow: { flexDirection: 'row', height: 260 },
  unfocusedSide: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  focusedContainer: { width: 260, position: 'relative' },
  unfocusedBottom: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', paddingTop: 30 },
  
  cornerTopLeft: { position: 'absolute', top: 0, left: 0, width: 20, height: 20, borderTopWidth: 4, borderLeftWidth: 4, borderColor: '#006af5' },
  cornerTopRight: { position: 'absolute', top: 0, right: 0, width: 20, height: 20, borderTopWidth: 4, borderRightWidth: 4, borderColor: '#006af5' },
  cornerBottomLeft: { position: 'absolute', bottom: 0, left: 0, width: 20, height: 20, borderBottomWidth: 4, borderLeftWidth: 4, borderColor: '#006af5' },
  cornerBottomRight: { position: 'absolute', bottom: 0, right: 0, width: 20, height: 20, borderBottomWidth: 4, borderRightWidth: 4, borderColor: '#006af5' },
  
  instructionText: { color: '#fff', textAlign: 'center', opacity: 0.8, fontSize: 14, paddingHorizontal: 40, lineHeight: 20 },
  scannedOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', maxWidth: 320, backgroundColor: '#fff', borderRadius: 24, padding: 24, alignItems: 'center' },
  modalIconBox: { width: 64, height: 64, backgroundColor: '#eef6ff', borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  modalIcon: { fontFamily: 'Material Symbols Outlined', fontSize: 32, color: '#006af5' },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#1a1a1a', marginBottom: 8, textAlign: 'center' },
  modalDesc: { fontSize: 15, color: '#666', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  modalActions: { flexDirection: 'row', gap: 12, width: '100%' },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#eee', alignItems: 'center' },
  cancelText: { fontWeight: '700', color: '#666' },
  confirmBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#006af5', alignItems: 'center', shadowColor: '#006af5', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  confirmText: { fontWeight: '700', color: '#fff' },

  errorText: { color: '#ff4d4f', fontSize: 16, marginBottom: 20 },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 12, backgroundColor: '#006af5', borderRadius: 12 },
  retryText: { color: '#fff', fontWeight: '700' },
  
  authErrorBox: { 
    width: '100%', 
    backgroundColor: '#fff1f0', 
    borderWidth: 1, 
    borderColor: '#ffa39e', 
    borderRadius: 12, 
    padding: 12, 
    marginBottom: 20 
  },
  authErrorText: { 
    color: '#cf1322', 
    fontSize: 13, 
    fontWeight: '600', 
    textAlign: 'center' 
  }
});

export default QRScannerScreen;
