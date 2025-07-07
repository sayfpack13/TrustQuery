import axios from "axios";

// Create Axios instance
const axiosClient = axios.create({
  baseURL: process.env.REACT_APP_API_URL || "http://localhost:5000", // use environment variable or default to localhost
});

// Add request interceptor to include JWT token automatically
axiosClient.interceptors.request.use(
  (config) => {
    // Get token from localStorage or wherever you store it
    const token = localStorage.getItem("adminToken");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export default axiosClient;
