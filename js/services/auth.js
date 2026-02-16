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

    // Step 2: Try stored token or redirect token
    const token = redirectToken || localStorage.getItem(TOKEN_KEY);

    if (token) {
      const user = await this._validateToken(token);
      if (user) {
        this._webAuthToken = token;
        localStorage.setItem(TOKEN_KEY, token);
        this._user = user;
        // Clean up URL
        if (redirectToken) {
          window.history.replaceState({}, '', window.location.pathname);
        }
        return this._user;
      } else {
        // Token expired/invalid
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(SESSION_KEY);
      }
    }

    // Step 3: Configure CloudKit JS for the sign-in button
    await this._configureCloudKit();

    return this._user;
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
    try {
      const url = `${API_BASE}/private/users/caller?ckAPIToken=${API_TOKEN}&ckWebAuthToken=${encodeURIComponent(token)}`;
      const res = await fetch(url);
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
      console.warn('[Auth] Token validation error:', e);
      return null;
    }
  }

  async _configureCloudKit() {
    await this._waitForCloudKit();

    CloudKit.configure({
      containers: [CK_CONFIG]
    });

    this._configured = true;
    const container = getContainer();

    container.whenUserSignsIn().then(userIdentity => {
      console.log('[Auth] whenUserSignsIn:', userIdentity?.userRecordName);
      this._user = userIdentity;
      this._notify();
    });

    container.whenUserSignsOut().then(() => {
      console.log('[Auth] whenUserSignsOut');
      this._user = null;
      this._webAuthToken = null;
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(SESSION_KEY);
      this._notify();
    });

    try {
      await container.setUpAuth();
    } catch (e) {
      console.warn('[Auth] setUpAuth error:', e);
    }
  }

  // Move CloudKit-rendered button into the visible auth view
  async setupAuthUI() {
    if (!this._configured) {
      await this._configureCloudKit();
    }
    if (this.isSignedIn) return this._user;

    const hiddenBtn = document.getElementById('apple-sign-in-button');
    const visibleTarget = document.getElementById('auth-sign-in-button');
    if (hiddenBtn && visibleTarget && hiddenBtn.children.length > 0) {
      while (hiddenBtn.children.length > 0) {
        visibleTarget.appendChild(hiddenBtn.children[0]);
      }
    }
    if (visibleTarget && visibleTarget.children.length === 0) {
      try {
        const container = getContainer();
        await container.setUpAuth();
        if (hiddenBtn && hiddenBtn.children.length > 0) {
          while (hiddenBtn.children.length > 0) {
            visibleTarget.appendChild(hiddenBtn.children[0]);
          }
        }
      } catch (e) {
        console.warn('[Auth] setupAuthUI error:', e);
      }
    }
    return this._user;
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

  // Helper for making authenticated CloudKit REST API calls
  async apiFetch(path, options = {}) {
    const token = this._webAuthToken || localStorage.getItem(TOKEN_KEY);
    if (!token) throw new Error('Not authenticated');

    const separator = path.includes('?') ? '&' : '?';
    const url = `${API_BASE}${path}${separator}ckAPIToken=${API_TOKEN}&ckWebAuthToken=${encodeURIComponent(token)}`;

    const res = await fetch(url, options);
    if (res.status === 401 || res.status === 421) {
      // Token expired
      this._user = null;
      this._webAuthToken = null;
      localStorage.removeItem(TOKEN_KEY);
      this._notify();
      throw new Error('Session expired');
    }
    return res;
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
