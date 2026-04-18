import React, { useState, useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { AuthProvider, useAuth } from "./context/AuthContext";

import SplashScreen from "./components/SplashScreen";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import HomePage from "./pages/HomePage";
import LandingPage from "./pages/LandingPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import SessionsPage from "./pages/SessionsPage";
import ProfilePage from "./pages/ProfilePage";
import SettingsPage from "./pages/SettingsPage";
import ContactsPage from "./pages/ContactsPage";
import "./App.css";

// Component bảo vệ Route
const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
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

const AppContent: React.FC = () => {
  const { loading } = useAuth();
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    // Luôn hiển thị Splash tối thiểu 2s để tạo cảm giác Premium
    const timer = setTimeout(() => {
      if (!loading) {
        setShowSplash(false);
      }
    }, 2000);

    // Nếu loading xong nhưng timer chưa xong thì timer sẽ handle
    // Nếu timer xong nhưng loading chưa xong thì useEffect [loading] sẽ handle
    return () => clearTimeout(timer);
  }, [loading]);

  return (
    <>
      <SplashScreen isVisible={showSplash} />

      <div
        className={`app-container ${showSplash ? "opacity-0" : "opacity-100 transition-opacity duration-1000 delay-500"}`}
      >
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route
            path="/login"
            element={
              <PublicRoute>
                <LoginPage />
              </PublicRoute>
            }
          />
          <Route
            path="/register"
            element={
              <PublicRoute>
                <RegisterPage />
              </PublicRoute>
            }
          />
          <Route
            path="/forgot-password"
            element={
              <PublicRoute>
                <ForgotPasswordPage />
              </PublicRoute>
            }
          />
          <Route
            path="/chat"
            element={
              <PrivateRoute>
                <HomePage />
              </PrivateRoute>
            }
          />
          <Route
            path="/sessions"
            element={
              <PrivateRoute>
                <SessionsPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <PrivateRoute>
                <ProfilePage />
              </PrivateRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <PrivateRoute>
                <SettingsPage />
              </PrivateRoute>
            }
          />
          <Route path="/friends" element={<Navigate to="/contacts" />} />
          <Route
            path="/contacts"
            element={
              <PrivateRoute>
                <ContactsPage />
              </PrivateRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </>
  );
};

function App() {
  return (
    <Router>
      <GoogleOAuthProvider clientId="1094444929007-avg6u84ak9i7n9ggnc543e1prb4otv9g.apps.googleusercontent.com">
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </GoogleOAuthProvider>
    </Router>
  );
}

export default App;
