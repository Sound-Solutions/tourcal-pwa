// Event Detail View - Event info with daysheet, setlist, venue tabs

import { tourService } from '../services/tour-service.js';
import { eventService } from '../services/event-service.js';
import { daySheetService } from '../services/daysheet-service.js';
import { setlistService } from '../services/setlist-service.js';
import { venueService } from '../services/venue-service.js';
import { busStockService } from '../services/busstock-service.js';
import { travelService } from '../services/travel-service.js';
import { formatDateLong, formatDateISO, formatTime, formatTimeRange, formatDuration, formatDurationHM, formatSMPTE } from '../models/formatters.js';
import { canView } from '../models/permissions.js';
import { cache } from '../services/cache.js';

export async function renderEventDetailView({ id }) {
  const content = document.getElementById('app-content');
  const tour = tourService.activeTour;

  if (!tour) {
    window.location.hash = '#/tours';
    return;
  }

  content.innerHTML = `
    <div class="loading-container">
      <div class="spinner"></div>
      <span class="loading-text">Loading event...</span>
    </div>
  `;

  try {
    // Find event from cache
    const cachedEvents = await cache.get(cache.tourKey(tour.recordName, 'events'), true);
    const event = (cachedEvents || []).find(e => e.recordName === id);

    if (!event) {
      content.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">&#10067;</div>
          <h2 class="empty-state-title">Event Not Found</h2>
          <button class="btn btn-primary" onclick="history.back()">Go Back</button>
        </div>
      `;
      return;
    }

    document.getElementById('header-title').textContent = event.summary || 'Event';
    document.getElementById('header-actions').innerHTML = `
      <button class="btn btn-text" onclick="history.back()">&#8249; Back</button>
    `;

    // Fetch related data
    const tz = event.timeZoneIdentifier;
    const [daysheet, setlist, venueNote, buses] = await Promise.all([
      daySheetService.fetchDaySheet(tour, event.eventKey),
      setlistService.fetchSetlistForEvent(tour, event.eventKey),
      event.venue ? venueService.fetchVenueNote(tour, venueService.generateVenueKey(event.venue)) : null,
      busStockService.fetchBuses(tour)
    ]);

    // Fetch sheets for each bus on the event date
    const eventDate = new Date(event.startDate);
    const busSheets = [];
    if (buses.length > 0) {
      const sheetPromises = buses.map(bus =>
        busStockService.fetchSheet(tour, bus.id, eventDate).then(sheet => ({ bus, sheet }))
      );
      busSheets.push(...await Promise.all(sheetPromises));
    }

    // Find the next event with a different city for travel card
    const allEvents = (cachedEvents || [])
      .filter(e => e.startDate)
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
    const thisIdx = allEvents.findIndex(e => e.recordName === id);
    let nextEvent = null;
    if (thisIdx >= 0 && event.city) {
      const currentCity = event.city.toLowerCase().trim();
      for (let i = thisIdx + 1; i < allEvents.length; i++) {
        const nextCity = (allEvents[i].city || '').toLowerCase().trim();
        if (nextCity && nextCity !== currentCity) {
          nextEvent = allEvents[i];
          break;
        }
      }
    }

    _render(content, event, daysheet, setlist, venueNote, tour, busSheets, nextEvent);
  } catch (e) {
    console.error('Error loading event detail:', e);
    content.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">&#9888;</div>
        <h2 class="empty-state-title">Error</h2>
        <p class="empty-state-text">${e.message}</p>
        <button class="btn btn-primary" onclick="history.back()">Go Back</button>
      </div>
    `;
  }
}

function _render(container, event, daysheet, setlist, venueNote, tour, busSheets = [], nextEvent = null) {
  const tz = event.timeZoneIdentifier;
  const role = tour.role;

  let html = '<div class="event-detail-view">';

  // Header with tour color dot
  html += `
    <div class="event-detail-header">
      <div class="event-detail-title-row">
        <span class="tour-color-dot" style="background:${_esc(tour.colorHex || 'var(--tour-color)')}"></span>
        <h1 class="event-detail-summary">${_esc(event.summary)}</h1>
      </div>
      <div class="event-detail-meta">
        <span>${formatDateLong(event.startDate)}</span>
        ${event.venue ? `<span>${_esc(event.venue)}${event.city ? ', ' + _esc(event.city) : ''}</span>` : ''}
        ${event.hotel ? `<span>Hotel: ${_esc(event.hotel)}</span>` : ''}
        ${tz ? `<span style="font-size:13px;color:var(--text-tertiary)">${tz}</span>` : ''}
      </div>
    </div>
  `;

  // Location section with Maps links
  if (event.venue || event.city) {
    const query = encodeURIComponent([event.venue, event.city].filter(Boolean).join(', '));
    html += '<div class="section-subheader">LOCATION</div>';
    html += '<div class="card">';
    html += `<div class="card-body">
      <div style="font-size:15px;margin-bottom:10px">${_esc(event.venue || '')}${event.city ? (event.venue ? ', ' : '') + _esc(event.city) : ''}</div>
      <div class="maps-buttons">
        <a href="https://maps.apple.com/?q=${query}" target="_blank" class="btn btn-sm btn-secondary maps-btn">Apple Maps</a>
        <a href="https://www.google.com/maps/search/?api=1&query=${query}" target="_blank" class="btn btn-sm btn-secondary maps-btn">Google Maps</a>
      </div>
    </div>`;
    html += '</div>';
  }

  // Travel card to next city
  if (nextEvent && nextEvent.city) {
    const fromCity = event.city;
    const toCity = nextEvent.city;
    const dirUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(fromCity)}&destination=${encodeURIComponent(toCity)}&travelmode=driving`;
    html += '<div class="section-subheader">TRAVEL</div>';
    html += `
      <div class="card">
        <div class="travel-detail-card" id="travel-card-detail">
          <div class="travel-detail-dest">
            <span class="travel-detail-arrow">&#8594;</span>
            <span>${_esc(nextEvent.venue ? nextEvent.venue + ', ' + toCity : toCity)}</span>
          </div>
          <div class="travel-detail-info" id="travel-info-placeholder">Calculating...</div>
          <a href="${dirUrl}" target="_blank" class="btn btn-sm btn-secondary travel-detail-link">Google Maps Directions</a>
        </div>
      </div>
    `;
    // Async load travel data after render
    setTimeout(() => _loadTravelInfo(fromCity, toCity), 0);
  }

  // Day Sheet section
  html += '<div class="section-subheader">DAY SHEET</div>';
  if (daysheet) {
    html += '<div class="card">';
    const items = daySheetService.getScheduleItems(daysheet);
    if (items.length > 0) {
      for (const item of items) {
        html += `
          <div class="schedule-item" style="padding: 10px 16px;">
            <div class="schedule-item-time">
              <span class="time-value">${formatTime(item.startTime, tz)}</span>
            </div>
            <div class="schedule-item-label">${_esc(item.label)}</div>
            ${item.endTime ? `<div style="font-size:13px;color:var(--text-tertiary)">${formatTime(item.endTime, tz)}</div>` : ''}
          </div>
        `;
      }
    } else {
      html += '<div class="card-body" style="color:var(--text-secondary)">No schedule items</div>';
    }
    if (daysheet.notes) {
      html += `<div class="daysheet-notes">${_esc(daysheet.notes)}</div>`;
    }
    html += '</div>';
  } else {
    html += '<div class="card"><div class="card-body empty-section-text">No day sheet yet</div></div>';
  }

  // Setlist section
  html += '<div class="section-subheader">SETLIST</div>';
  if (setlist && setlist.entries.length > 0) {
    const totalDuration = setlistService.getTotalDuration(setlist);
    html += '<div class="card">';

    for (let i = 0; i < setlist.entries.length; i++) {
      const entry = setlist.entries[i];
      html += `
        <div class="setlist-entry">
          <span class="setlist-order">${i + 1}</span>
          <div class="setlist-entry-content">
            <div class="setlist-song-name">${_esc(entry.songName || '')}</div>
            <div class="setlist-meta">
              ${entry.duration ? `<span class="setlist-meta-item duration">${formatDuration(entry.duration)}</span>` : ''}
              ${entry.bpm ? `<span class="setlist-meta-item">${entry.bpm} BPM</span>` : ''}
              ${entry.key ? `<span class="setlist-meta-item">${_esc(entry.key)}</span>` : ''}
              ${entry.timecode ? `<span class="smpte">${formatSMPTE(entry.timecode)}</span>` : ''}
            </div>
            ${_renderRichNotes(entry)}
          </div>
        </div>
      `;
    }

    if (totalDuration > 0) {
      html += `
        <div class="setlist-total">
          <span class="setlist-total-icon">&#128339;</span>
          <span>${formatDurationHM(totalDuration)}</span>
        </div>
      `;
    }

    html += '</div>';
  } else {
    html += '<div class="card"><div class="card-body empty-section-text">No setlist yet</div></div>';
  }

  // Venue notes section
  if (canView(role, 'venue')) {
    html += '<div class="section-subheader">VENUE INFO</div>';
    if (venueNote) {
      html += '<div class="card">';
      html += _renderVenueFields(venueNote);
      html += '</div>';
    } else {
      html += '<div class="card"><div class="card-body empty-section-text">No venue info yet</div></div>';
    }
  }

  // Bus Stock section
  const eventDateISO = formatDateISO(new Date(event.startDate));
  html += '<div class="section-subheader">BUS STOCK</div>';
  if (busSheets.length > 0) {
    html += '<div class="card">';
    for (let i = 0; i < busSheets.length; i++) {
      const { bus, sheet } = busSheets[i];
      const checked = sheet ? sheet.items.filter(it => it.isChecked).length : 0;
      const total = sheet ? sheet.items.length : 0;
      const locked = sheet && busStockService.isSheetLocked(sheet);
      html += `
        <a class="busstock-link" href="#/busstock/${bus.id}/${eventDateISO}" style="display:flex;align-items:center;padding:10px 16px;text-decoration:none;color:inherit">
          <span style="flex:1;font-size:15px">${_esc(bus.name)}</span>
          ${locked ? '<span style="color:var(--system-orange);font-size:13px;margin-right:8px">&#128274;</span>' : ''}
          <span style="font-size:13px;color:var(--text-secondary);font-variant-numeric:tabular-nums">${checked}/${total}</span>
          <span style="margin-left:8px;color:var(--text-tertiary);font-size:12px">&#8250;</span>
        </a>
      `;
      if (i < busSheets.length - 1) {
        html += '<div style="border-top:1px solid var(--separator);margin-left:16px"></div>';
      }
    }
    html += '</div>';
  } else {
    html += '<div class="card"><div class="card-body empty-section-text">No bus stock yet</div></div>';
  }

  // Event notes
  if (event.notes) {
    html += '<div class="section-subheader">NOTES</div>';
    html += `<div class="card"><div class="card-body" style="white-space:pre-wrap">${_esc(event.notes)}</div></div>`;
  }

  html += '</div>';
  container.innerHTML = html;
}

function _renderRichNotes(entry) {
  const notes = setlistService.parseRichNotes(entry);
  if (!notes || notes.length === 0) return '';

  let html = '<div class="setlist-notes">';
  for (const span of notes) {
    const colorClass = `note-span-${span.color || 'plain'}`;
    html += `<span class="${colorClass}">${_esc(span.text)}</span>`;
  }
  html += '</div>';
  return html;
}

function _renderVenueFields(v) {
  let html = '';
  const field = (label, value, isLink) => {
    if (!value) return '';
    const display = isLink
      ? `<a href="${value}" class="contact-link" target="_blank">${_esc(value)}</a>`
      : _esc(value);
    return `
      <div class="venue-field">
        <div class="venue-field-label">${label}</div>
        <div class="venue-field-value">${display}</div>
      </div>
    `;
  };

  if (v.wifiNetwork) {
    html += `
      <div class="venue-field">
        <div class="venue-field-label">WiFi</div>
        <div class="venue-field-value venue-wifi">
          <span>${_esc(v.wifiNetwork)}</span>
          ${v.wifiPassword ? `<span style="color:var(--text-secondary)">/ ${_esc(v.wifiPassword)}</span>
          <button class="venue-wifi-copy" onclick="navigator.clipboard.writeText('${_esc(v.wifiPassword)}')">Copy</button>` : ''}
        </div>
      </div>
    `;
  }

  html += field('Load In', v.loadInLocation);
  html += field('Parking', v.parking);
  html += field('Green Room', v.greenRoom);
  html += field('Contacts', v.contacts);
  html += field('Notes', v.notes);

  return html;
}

async function _loadTravelInfo(fromCity, toCity) {
  const el = document.getElementById('travel-info-placeholder');
  if (!el) return;
  try {
    const travel = await travelService.travelBetween(fromCity, toCity);
    if (travel) {
      if (travel.isFlight) {
        el.textContent = `${travel.formattedDistance} (flight)`;
      } else {
        el.textContent = `${travel.formattedDuration} drive · ${travel.formattedDistance}`;
      }
    } else {
      el.textContent = '';
    }
  } catch (e) {
    console.warn('[EventDetail] Travel info error:', e);
    el.textContent = '';
  }
}

function _esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

