// Auth View - Apple ID Sign-in Screen

export function renderAuthView() {
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
        <div id="apple-sign-in-label">
          <svg width="18" height="22" viewBox="0 0 18 22" fill="black">
            <path d="M15.1 11.7c0-3.2 2.6-4.7 2.7-4.8-1.5-2.2-3.8-2.5-4.6-2.5-2-.2-3.8 1.2-4.8 1.2-1 0-2.5-1.1-4.1-1.1C2 4.5 0 6.4 0 10.2c0 2.2.9 4.6 1.9 6.1 1.1 1.5 2.4 3.2 4.1 3.1 1.6-.1 2.2-1.1 4.2-1.1 1.9 0 2.5 1.1 4.2 1 1.8 0 2.9-1.5 3.9-3.1 1.2-1.8 1.7-3.5 1.8-3.6-.1 0-3-1.2-3-4.9zM12.3 3c.8-1 1.4-2.5 1.3-3.9-1.2 0-2.7.8-3.6 1.8-.8.9-1.5 2.3-1.3 3.7 1.4.1 2.8-.7 3.6-1.6z"/>
          </svg>
          Sign in with Apple
        </div>
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
}
