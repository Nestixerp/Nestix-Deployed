import axios from 'axios';
import BACKEND_URL from '../lib/backendUrl';

const API_BASE = `${BACKEND_URL}/api`;

// Get token from localStorage
const getToken = () => {
  const currentUser = localStorage.getItem('currentUser');
  if (currentUser) {
    const user = JSON.parse(currentUser);
    return user.token;
  }
  return null;
};

// Create axios instance with auth
const apiClient = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
apiClient.interceptors.request.use(
  (config) => {
    const token = getToken();
    console.log('API Request:', config.url);
    console.log('Token available:', token ? 'Yes' : 'No');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      console.log('Authorization header set');
    } else {
      console.warn('No token available for request');
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor for better error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.error('401 Unauthorized - Token may be invalid or expired');
      console.error('Error details:', error.response?.data);
      
      // Clear invalid token and redirect to login
      localStorage.removeItem('currentUser');
      
      // Show user-friendly error message
      alert('Your session has expired. Please log in again.');
      
      // Redirect to login
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Authentication API
export const authAPI = {
  login: async (username, password) => {
    const response = await axios.post(`${API_BASE}/auth/login`, {
      username,
      password,
    });
    return response.data;
  },
  logout: async () => {
    const response = await apiClient.post('/auth/logout');
    return response.data;
  },
};

// Materials API
export const materialsAPI = {
  getAll: async (filters = {}) => {
    const response = await apiClient.get('/materials', { params: filters });
    return response.data;
  },
  getForQuoting: async () => {
    const response = await apiClient.get('/materials/for-quoting');
    return response.data;
  },
  getById: async (id) => {
    const response = await apiClient.get(`/materials/${id}`);
    return response.data;
  },
  create: async (materialData) => {
    const response = await apiClient.post('/materials', materialData);
    return response.data;
  },
  adjustStock: async (adjustmentData) => {
    const response = await apiClient.post('/materials/adjust-stock', adjustmentData);
    return response.data;
  },
  getHistory: async (materialId) => {
    const response = await apiClient.get(`/materials/${materialId}/history`);
    return response.data;
  },
};

// Quotes API
export const quotesAPI = {
  getAll: async (filters = {}) => {
    const response = await apiClient.get('/quotes', { params: filters });
    return response.data;
  },
  getById: async (id) => {
    const response = await apiClient.get(`/quotes/${id}`);
    return response.data;
  },
  getByItemNumber: async (itemNumber) => {
    const response = await apiClient.get(`/quotes/item-number/${itemNumber}`);
    return response.data;
  },
  create: async (quoteData) => {
    const response = await apiClient.post('/quotes', quoteData);
    return response.data;
  },
  update: async (id, quoteData) => {
    const response = await apiClient.put(`/quotes/${id}`, quoteData);
    return response.data;
  },
  delete: async (id) => {
    const response = await apiClient.delete(`/quotes/${id}`);
    return response.data;
  },
  calculateMaterialCost: async (materialType, thickness, grade, finish) => {
    const response = await apiClient.get('/quotes/material-cost/calculate', {
      params: {
        material_type: materialType,
        thickness,
        grade,
        finish,
      },
    });
    return response.data;
  },
};

export default apiClient;
