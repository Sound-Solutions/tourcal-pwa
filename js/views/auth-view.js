// Auth View - Apple ID Sign-in Screen

import { authService } from '../services/auth.js';

let _authRefreshInterval = null;

export function renderAuthView() {
  // Clear any previous refresh interval
  if (_authRefreshInterval) {
    clearInterval(_authRefreshInterval);
    _authRefreshInterval = null;
  }

  const content = document.getElementById('app-content');
  content.innerHTML = `
    <div class="auth-view">
      <div class="auth-logo">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <rect x="8" y="12" width="32" height="24" rx="3" stroke="white" stroke-width="2.5" fill="none"/>
          <line x1="8" y1="20" x2="40" y2="20" stroke="white" stroke-width="2"/>
          <circle cx="14" cy="16" r="1.5" fill="white"/>
          <circle cx="20" cy="16" r="1.5" fill="white"/>
          <circle cx="26" cy="16" r="1.5" fill="white"/>
        </svg>
      </div>
      <div>
        <h1 class="auth-title">TourCal</h1>
        <p class="auth-subtitle">Tour schedules, day sheets, setlists,<br>and bus stock — all in one place.</p>
      </div>
      <div class="sign-in-wrapper">
        <div id="apple-sign-in-button"></div>
        <div id="apple-sign-in-label">Sign in with Apple</div>
      </div>
      <div id="apple-sign-out-button" style="display:none;"></div>
      <p class="auth-footer">
        Sign in with your Apple ID to access<br>tours shared with you from the TourCal app.
      </p>
    </div>
  `;

  // Hide nav bar on auth screen
  document.getElementById('app-nav').classList.add('hidden');
  document.getElementById('header-title').textContent = 'TourCal';
  document.getElementById('header-actions').innerHTML = '';

  // Refresh the CloudKit OAuth token every 4 minutes to prevent
  // "OAuth Token expired" errors on Apple's sign-in page
  _authRefreshInterval = setInterval(() => {
    console.log('[AuthView] Refreshing OAuth token...');
    authService.setupAuthUI();
  }, 4 * 60 * 1000);

  // Also refresh when the user returns to this tab
  document.addEventListener('visibilitychange', _onVisibilityChange);
}

function _onVisibilityChange() {
  if (document.visibilityState === 'visible' && document.getElementById('apple-sign-in-button')) {
    console.log('[AuthView] Page visible, refreshing OAuth token...');
    authService.setupAuthUI();
  }
}

export function cleanupAuthView() {
  if (_authRefreshInterval) {
    clearInterval(_authRefreshInterval);
    _authRefreshInterval = null;
  }
  document.removeEventListener('visibilitychange', _onVisibilityChange);
}
