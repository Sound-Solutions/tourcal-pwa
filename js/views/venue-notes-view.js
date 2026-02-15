// Venue Notes View - WiFi, load-in, parking, contacts

import { tourService } from '../services/tour-service.js';
import { venueService } from '../services/venue-service.js';
import { eventService } from '../services/event-service.js';
import { canView, canEdit } from '../models/permissions.js';
import { showToast } from '../components/toast.js';

export async function renderVenueNotesListView() {
  const content = document.getElementById('app-content');
  const tour = tourService.activeTour;

  if (!tour) {
    window.location.hash = '#/tours';
    return;
  }

  if (!canView(tour.role, 'venue')) {
    content.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">&#128274;</div>
        <h2 class="empty-state-title">Access Restricted</h2>
        <p class="empty-state-text">Venue information is not available for your role.</p>
      </div>
    `;
    return;
  }

  content.innerHTML = `
    <div class="loading-container">
      <div class="spinner"></div>
      <span class="loading-text">Loading venue notes...</span>
    </div>
  `;

  try {
    const [venueNotes, events] = await Promise.all([
      venueService.fetchVenueNotes(tour),
      eventService.fetchEvents(tour)
    ]);

    _renderList(content, venueNotes, events, tour);
  } catch (e) {
    content.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">&#9888;</div>
        <h2 class="empty-state-title">Error</h2>
        <p class="empty-state-text">${e.message}</p>
      </div>
    `;
  }
}

function _renderList(container, venueNotes, events, tour) {
  if (venueNotes.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">&#127961;</div>
        <h2 class="empty-state-title">No Venue Notes</h2>
        <p class="empty-state-text">No venue information has been added yet.</p>
      </div>
    `;
    return;
  }

  // Sort by venue name
  venueNotes.sort((a, b) => (a.venueName || '').localeCompare(b.venueName || ''));

  let html = '<div class="venue-notes-view">';
  html += '<div class="list-group">';

  for (const vn of venueNotes) {
    const hasWifi = vn.wifiNetwork;
    const details = [
      hasWifi ? `WiFi: ${_esc(vn.wifiNetwork)}` : '',
      vn.loadInLocation ? 'Load-in info' : '',
      vn.parking ? 'Parking info' : ''
    ].filter(Boolean).join(' &middot; ');

    html += `
      <a class="list-item" href="#/venue/${encodeURIComponent(vn.venueKey)}">
        <div class="list-item-icon" style="background: var(--bg-tertiary)">&#127961;</div>
        <div class="list-item-content">
          <div class="list-item-title">${_esc(vn.venueName || vn.venueKey)}</div>
          ${details ? `<div class="list-item-subtitle">${details}</div>` : ''}
        </div>
        <span class="list-item-chevron"></span>
      </a>
    `;
  }

  html += '</div></div>';
  container.innerHTML = html;
}

export async function renderVenueNoteDetailView({ venueKey }) {
  const content = document.getElementById('app-content');
  const tour = tourService.activeTour;

  if (!tour || !canView(tour.role, 'venue')) {
    window.location.hash = '#/';
    return;
  }

  content.innerHTML = `
    <div class="loading-container">
      <div class="spinner"></div>
    </div>
  `;

  try {
    const vn = await venueService.fetchVenueNote(tour, venueKey);

    document.getElementById('header-title').textContent = vn?.venueName || 'Venue';
    document.getElementById('header-actions').innerHTML = `
      <button class="btn btn-text" onclick="history.back()">&#8249; Back</button>
    `;

    if (!vn) {
      content.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">&#10067;</div>
          <h2 class="empty-state-title">Not Found</h2>
          <button class="btn btn-primary" onclick="history.back()">Go Back</button>
        </div>
      `;
      return;
    }

    _renderDetail(content, vn, tour);
  } catch (e) {
    content.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">&#9888;</div>
        <h2 class="empty-state-title">Error</h2>
        <p class="empty-state-text">${e.message}</p>
      </div>
    `;
  }
}

function _renderDetail(container, vn, tour) {
  let html = '<div class="venue-notes-view">';
  html += '<div class="card">';

  if (vn.wifiNetwork) {
    html += `
      <div class="venue-field">
        <div class="venue-field-label">WiFi Network</div>
        <div class="venue-field-value">${_esc(vn.wifiNetwork)}</div>
      </div>
    `;
    if (vn.wifiPassword) {
      html += `
        <div class="venue-field">
          <div class="venue-field-label">WiFi Password</div>
          <div class="venue-field-value venue-wifi">
            <span id="wifi-pw">${_esc(vn.wifiPassword)}</span>
            <button class="venue-wifi-copy" id="copy-wifi">Copy</button>
          </div>
        </div>
      `;
    }
  }

  const fields = [
    ['Load In Location', vn.loadInLocation],
    ['Parking', vn.parking],
    ['Green Room', vn.greenRoom],
    ['Contacts', vn.contacts],
    ['Notes', vn.notes]
  ];

  for (const [label, value] of fields) {
    if (value) {
      html += `
        <div class="venue-field">
          <div class="venue-field-label">${label}</div>
          <div class="venue-field-value">${_esc(value)}</div>
        </div>
      `;
    }
  }

  html += '</div></div>';
  container.innerHTML = html;

  // Copy wifi password
  container.querySelector('#copy-wifi')?.addEventListener('click', () => {
    navigator.clipboard.writeText(vn.wifiPassword).then(() => {
      showToast('Password copied');
    });
  });
}

function _esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
