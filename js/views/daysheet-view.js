// Day Sheet View - Schedule items with time ranges

import { tourService } from '../services/tour-service.js';
import { daySheetService } from '../services/daysheet-service.js';
import { eventService } from '../services/event-service.js';
import { formatTime, formatTimeRange, formatDateLong } from '../models/formatters.js';
import { canEdit } from '../models/permissions.js';
import { showToast } from '../components/toast.js';
import { cache } from '../services/cache.js';

export async function renderDaySheetView({ eventKey, eventId }) {
  const content = document.getElementById('app-content');
  const tour = tourService.activeTour;

  if (!tour) {
    window.location.hash = '#/tours';
    return;
  }

  content.innerHTML = `
    <div class="loading-container">
      <div class="spinner"></div>
      <span class="loading-text">Loading day sheet...</span>
    </div>
  `;

  try {
    const daysheet = await daySheetService.fetchDaySheet(tour, eventKey);

    // Find associated event for context
    const cachedEvents = await cache.get(cache.tourKey(tour.recordName, 'events'), true);
    const event = eventId
      ? (cachedEvents || []).find(e => e.recordName === eventId)
      : null;

    const tz = event?.timeZoneIdentifier;

    document.getElementById('header-title').textContent = 'Day Sheet';
    document.getElementById('header-actions').innerHTML = `
      <button class="btn btn-text" onclick="history.back()">&#8249; Back</button>
    `;

    _render(content, daysheet, event, tour, tz);
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

function _render(container, daysheet, event, tour, tz) {
  const role = tour.role;
  const editable = canEdit(role, 'daysheets');

  if (!daysheet) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">&#128203;</div>
        <h2 class="empty-state-title">No Day Sheet</h2>
        <p class="empty-state-text">No day sheet has been created for this event yet.</p>
        <button class="btn btn-primary" onclick="history.back()">Go Back</button>
      </div>
    `;
    return;
  }

  const items = daySheetService.getScheduleItems(daysheet);

  let html = '<div class="daysheet-view">';

  if (event) {
    html += `
      <div class="event-detail-header" style="margin-bottom:16px">
        <h1 style="font-size:20px;font-weight:700">${_esc(event.summary)}</h1>
        <div style="font-size:14px;color:var(--text-secondary)">${formatDateLong(event.startDate)}</div>
      </div>
    `;
  }

  if (editable) {
    html += `<div class="edit-bar"><span style="font-size:13px;color:var(--text-secondary)">SCHEDULE</span></div>`;
  } else {
    html += '<div class="section-subheader">SCHEDULE</div>';
  }

  html += '<div class="card">';

  if (items.length === 0) {
    html += '<div class="card-body" style="color:var(--text-secondary)">No schedule items</div>';
  } else {
    for (const item of items) {
      html += `
        <div class="schedule-item" style="padding: 10px 16px;">
          <div class="schedule-item-time">
            <span class="time-value">${item.startTime ? formatTime(item.startTime, tz) : 'TBD'}</span>
            ${item.endTime ? `<div style="font-size:12px;color:var(--text-tertiary)">${formatTime(item.endTime, tz)}</div>` : ''}
          </div>
          <div class="schedule-item-label">${_esc(item.label)}</div>
        </div>
      `;
    }
  }

  html += '</div>';

  if (daysheet.notes) {
    html += '<div class="section-subheader">NOTES</div>';
    html += `<div class="daysheet-notes">${_esc(daysheet.notes)}</div>`;
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
