import React from 'react';
import { useGoogleOneTapLogin } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext';

interface GoogleOneTapPromptProps {
  onSuccess?: (response: unknown) => void;
  onError?: (error: unknown) => void;
}

const GoogleOneTapPrompt: React.FC<GoogleOneTapPromptProps> = ({ onSuccess, onError }) => {
  const { googleLogin } = useAuth();

  useGoogleOneTapLogin({
    onSuccess: async (credentialResponse) => {
      if (!credentialResponse.credential) return;
      
      try {
        const res = await googleLogin(credentialResponse.credential);
        if (res.success) {
          window.location.href = '/chat';
        } else if (onSuccess) {
          onSuccess(res);
        }
      } catch (err: unknown) {
        console.error('Google One Tap Login Error:', err);
        if (onError) onError(err);
      }
    },
    onError: () => {
      console.log('Google One Tap Login Failed');
      if (onError) onError('Login Failed');
    },
    disabled: false, // Set to true if you want to disable based on some logic
  });

  return null; // This component handles the UI trigger and is invisible
};

export default GoogleOneTapPrompt;
