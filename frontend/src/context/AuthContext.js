import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';
import api from '../services/api';
import { setSystemTimezone } from '../utils/dateFormatter';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Version check - force re-login if modules structure changed
    const AUTH_VERSION = '1.6'; // Increment this to force all users to re-login
    const storedVersion = localStorage.getItem('authVersion');
    
    if (storedVersion !== AUTH_VERSION) {
      // Clear old data and force re-login
      localStorage.removeItem('currentUser');
      localStorage.setItem('authVersion', AUTH_VERSION);
      setLoading(false);
      return;
    }
    
    // Check if user is logged in from localStorage
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
      try {
        const userData = JSON.parse(storedUser);
        setCurrentUser(userData);
        setIsAuthenticated(true);
        // Fetch timezone settings after restoring user
        fetchTimezoneSettings();
      } catch (error) {
        console.error('Error parsing stored user:', error);
        localStorage.removeItem('currentUser');
      }
    }
    setLoading(false);
  }, []);

  const fetchTimezoneSettings = async () => {
    try {
      const response = await api.get('/settings');
      if (response.data && response.data.timezone) {
        setSystemTimezone(response.data.timezone);
        console.log('System timezone set to:', response.data.timezone);
      }
    } catch (error) {
      console.error('Error fetching timezone settings:', error);
      // Use default timezone
      setSystemTimezone('Australia/Melbourne');
    }
  };

  const login = async (username, password) => {
    try {
      console.log('Attempting login for:', username);
      const response = await authAPI.login(username, password);
      console.log('Login response received:', response);
      
      // Store user with token
      const userData = {
        ...response.user,
        token: response.access_token
      };
      
      console.log('User data to store:', { ...userData, token: '***REDACTED***' });
      
      setCurrentUser(userData);
      setIsAuthenticated(true);
      localStorage.setItem('currentUser', JSON.stringify(userData));
      
      // Fetch timezone settings after successful login
      await fetchTimezoneSettings();
      
      console.log('Login successful, token stored in localStorage');
      
      return { success: true, user: userData };
    } catch (error) {
      console.error('Login error:', error);
      return { 
        success: false, 
        error: error.response?.data?.detail || 'Invalid credentials' 
      };
    }
  };

  const logout = async () => {
    try {
      await authAPI.logout();
    } catch (error) {
      console.error('Logout error:', error);
    }
    
    setCurrentUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem('currentUser');
  };

  const hasModuleAccess = (moduleId) => {
    if (!currentUser) return false;
    return currentUser.modules?.includes(moduleId);
  };

  return (
    <AuthContext.Provider value={{
      currentUser,
      isAuthenticated,
      loading,
      login,
      logout,
      hasModuleAccess
    }}>
      {children}
    </AuthContext.Provider>
  );
};
