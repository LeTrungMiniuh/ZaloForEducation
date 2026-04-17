import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';

import SplashScreen from './components/SplashScreen';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import LandingPage from './pages/LandingPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import SessionsPage from './pages/SessionsPage';
import ProfilePage from './pages/ProfilePage';
import SettingsPage from './pages/SettingsPage';
import FriendRequestForm from './pages/FriendRequestForm';
import './App.css';

// Component bảo vệ Route
const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null; // Sẽ được SplashScreen che phủ
  return user ? <>{children}</> : <Navigate to="/login" />;
};

// Component cho Landing Page (Nếu đăng nhập rồi thì vào thẳng app)
const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/chat" /> : <>{children}</>;
};

// Import Layouts & Pages
import MainLayout from './components/layout/MainLayout';
import ChatPage from './pages/chat/ChatPage';
import ContactPage from './pages/contacts/ContactPage';
import { NotificationPage, CloudPage } from './pages/notifications/NotificationPage';

const AppContent: React.FC = () => {
  const { loading } = useAuth();
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!loading) {
        setShowSplash(false);
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [loading]);

  return (
    <>
      <SplashScreen isVisible={showSplash} />
      
      <div className={`app-container ${showSplash ? 'opacity-0' : 'opacity-100 transition-opacity duration-1000 delay-500'}`}>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
          <Route path="/forgot-password" element={<PublicRoute><ForgotPasswordPage /></PublicRoute>} />

          {/* Authenticated Routes with MainLayout */}
          <Route element={<PrivateRoute><MainLayout /></PrivateRoute>}>
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/contacts" element={<ContactPage />} />
            <Route path="/notifications" element={<NotificationPage />} />
            <Route path="/cloud" element={<CloudPage />} />
            
            {/* These pages now have the Sidebar too */}
            <Route path="/sessions" element={<SessionsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/friends" element={<FriendRequestForm />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </>
  );
}

function App() {
  return (
    <Router>
      <GoogleOAuthProvider clientId="1094444929007-avg6u84ak9i7n9ggnc543e1prb4otv9g.apps.googleusercontent.com">
        <ThemeProvider>
          <AuthProvider>
            <AppContent />
          </AuthProvider>
        </ThemeProvider>
      </GoogleOAuthProvider>
    </Router>
  );
}

export default App;
