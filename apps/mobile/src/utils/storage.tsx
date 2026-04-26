import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * Robust Storage Utility to handle AsyncStorage across different environments.
 * Handles the potential ".default" wrap in react-native-web/monorepo setups.
 */
const getStorage = () => {
    return AsyncStorage;
};

const Storage = {
    setItem: async (key: string, value: string) => {
        try {
            await getStorage().setItem(key, value);
        } catch (e) {
            console.error('[Storage] Error saving data:', e);
            throw e;
        }
    },
    getItem: async (key: string) => {
        try {
            return await getStorage().getItem(key);
        } catch (e) {
            console.error('[Storage] Error reading data:', e);
            return null;
        }
    },
    removeItem: async (key: string) => {
        try {
            await getStorage().removeItem(key);
        } catch (e) {
            console.error('[Storage] Error removing data:', e);
        }
    },
    clear: async () => {
        try {
            await getStorage().clear();
        } catch (e) {
            console.error('[Storage] Error clearing storage:', e);
        }
    }
};

export default Storage;
