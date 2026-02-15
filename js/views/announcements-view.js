// Announcements View - Tour announcements with urgency badges

import { tourService } from '../services/tour-service.js';
import { announcementService } from '../services/announcement-service.js';
import { formatRelative } from '../models/formatters.js';

export async function renderAnnouncementsView() {
  const content = document.getElementById('app-content');
  const tour = tourService.activeTour;

  if (!tour) {
    window.location.hash = '#/tours';
    return;
  }

  content.innerHTML = `
    <div class="loading-container">
      <div class="spinner"></div>
      <span class="loading-text">Loading announcements...</span>
    </div>
  `;

  try {
    let announcements = await announcementService.fetchAnnouncements(tour);

    // Filter for role
    announcements = announcementService.filterForRole(announcements, tour.role);

    if (announcements.length === 0) {
      content.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">&#128227;</div>
          <h2 class="empty-state-title">No Announcements</h2>
          <p class="empty-state-text">Tour announcements will appear here.</p>
        </div>
      `;
      return;
    }

    _render(content, announcements);
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

function _render(container, announcements) {
  let html = '<div class="announcements-view">';

  for (const a of announcements) {
    const urgencyClass = `badge-urgency-${a.urgency || 'info'}`;
    const urgencyLabel = (a.urgency || 'info').charAt(0).toUpperCase() + (a.urgency || 'info').slice(1);

    html += `
      <div class="announcement-card">
        <div class="announcement-header">
          <span class="announcement-title">${_esc(a.title)}</span>
          <span class="badge ${urgencyClass}">${urgencyLabel}</span>
        </div>
        <div class="announcement-body">${_esc(a.body)}</div>
        <div class="announcement-footer">
          <span>${_esc(a.senderName)}</span>
          <span>${formatRelative(a.createdAt)}</span>
        </div>
      </div>
    `;
  }

  html += '</div>';
  container.innerHTML = html;
}

function _esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
