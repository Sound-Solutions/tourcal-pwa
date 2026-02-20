// TourCal PWA - Main Entry Point

import { authService } from './services/auth.js';
import { tourService } from './services/tour-service.js';
import { router } from './router.js';
import { renderTourPicker } from './components/tour-picker.js';
import { renderAuthView, cleanupAuthView } from './views/auth-view.js';
import { renderTourListView } from './views/tour-list-view.js';
import { renderScheduleView } from './views/schedule-view.js';
import { renderEventDetailView } from './views/event-detail-view.js';
import { renderBusStockSheetView } from './views/busstock-view.js';
import { renderInviteView } from './views/invite-view.js';
import { renderRouteView } from './views/route-view.js';

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
    document.getElementById('header-title').textContent = 'TourCal';
    const pickerEl = document.getElementById('header-tour-picker');
    pickerEl.classList.remove('hidden');
    renderTourPicker(pickerEl);
    applyTourColor(tour);
  }
}

// Hide tour picker row (for non-tour views)
function hideHeaderTourPicker() {
  document.getElementById('header-tour-picker')?.classList.add('hidden');
}

// Route guard: ensure auth
function requireAuth(handler) {
  return async (params) => {
    if (!authService.isSignedIn) {
      // Save current hash so we can restore it after sign-in
      // (Apple OAuth redirect drops the hash fragment)
      const currentHash = window.location.hash;
      if (currentHash && currentHash !== '#/' && currentHash !== '#/tours') {
        localStorage.setItem('tourcal_pendingRedirect', currentHash);
        console.log('[App] Saved pending redirect:', currentHash);
      }
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
    hideHeaderTourPicker();
    await renderTourListView();
  }))
  .on('#/invite/:token', requireAuth(async (params) => {
    hideHeaderTourPicker();
    await renderInviteView(params);
  }))
  .on('#/event/:id', requireTour(async (params) => {
    updateHeaderForTour();
    await renderEventDetailView(params);
  }))
  .on('#/busstock/:busId', requireTour(async (params) => {
    updateHeaderForTour();
    await renderBusStockSheetView(params);
  }))
  .on('#/route', requireTour(async () => {
    updateHeaderForTour();
    await renderRouteView();
  }));

// Initialize app
async function init() {
  let routerStarted = false;

  function startRouterOnce() {
    if (routerStarted) return;
    routerStarted = true;
    router.start();
  }

  // Save invite hash BEFORE auth init — Apple's OAuth redirect strips the hash,
  // so we must capture it on the initial page load when the user clicks the link.
  // On the return from Apple sign-in, the hash is gone but localStorage has it.
  const initialHash = window.location.hash;
  if (initialHash && initialHash.startsWith('#/invite/')) {
    localStorage.setItem('tourcal_pendingRedirect', initialHash);
    console.log('[App] Captured invite hash before auth:', initialHash);
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

      // Restore any pending redirect saved before the Apple sign-in redirect
      // (Apple OAuth drops hash fragments, so we save them in localStorage)
      const pendingRedirect = localStorage.getItem('tourcal_pendingRedirect');
      if (pendingRedirect) {
        localStorage.removeItem('tourcal_pendingRedirect');
        console.log('[App] Restoring pending redirect:', pendingRedirect);
        window.location.hash = pendingRedirect;
        startRouterOnce();
        return;
      }

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

    // Check for a pending redirect (e.g. invite link saved before Apple OAuth redirect)
    // This handles the case where auth.init() sets _user directly from a redirect token
    // without firing onAuthChange, so the pending redirect check in onAuthChange is bypassed.
    const pendingRedirect = localStorage.getItem('tourcal_pendingRedirect');
    if (pendingRedirect) {
      localStorage.removeItem('tourcal_pendingRedirect');
      console.log('[App] Restoring pending redirect (init path):', pendingRedirect);
      window.location.hash = pendingRedirect;
      startRouterOnce();
    } else {
      startRouterOnce();
    }
  } else {
    // Render the auth view first so the #apple-sign-in-button div exists
    renderAuthView();
    await authService.setupAuthUI();
  }
}

init();
