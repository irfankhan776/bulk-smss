import axios from "axios";

// In development: use relative URL → Vite proxy forwards to localhost:4000
// In production: use VITE_API_URL env variable set at Docker build time
export const API_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "/api" : "/api");

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});
