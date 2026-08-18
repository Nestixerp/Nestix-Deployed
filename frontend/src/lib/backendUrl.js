// Resolves the backend URL at runtime so the app works on ANY domain it is
// served from (emergent.host subdomain, custom domain, etc.).
// - In local dev (localhost:3000) we must use the built-in preview URL.
// - Everywhere else, frontend and backend share the same origin via ingress.
const origin = typeof window !== 'undefined' ? window.location.origin : '';
const isLocal = origin.includes('localhost') || origin.includes('127.0.0.1');

export const BACKEND_URL = isLocal
  ? process.env.REACT_APP_BACKEND_URL
  : origin || process.env.REACT_APP_BACKEND_URL;

export default BACKEND_URL;
