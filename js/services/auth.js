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
      console.log('[Auth] Validating token...');
      const user = await this._validateToken(token);
      if (user) {
        this._webAuthToken = token;
        localStorage.setItem(TOKEN_KEY, token);
        this._user = user;
        console.log('[Auth] Signed in as:', user.userRecordName);
        if (redirectToken) {
          window.history.replaceState({}, '', window.location.pathname);
        }
        return this._user;
      } else if (redirectToken) {
        // Apple gave us this token via redirect - trust it even if
        // validation got a 421 (HTTP/2 browser issue). The first real
        // API call will confirm whether the token actually works.
        console.log('[Auth] Storing redirect token despite validation failure');
        this._webAuthToken = token;
        localStorage.setItem(TOKEN_KEY, token);
        this._user = { userRecordName: '_pending_' };
        window.history.replaceState({}, '', window.location.pathname);
        return this._user;
      } else {
        console.log('[Auth] Token invalid, clearing');
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(SESSION_KEY);
      }
    }

    return this._user;
  }

  // Call ONCE after the auth view DOM is rendered with #apple-sign-in-button
  async setupAuthUI() {
    if (this._settingUp) return;
    this._settingUp = true;

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

    try {
      await container.setUpAuth();
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
    const url = `${API_BASE}/private/users/caller?ckAPIToken=${API_TOKEN}&ckWebAuthToken=${encodeURIComponent(token)}`;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url);
        if (res.status === 421) {
          console.warn(`[Auth] 421 Misdirected Request (attempt ${attempt + 1}), retrying...`);
          await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
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
        console.warn(`[Auth] Token validation error (attempt ${attempt + 1}):`, e);
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 500));
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
    const url = `${API_BASE}${path}${separator}ckAPIToken=${API_TOKEN}&ckWebAuthToken=${encodeURIComponent(token)}`;

    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(url, options);
      if (res.status === 421) {
        console.warn(`[Auth] 421 on ${path} (attempt ${attempt + 1}), retrying...`);
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      if (res.status === 401) {
        this._user = null;
        this._webAuthToken = null;
        localStorage.removeItem(TOKEN_KEY);
        this._notify();
        throw new Error('Session expired');
      }
      // If user was pending, update with real info on first success
      if (this._user?.userRecordName === '_pending_' && res.ok) {
        this._resolveUser(token);
      }
      return res;
    }
    throw new Error('API request failed after retries (421)');
  }

  // Background resolve of user identity after pending auth
  async _resolveUser(token) {
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
