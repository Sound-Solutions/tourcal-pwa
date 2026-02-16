// Authentication Service - CloudKit Apple ID Sign-in

import { CK_CONFIG, getContainer } from '../cloudkit-config.js';

class AuthService {
  constructor() {
    this._user = null;
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
    await this._waitForCloudKit();

    CloudKit.configure({
      containers: [CK_CONFIG]
    });

    this._configured = true;
    const container = getContainer();

    // Set up auth listeners
    container.whenUserSignsIn().then(userIdentity => {
      console.log('[Auth] whenUserSignsIn:', userIdentity?.userRecordName);
      this._user = userIdentity;
      this._notify();
    });

    container.whenUserSignsOut().then(() => {
      console.log('[Auth] whenUserSignsOut');
      this._user = null;
      this._notify();
    });

    // Process auth immediately — the hidden button divs in index.html
    // ensure the elements exist. This also handles redirect callbacks
    // where ckWebAuthToken is in the URL.
    try {
      console.log('[Auth] Calling setUpAuth, URL has token:', window.location.search.includes('ckWebAuthToken'));
      const userIdentity = await container.setUpAuth();
      console.log('[Auth] setUpAuth result:', userIdentity ? 'signed in as ' + userIdentity.userRecordName : 'not signed in');
      if (userIdentity) {
        this._user = userIdentity;
      }
    } catch (e) {
      console.warn('[Auth] setUpAuth error:', e);
    }

    return this._user;
  }

  // Re-render the sign-in button into the visible auth view
  async setupAuthUI() {
    if (!this._configured) await this.init();
    if (this.isSignedIn) return this._user;

    // Move the CloudKit-rendered button from the hidden div to the visible auth view
    const hiddenBtn = document.getElementById('apple-sign-in-button');
    const visibleTarget = document.getElementById('auth-sign-in-button');
    if (hiddenBtn && visibleTarget && hiddenBtn.children.length > 0) {
      // Move the rendered button element
      while (hiddenBtn.children.length > 0) {
        visibleTarget.appendChild(hiddenBtn.children[0]);
      }
    }
    // If button didn't render (e.g. first load), call setUpAuth with visible target
    if (visibleTarget && visibleTarget.children.length === 0) {
      try {
        const container = getContainer();
        await container.setUpAuth();
        // setUpAuth renders into the hidden div, move it
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
    if (!this._configured) return;
    try {
      const container = getContainer();
      await container.signOut();
      this._user = null;
      this._notify();
    } catch (e) {
      console.warn('Sign out error:', e);
    }
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
