import React from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext';

interface GoogleLoginButtonProps {
  onSuccess?: (response: unknown) => void;
  onError?: (error: unknown) => void;
  isLoading?: boolean;
}

const GoogleLoginButton: React.FC<GoogleLoginButtonProps> = (props) => {
  const auth = useAuth();

  useGoogleLogin({
    onSuccess: async () => {
      // Note: useGoogleLogin by default returns an access token, but we need an ID token for backend verification
      // However, @react-oauth/google's useGoogleLogin can be configured for implicit or auth code flow.
      // For ID Token, we usually use the Google Login button component or GSI directly.
      // Actually, let's use the standard GoogleLogin component for the ID Token as requested.
      void auth.googleLogin;
    },
    onError: (error) => {
      console.error('Google Login Failed:', error);
      if (props.onError) props.onError(error);
    },
  });

  return null; // I will use the standard GoogleLogin component in the pages instead of a custom hook for ID Token convenience
};

export default GoogleLoginButton;
