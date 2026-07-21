const { expect } = require('@playwright/test');
const { EMAIL, PASSWORD } = require('./auth');

// The API may live on a different origin than the UI:
//   • local dev  → UI on :5173, API on :5000  → set SQA_API_URL=http://localhost:5000
//   • Vercel     → same origin                 → SQA_API_URL defaults to SQA_BASE_URL
const API_BASE = (process.env.SQA_API_URL || process.env.SQA_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '');
const apiUrl = (p) => `${API_BASE}${p.startsWith('/') ? '' : '/'}${p}`;

// Log in over the API and return a JWT.
async function getToken(request, email = EMAIL, password = PASSWORD) {
  const res = await request.post(apiUrl('/api/auth/login'), { data: { email, password } });
  expect(res.ok(), `login should succeed for ${email} (got HTTP ${res.status()})`).toBeTruthy();
  const body = await res.json();
  return body.data.token;
}

const auth = (token) => ({ headers: { Authorization: `Bearer ${token}` } });

// Unique, identifiable tag so SQA-created records can be found and cleaned up.
let seq = 0;
const tag = () => `SQA-${Date.now()}-${seq++}`;

module.exports = { API_BASE, apiUrl, getToken, auth, tag };
