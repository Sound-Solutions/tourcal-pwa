// Setlist View - Setlists with colored production notes

import { tourService } from '../services/tour-service.js';
import { setlistService } from '../services/setlist-service.js';
import { eventService } from '../services/event-service.js';
import { formatDuration, formatDurationHM, formatSMPTE, formatDateShort } from '../models/formatters.js';
import { cache } from '../services/cache.js';

export async function renderSetlistView() {
  const content = document.getElementById('app-content');
  const tour = tourService.activeTour;

  if (!tour) {
    window.location.hash = '#/tours';
    return;
  }

  content.innerHTML = `
    <div class="loading-container">
      <div class="spinner"></div>
      <span class="loading-text">Loading setlists...</span>
    </div>
  `;

  try {
    const [setlists, masterSetlist, events] = await Promise.all([
      setlistService.fetchSetlists(tour),
      setlistService.fetchMasterSetlist(tour),
      eventService.fetchEvents(tour)
    ]);

    _render(content, setlists, masterSetlist, events, tour);
  } catch (e) {
    console.error('Error loading setlists:', e);
    content.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">&#9888;</div>
        <h2 class="empty-state-title">Error</h2>
        <p class="empty-state-text">${e.message}</p>
      </div>
    `;
  }
}

function _render(container, setlists, masterSetlist, events, tour) {
  let html = '<div class="setlist-view">';

  // Segment control: Master vs Per-Show
  html += `
    <div class="segment-control" style="margin: 16px 0">
      <button class="segment-item active" data-tab="master">Master</button>
      <button class="segment-item" data-tab="shows">Per-Show</button>
    </div>
  `;

  // Master setlist tab
  html += '<div id="tab-master">';
  if (masterSetlist && masterSetlist.entries.length > 0) {
    const totalDuration = setlistService.getTotalDuration(masterSetlist);
    html += `<div style="font-size:13px;color:var(--text-secondary);margin-bottom:8px">${masterSetlist.entries.length} songs &middot; ${formatDurationHM(totalDuration)}</div>`;
    html += '<div class="card">';
    html += _renderEntries(masterSetlist.entries, totalDuration);
    html += '</div>';
    if (masterSetlist.notes) {
      html += `<div class="daysheet-notes" style="margin-top:12px">${_esc(masterSetlist.notes)}</div>`;
    }
  } else {
    html += `
      <div class="empty-state">
        <div class="empty-state-icon">&#127925;</div>
        <h2 class="empty-state-title">No Master Setlist</h2>
        <p class="empty-state-text">The master setlist is created in the TourCal iOS app.</p>
      </div>
    `;
  }
  html += '</div>';

  // Per-show setlists tab
  html += '<div id="tab-shows" class="hidden">';
  const perShowSetlists = setlists.filter(s => !s.isMaster);

  if (perShowSetlists.length > 0) {
    // Build event lookup
    const eventMap = new Map();
    for (const ev of events) {
      eventMap.set(ev.eventKey, ev);
    }

    // Sort by event date (most recent first)
    perShowSetlists.sort((a, b) => {
      const evA = eventMap.get(a.eventKey);
      const evB = eventMap.get(b.eventKey);
      if (!evA?.startDate) return 1;
      if (!evB?.startDate) return -1;
      return evB.startDate - evA.startDate;
    });

    html += '<div class="list-group">';
    for (const sl of perShowSetlists) {
      const ev = eventMap.get(sl.eventKey);
      const dateStr = ev ? formatDateShort(ev.startDate) : '';
      const venue = ev?.venue || '';

      html += `
        <div class="list-item" data-setlist-key="${sl.eventKey}">
          <div class="list-item-content">
            <div class="list-item-title">${dateStr}${venue ? ' &middot; ' + _esc(venue) : ''}</div>
            <div class="list-item-subtitle">${sl.entries.length} songs &middot; ${formatDurationHM(setlistService.getTotalDuration(sl))}</div>
          </div>
          <span class="list-item-chevron"></span>
        </div>
      `;
    }
    html += '</div>';

    // Expanded setlist detail area
    html += '<div id="show-setlist-detail" style="margin-top:16px"></div>';
  } else {
    html += `
      <div class="empty-state">
        <div class="empty-state-icon">&#127925;</div>
        <h2 class="empty-state-title">No Per-Show Setlists</h2>
        <p class="empty-state-text">Per-show setlists will appear here once created.</p>
      </div>
    `;
  }
  html += '</div>';

  html += '</div>';
  container.innerHTML = html;

  // Tab switching
  container.querySelectorAll('.segment-item').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.segment-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.getElementById('tab-master').classList.toggle('hidden', tab !== 'master');
      document.getElementById('tab-shows').classList.toggle('hidden', tab !== 'shows');
    });
  });

  // Per-show setlist expansion
  container.querySelectorAll('[data-setlist-key]').forEach(item => {
    item.addEventListener('click', () => {
      const key = item.dataset.setlistKey;
      const sl = perShowSetlists.find(s => s.eventKey === key);
      if (sl) {
        const detail = document.getElementById('show-setlist-detail');
        if (detail) {
          const slTotal = setlistService.getTotalDuration(sl);
          detail.innerHTML = `<div class="card">${_renderEntries(sl.entries, slTotal)}</div>`;
          detail.scrollIntoView({ behavior: 'smooth' });
        }
      }
    });
  });
}

function _renderEntries(entries, totalDuration) {
  let html = '';
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
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
  return html;
}

function _renderRichNotes(entry) {
  let spans = [];
  const rn = entry.richNotes;
  if (rn) {
    if (Array.isArray(rn)) {
      // Flat array of {text, color}
      spans = rn;
    } else if (rn.spans && Array.isArray(rn.spans)) {
      // Swift encodes RichNotes as {spans: [...]}
      spans = rn.spans;
    } else if (typeof rn === 'string') {
      try {
        const parsed = JSON.parse(rn);
        spans = Array.isArray(parsed) ? parsed : (parsed.spans || []);
      } catch { /* ignore */ }
    }
  }
  if (spans.length === 0) return '';

  let html = '<div class="setlist-notes">';
  for (const span of spans) {
    const color = typeof span.color === 'string' ? span.color : 'plain';
    const text = typeof span.text === 'string' ? span.text : '';
    if (!text) continue;
    html += `<span class="note-span-${color}">${_esc(text)}</span>`;
  }
  html += '</div>';
  return html;
}

function _esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
