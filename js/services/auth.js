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
    // Wait for CloudKit JS to load
    await this._waitForCloudKit();

    CloudKit.configure({
      containers: [CK_CONFIG]
    });

    this._configured = true;
    const container = getContainer();

    // Set up auth listeners
    container.whenUserSignsIn().then(userIdentity => {
      this._user = userIdentity;
      this._notify();
    });

    container.whenUserSignsOut().then(() => {
      this._user = null;
      this._notify();
    });

    return this._user;
  }

  // Call after the DOM has the #apple-sign-in-button element
  async setupAuthUI() {
    if (!this._configured) await this.init();
    try {
      const container = getContainer();
      const userIdentity = await container.setUpAuth();
      if (userIdentity) {
        this._user = userIdentity;
        this._notify();
      }
    } catch (e) {
      console.warn('Auth setup error:', e);
    }
    return this._user;
  }

  async signIn() {
    if (!this._configured) await this.init();
    // CloudKit JS handles the sign-in UI via the configured button
    // This triggers the Apple ID sign-in flow
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
