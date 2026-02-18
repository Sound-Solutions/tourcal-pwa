// TourCal PWA - Main Entry Point

import { authService } from './services/auth.js';
import { tourService } from './services/tour-service.js';
import { router } from './router.js';
import { renderNavBar, getActiveTab } from './components/nav-bar.js';
import { renderTourPicker } from './components/tour-picker.js';
import { renderAuthView, cleanupAuthView } from './views/auth-view.js';
import { renderTourListView } from './views/tour-list-view.js';
import { renderScheduleView } from './views/schedule-view.js';
import { renderEventDetailView } from './views/event-detail-view.js';
import { renderSetlistView } from './views/setlist-view.js';
import { renderBusStockView, renderBusStockSheetView } from './views/busstock-view.js';
import { renderVenueNotesListView, renderVenueNoteDetailView } from './views/venue-notes-view.js';
import { renderCrewView } from './views/crew-view.js';
import { renderAnnouncementsView } from './views/announcements-view.js';
import { renderInviteView } from './views/invite-view.js';
import { showToast } from './components/toast.js';

// Apply tour color theming
function applyTourColor(tour) {
  if (!tour?.colorHex) return;
  const hex = tour.colorHex.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  document.documentElement.style.setProperty('--tour-color', tour.colorHex);
  document.documentElement.style.setProperty('--tour-color-rgb', `${r}, ${g}, ${b}`);
}

// Update header for tour views
function updateHeaderForTour() {
  const tour = tourService.activeTour;
  if (tour) {
    renderTourPicker(document.getElementById('header-title'));
    applyTourColor(tour);
  }
}

// Route guard: ensure auth
function requireAuth(handler) {
  return async (params) => {
    if (!authService.isSignedIn) {
      renderAuthView();
      return;
    }
    await handler(params);
  };
}

// Route guard: ensure active tour
function requireTour(handler) {
  return requireAuth(async (params) => {
    if (!tourService.activeTour) {
      // Redirect to #/tours so clicking a tour changes the hash back to #/
      window.location.hash = '#/tours';
      return;
    }
    await handler(params);
  });
}

// Set up routes
router
  .on('#/', requireTour(async () => {
    updateHeaderForTour();
    await renderScheduleView();
  }))
  .on('#/tours', requireAuth(async () => {
    await renderTourListView();
  }))
  .on('#/invite/:token', requireAuth(async (params) => {
    await renderInviteView(params);
  }))
  .on('#/event/:id', requireTour(async (params) => {
    await renderEventDetailView(params);
  }))
  .on('#/setlists', requireTour(async () => {
    updateHeaderForTour();
    await renderSetlistView();
  }))
  .on('#/busstock', requireTour(async () => {
    updateHeaderForTour();
    await renderBusStockView();
  }))
  .on('#/busstock/:busId/:date', requireTour(async (params) => {
    updateHeaderForTour();
    await renderBusStockSheetView(params);
  }))
  .on('#/venue', requireTour(async () => {
    updateHeaderForTour();
    await renderVenueNotesListView();
  }))
  .on('#/venue/:venueKey', requireTour(async (params) => {
    await renderVenueNoteDetailView(params);
  }))
  .on('#/crew', requireTour(async () => {
    updateHeaderForTour();
    await renderCrewView();
  }))
  .on('#/announcements', requireTour(async () => {
    updateHeaderForTour();
    await renderAnnouncementsView();
  }))
  .on('#/more', requireTour(async () => {
    updateHeaderForTour();
    _renderMoreView();
  }));

// Update nav bar on route change
router.onNavigate((pattern, params) => {
  const tour = tourService.activeTour;
  if (tour && pattern !== '#/tours') {
    const activeTab = getActiveTab(pattern);
    renderNavBar(activeTab, tour.role);
  }
});

// More view (settings/links)
function _renderMoreView() {
  const content = document.getElementById('app-content');
  const tour = tourService.activeTour;

  let html = '<div class="more-view">';
  html += '<div class="list-group">';

  html += `
    <a class="list-item" href="#/crew">
      <div class="list-item-icon" style="background:var(--system-blue)22;color:var(--system-blue)">&#128101;</div>
      <div class="list-item-content">
        <div class="list-item-title">Crew Directory</div>
      </div>
      <span class="list-item-chevron"></span>
    </a>
    <a class="list-item" href="#/announcements">
      <div class="list-item-icon" style="background:var(--system-orange)22;color:var(--system-orange)">&#128227;</div>
      <div class="list-item-content">
        <div class="list-item-title">Announcements</div>
      </div>
      <span class="list-item-chevron"></span>
    </a>
  `;

  html += '</div>';

  // Account section
  html += '<div class="section-subheader" style="margin-top:24px">ACCOUNT</div>';
  html += '<div class="list-group">';
  html += `
    <a class="list-item" href="#/tours">
      <div class="list-item-content">
        <div class="list-item-title">Change Tour</div>
        <div class="list-item-subtitle">${_esc(tour?.name || '')}</div>
      </div>
      <span class="list-item-chevron"></span>
    </a>
  `;
  html += `
    <div class="list-item" id="sign-out-btn" style="cursor:pointer">
      <div class="list-item-content">
        <div class="list-item-title" style="color:var(--system-red)">Sign Out</div>
      </div>
    </div>
  `;
  html += '</div>';

  // App info
  html += `
    <div style="text-align:center;padding:24px;color:var(--text-tertiary);font-size:13px">
      TourCal PWA<br>
      Built for Android tour crew access
    </div>
  `;

  html += '</div>';
  content.innerHTML = html;

  // Sign out handler
  document.getElementById('sign-out-btn')?.addEventListener('click', async () => {
    await authService.signOut();
    tourService.activeTour = null;
    window.location.hash = '#/';
  });
}

function _esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Initialize app
async function init() {
  let routerStarted = false;

  function startRouterOnce() {
    if (routerStarted) return;
    routerStarted = true;
    router.start();
  }

  // Register service worker
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('./sw.js');
    } catch (e) {
      console.warn('SW registration failed:', e);
    }
  }

  // Initialize auth
  try {
    await authService.init();
  } catch (e) {
    console.error('Auth init error:', e);
  }

  // Listen for auth changes
  authService.onAuthChange(async (user) => {
    if (user) {
      cleanupAuthView();
      // Restore cached tour before routing
      await tourService.loadCachedTours();
      // Signed in - go to tours or current route
      if (window.location.hash === '' || window.location.hash === '#/') {
        if (!tourService.activeTour) {
          window.location.hash = '#/tours';
        }
      }
      startRouterOnce();
    } else {
      // Signed out - render auth view then set up the sign-in button
      renderAuthView();
      authService.setupAuthUI();
    }
  });

  // Listen for tour changes
  tourService.onTourChange((tour) => {
    if (tour) applyTourColor(tour);
  });

  // Start router (or auth view if not signed in)
  if (authService.isSignedIn) {
    await tourService.loadCachedTours();
    startRouterOnce();
  } else {
    // Render the auth view first so the #apple-sign-in-button div exists
    renderAuthView();
    await authService.setupAuthUI();
  }
}

init();
