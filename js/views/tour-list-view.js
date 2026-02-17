// Tour List View - Tour selector

import { tourService } from '../services/tour-service.js';
import { router } from '../router.js';
import { showToast } from '../components/toast.js';

export async function renderTourListView() {
  const content = document.getElementById('app-content');
  document.getElementById('app-nav').classList.add('hidden');
  document.getElementById('header-title').textContent = 'Select Tour';
  document.getElementById('header-actions').innerHTML = '';

  // Show loading
  content.innerHTML = `
    <div class="loading-container">
      <div class="spinner"></div>
      <span class="loading-text">Loading tours...</span>
    </div>
  `;

  try {
    // Try cache first for instant display
    await tourService.loadCachedTours();
    if (tourService.tours.length > 0) {
      _render(content, tourService.tours);
    }

    // Fetch fresh data
    const tours = await tourService.fetchTours();
    _render(content, tours);
  } catch (e) {
    console.error('Error loading tours:', e);
    content.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">&#9888;</div>
        <h2 class="empty-state-title">Connection Error</h2>
        <p class="empty-state-text">Could not connect to iCloud. Check your internet connection and try again.</p>
        <button class="btn btn-primary" onclick="location.reload()">Retry</button>
      </div>
    `;
  }
}

function _render(container, tours) {
  if (tours.length === 0) {
    const errors = tourService.lastErrors;
    const hasErrors = errors.length > 0;
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">${hasErrors ? '&#9888;' : '&#127926;'}</div>
        <h2 class="empty-state-title">${hasErrors ? 'Could Not Load Tours' : 'No Tours'}</h2>
        <p class="empty-state-text">${hasErrors
          ? 'There was a problem connecting to iCloud. This often resolves with a retry.'
          : 'No tours found. Tours are created in the TourCal iOS app and shared with you via iCloud.'
        }</p>
        ${hasErrors ? `<p style="font-size:12px;color:var(--text-tertiary);margin-top:8px">${errors.join('<br>')}</p>` : ''}
        <button class="btn btn-primary" id="retry-tours-btn" style="margin-top:16px">Retry</button>
      </div>
    `;
    document.getElementById('retry-tours-btn')?.addEventListener('click', () => {
      renderTourListView();
    });
    return;
  }

  container.innerHTML = `
    <div class="tour-list-view">
      <div class="list-group">
        ${tours.map(tour => `
          <div class="list-item tour-card" data-tour-id="${tour.recordName}">
            <div class="tour-card-color" style="background: ${tour.colorHex}">
              ${tour.name.charAt(0).toUpperCase()}
            </div>
            <div class="tour-card-info">
              <div class="tour-card-name">${_escapeHtml(tour.name)}</div>
              <div class="tour-card-role">
                <span class="badge badge-role">${tour.role}</span>
                ${tour.isShared ? ' &middot; Shared' : ' &middot; Owner'}
              </div>
            </div>
            <span class="list-item-chevron"></span>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  // Bind click handlers
  container.querySelectorAll('.tour-card').forEach(card => {
    card.addEventListener('click', () => {
      const tourId = card.dataset.tourId;
      const tour = tours.find(t => t.recordName === tourId);
      if (tour) {
        tourService.activeTour = tour;
        // Navigate to schedule. If hash is already #/, hashchange won't
        // fire, so use router.start() to force re-resolve.
        window.location.hash = '#/';
        router.start();
      }
    });
  });
}

function _escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
