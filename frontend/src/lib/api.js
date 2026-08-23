import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:4000/api/v1",
});
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("scheduler_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("scheduler_token");
      window.dispatchEvent(new Event("scheduler:auth-invalid"));
    }
    return Promise.reject(error);
  },
);

export default api;
