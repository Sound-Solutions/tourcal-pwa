// Schedule View - Events grouped by date with travel cards

import { tourService } from '../services/tour-service.js';
import { eventService } from '../services/event-service.js';
import { travelService } from '../services/travel-service.js';
import { authService } from '../services/auth.js';
import { formatDateShort, formatDateLong, formatTime } from '../models/formatters.js';
import { setupPullToRefresh } from '../components/pull-to-refresh.js';

export async function renderScheduleView() {
  const content = document.getElementById('app-content');
  const tour = tourService.activeTour;

  if (!tour) {
    window.location.hash = '#/tours';
    return;
  }

  // Set header with sign-out button
  document.getElementById('header-actions').innerHTML = `
    <button class="sign-out-btn" id="schedule-sign-out">Sign Out</button>
  `;
  document.getElementById('schedule-sign-out')?.addEventListener('click', async () => {
    if (!confirm('Sign out of TourCal?')) return;
    await authService.signOut();
    tourService.activeTour = null;
    window.location.hash = '#/';
  });

  content.innerHTML = `
    <div class="loading-container">
      <div class="spinner"></div>
      <span class="loading-text">Loading schedule...</span>
    </div>
  `;

  try {
    const events = await eventService.fetchEvents(tour);
    _render(content, events, tour);
  } catch (e) {
    console.error('Error loading schedule:', e);
    content.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">&#9888;</div>
        <h2 class="empty-state-title">Error Loading Schedule</h2>
        <p class="empty-state-text">${e.message || 'Something went wrong.'}</p>
      </div>
    `;
  }
}

function _render(container, events, tour) {
  // Filter artist-only events based on role
  const role = tour.role;
  const filtered = role === 'Artist'
    ? events
    : events.filter(e => !e.isArtistOnly);

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">&#128197;</div>
        <h2 class="empty-state-title">No Events</h2>
        <p class="empty-state-text">No events scheduled yet for this tour.</p>
      </div>
    `;
    return;
  }

  const groups = eventService.groupByDate(filtered);
  const today = new Date().toISOString().split('T')[0];

  let html = '<div class="schedule-view">';
  html += '<div id="ptr-zone" class="ptr-indicator"><div class="ptr-spinner"></div></div>';

  // Route button
  html += `
    <div class="schedule-actions">
      <a href="#/route" class="btn btn-sm btn-secondary route-btn">
        <span class="route-btn-icon">&#128506;</span> Route Map
      </a>
    </div>
  `;

  // Find the nearest upcoming date to auto-scroll to
  let scrollTarget = null;
  let prevCity = null;
  const travelPairs = []; // track which travel cards need data

  for (const [dateKey, dayEvents] of groups) {
    const isToday = dateKey === today;
    const isPast = dateKey < today;
    if (!scrollTarget && dateKey >= today) scrollTarget = dateKey;

    // Get the city for the first event of this date group
    const firstCity = dayEvents[0]?.city || '';

    // Insert travel card if city changed
    if (prevCity && firstCity && prevCity.toLowerCase().trim() !== firstCity.toLowerCase().trim()) {
      const pairId = `travel-${_slug(prevCity)}-${_slug(firstCity)}`;
      travelPairs.push({ id: pairId, from: prevCity, to: firstCity });
      html += `
        <div class="travel-card" id="${pairId}">
          <div class="travel-card-icon">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 1v14M8 15l-4-4M8 15l4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="travel-card-body">
            <span class="travel-card-dest">${_esc(firstCity)}</span>
            <span class="travel-card-info">Calculating...</span>
          </div>
          <a class="travel-card-link" href="https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(prevCity)}&destination=${encodeURIComponent(firstCity)}&travelmode=driving" target="_blank">
            Directions
          </a>
        </div>
      `;
    }

    // Track the last city of this date group
    const lastEvent = dayEvents[dayEvents.length - 1];
    prevCity = lastEvent?.city || firstCity || prevCity;

    html += `
      <div class="date-header" id="date-${dateKey}" ${isPast ? 'style="opacity: 0.6"' : ''}>
        ${isToday ? 'Today &middot; ' : ''}${formatDateLong(new Date(dateKey + 'T12:00:00'))}
      </div>
    `;

    for (const event of dayEvents) {
      const tz = event.timeZoneIdentifier;
      const timeStr = event.startDate ? formatTime(event.startDate, tz) : '';

      html += `
        <div class="event-card" data-event-id="${event.recordName}">
          <a class="event-card-content" href="#/event/${event.recordName}">
            <div class="event-summary">
              ${_esc(event.summary)}
              ${event.isArtistOnly ? '<span class="event-badge-artist">Artist</span>' : ''}
            </div>
            <div class="event-details">
              ${event.venue ? `<span class="event-venue">${_esc(event.venue)}</span>` : ''}
              ${event.city ? `<span class="event-city">${_esc(event.city)}</span>` : ''}
            </div>
            ${timeStr ? `<div class="event-time">${timeStr}</div>` : ''}
          </a>
        </div>
      `;
    }
  }

  html += '</div>';
  container.innerHTML = html;

  // Scroll to today or next upcoming
  if (scrollTarget) {
    const el = document.getElementById(`date-${scrollTarget}`);
    if (el) {
      setTimeout(() => el.scrollIntoView({ behavior: 'auto', block: 'start' }), 50);
    }
  }

  // Pull-to-refresh
  setupPullToRefresh(container, async () => {
    const events = await eventService.fetchEvents(tour);
    _render(container, events, tour);
  });

  // Async: fill in travel card data
  _loadTravelCards(travelPairs);
}

async function _loadTravelCards(pairs) {
  for (const { id, from, to } of pairs) {
    const el = document.getElementById(id);
    if (!el) continue;

    const info = el.querySelector('.travel-card-info');
    try {
      const travel = await travelService.travelBetween(from, to);
      if (travel && info) {
        if (travel.isFlight) {
          info.textContent = `${travel.formattedDistance} (flight)`;
        } else {
          info.textContent = `${travel.formattedDuration} · ${travel.formattedDistance}`;
        }
        el.classList.add('travel-card-loaded');
      } else if (info) {
        info.textContent = '';
      }
    } catch (e) {
      console.warn(`[Schedule] Travel card error for ${from} → ${to}:`, e);
      if (info) info.textContent = '';
    }
  }
}

function _slug(str) {
  return (str || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
}

function _esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
