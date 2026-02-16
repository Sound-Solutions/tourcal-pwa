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
      <div id="apple-sign-in-button"></div>
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
