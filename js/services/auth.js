// Authentication Service - CloudKit Apple ID Sign-in
// Manually handles URL redirect tokens since CloudKit JS 2.6.4
// doesn't process ckWebAuthToken from the redirect URL.

import { CK_CONFIG, getContainer } from '../cloudkit-config.js';

const TOKEN_KEY = 'tourcal_ckWebAuthToken';
const SESSION_KEY = 'tourcal_ckSession';
const API_BASE = `https://api.apple-cloudkit.com/database/1/${CK_CONFIG.containerIdentifier}/${CK_CONFIG.environment}`;
const API_TOKEN = CK_CONFIG.apiTokenAuth.apiToken;

class AuthService {
  constructor() {
    this._user = null;
    this._webAuthToken = null;
    this._listeners = [];
    this._configured = false;
    this._listenersRegistered = false;
    this._settingUp = false;
  }

  get isSignedIn() {
    return this._user !== null;
  }

  get user() {
    return this._user;
  }

  get userRecordName() {
    return this._user?.userRecordName || null;
  }

  get webAuthToken() {
    return this._webAuthToken;
  }

  onAuthChange(callback) {
    this._listeners.push(callback);
    return () => {
      this._listeners = this._listeners.filter(l => l !== callback);
    };
  }

  _notify() {
    this._listeners.forEach(cb => cb(this._user));
  }

  async init() {
    // Step 1: Check for redirect tokens in URL
    const redirectToken = this._extractRedirectToken();

    // Step 2: Try redirect token or stored token
    const token = redirectToken || localStorage.getItem(TOKEN_KEY);

    if (token) {
      this._webAuthToken = token;
      localStorage.setItem(TOKEN_KEY, token);

      if (redirectToken) {
        // Fresh sign-in redirect — validate and resolve identity
        console.log('[Auth] Validating redirect token...');
        window.history.replaceState({}, '', window.location.pathname);
        const user = await this._validateToken(token);
        if (user) {
          this._user = user;
          console.log('[Auth] Signed in as:', user.userRecordName);
        } else {
          // Validation failed but trust token anyway
          console.log('[Auth] Validation failed for redirect token, trusting it');
          this._user = { userRecordName: '_pending_' };
          await new Promise(r => setTimeout(r, 1500));
        }
      } else {
        // Already-stored token — skip validation entirely to avoid 421 storm.
        // The token will be tested implicitly by the first data fetch.
        // If expired, apiFetch's 401 handler will clear auth and sign out.
        console.log('[Auth] Using stored token (skipping validation)');
        this._user = { userRecordName: '_pending_' };
      }

      return this._user;
    }

    return this._user;
  }

  // Call after the auth view DOM is rendered with #apple-sign-in-button.
  // Safe to call multiple times - refreshes the OAuth token each time.
  async setupAuthUI() {
    if (this._settingUp) return;
    this._settingUp = true;

    try {
      await this._waitForCloudKit();

      if (!this._configured) {
        CloudKit.configure({
          containers: [CK_CONFIG]
        });
        this._configured = true;
      }

      const container = getContainer();

      // Only register listeners once
      if (!this._listenersRegistered) {
        this._listenersRegistered = true;

        container.whenUserSignsIn().then(userIdentity => {
          console.log('[Auth] whenUserSignsIn:', userIdentity?.userRecordName);
          this._user = userIdentity;
          this._notify();
        });

        container.whenUserSignsOut().then(() => {
          console.log('[Auth] whenUserSignsOut');
          const wasSignedIn = this._user !== null;
          this._user = null;
          this._webAuthToken = null;
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(SESSION_KEY);
          // Only notify if state actually changed
          if (wasSignedIn) {
            this._notify();
          }
        });
      }

      // Force same-window redirect instead of CloudKit JS opening a popup tab.
      // CloudKit JS calls window.open() for Apple sign-in; we intercept it
      // so the auth flow stays in the same window for better UX.
      if (!window._ckOpenPatched) {
        const originalOpen = window.open;
        window.open = function(url, ...args) {
          if (url && typeof url === 'string' && url.includes('apple.com') && url.includes('auth')) {
            console.log('[Auth] Redirecting to Apple sign-in (same window)');
            window.location.href = url;
            return null;
          }
          return originalOpen.call(this, url, ...args);
        };
        window._ckOpenPatched = true;
      }

      await container.setUpAuth();
      console.log('[Auth] setUpAuth completed');
    } catch (e) {
      console.warn('[Auth] setUpAuth error:', e);
    }

    this._settingUp = false;
  }

  _extractRedirectToken() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('ckWebAuthToken');
    const session = params.get('ckSession');
    if (token) {
      console.log('[Auth] Found redirect token in URL');
      if (session) localStorage.setItem(SESSION_KEY, session);
      return token;
    }
    return null;
  }

  async _validateToken(token) {
    const baseURL = `${API_BASE}/private/users/caller?ckAPIToken=${API_TOKEN}&ckWebAuthToken=${encodeURIComponent(token)}`;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const url = `${baseURL}&_t=${Date.now()}&_a=${attempt}`;
        const res = await fetch(url, { cache: 'no-store' });
        if (res.status === 421) {
          console.warn(`[Auth] 421 Misdirected Request (attempt ${attempt + 1}/5), retrying...`);
          const delay = 200 * Math.pow(2, attempt);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        if (!res.ok) {
          console.warn('[Auth] Token validation failed:', res.status);
          return null;
        }
        const data = await res.json();
        console.log('[Auth] Validated user:', data.userRecordName);
        return {
          userRecordName: data.userRecordName,
          nameComponents: data.nameComponents || null,
          lookupInfo: data.lookupInfo || null
        };
      } catch (e) {
        console.warn(`[Auth] Token validation error (attempt ${attempt + 1}/5):`, e);
        if (attempt < 4) {
          await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }
        return null;
      }
    }
    return null;
  }

  async signOut() {
    this._user = null;
    this._webAuthToken = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(SESSION_KEY);
    if (this._configured) {
      try {
        const container = getContainer();
        await container.signOut();
      } catch (e) { /* ignore */ }
    }
    this._notify();
  }

  async apiFetch(path, options = {}) {
    const token = this._webAuthToken || localStorage.getItem(TOKEN_KEY);
    if (!token) throw new Error('Not authenticated');

    const separator = path.includes('?') ? '&' : '?';
    const baseUrl = `${API_BASE}${path}${separator}ckAPIToken=${API_TOKEN}&ckWebAuthToken=${encodeURIComponent(token)}`;

    const url = `${baseUrl}&_t=${Date.now()}`;
    try {
      const res = await fetch(url, { ...options, cache: 'no-store' });
      if (res.status === 421 || res.status === 401) {
        // 401 = token expired. 421 from Apple = session no longer valid (same treatment).
        // Both mean we need to sign in again.
        console.warn(`[Auth] ${res.status} on ${path} — session expired, signing out`);
        this._user = null;
        this._webAuthToken = null;
        localStorage.removeItem(TOKEN_KEY);
        this._notify();
        throw new Error('Session expired');
      }
      if (this._user?.userRecordName === '_pending_' && res.ok) {
        this._resolveUser(token);
      }
      return res;
    } catch (e) {
      if (e.message === 'Session expired') throw e;
      console.warn(`[Auth] Network error on ${path}:`, e.message);
      throw e;
    }
  }

  // Background resolve of user identity after pending auth (one attempt only)
  async _resolveUser(token) {
    if (this._resolveAttempted) return;
    this._resolveAttempted = true;
    try {
      const user = await this._validateToken(token);
      if (user) {
        this._user = user;
        console.log('[Auth] Resolved pending user:', user.userRecordName);
      }
    } catch (e) { /* ignore */ }
  }

  _waitForCloudKit() {
    return new Promise((resolve, reject) => {
      if (typeof CloudKit !== 'undefined') {
        resolve();
        return;
      }
      let attempts = 0;
      const check = setInterval(() => {
        attempts++;
        if (typeof CloudKit !== 'undefined') {
          clearInterval(check);
          resolve();
        } else if (attempts > 100) {
          clearInterval(check);
          reject(new Error('CloudKit JS failed to load'));
        }
      }, 100);
    });
  }
}

export const authService = new AuthService();
