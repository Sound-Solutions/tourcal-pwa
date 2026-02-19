// Route Map View - Tour stops on a Leaflet/OpenStreetMap map

import { tourService } from '../services/tour-service.js';
import { eventService } from '../services/event-service.js';
import { travelService } from '../services/travel-service.js';
import { cache } from '../services/cache.js';
import { formatDateCompact } from '../models/formatters.js';

export async function renderRouteView() {
  const content = document.getElementById('app-content');
  const tour = tourService.activeTour;

  if (!tour) {
    window.location.hash = '#/tours';
    return;
  }

  document.getElementById('header-title').textContent = tour.name || 'Route';
  document.getElementById('header-actions').innerHTML = `
    <button class="btn btn-text" onclick="window.location.hash='#/'">&#8249; Schedule</button>
  `;

  content.innerHTML = `
    <div class="route-view">
      <div id="route-map" class="route-map"></div>
      <div id="route-loading" class="route-loading">
        <div class="spinner"></div>
        <span class="loading-text">Loading route...</span>
      </div>
      <div id="route-overlay" class="route-overlay" style="display:none"></div>
    </div>
  `;

  try {
    const events = await eventService.fetchEvents(tour);
    const role = tour.role;
    const filtered = role === 'Artist' ? events : events.filter(e => !e.isArtistOnly);

    if (filtered.length === 0) {
      document.getElementById('route-loading').innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">&#128506;</div>
          <h2 class="empty-state-title">No Events</h2>
          <p class="empty-state-text">No events to show on the map.</p>
        </div>
      `;
      return;
    }

    const sorted = [...filtered].sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
    const { stops, routePath } = await travelService.buildRouteStops(sorted);

    document.getElementById('route-loading').style.display = 'none';
    _renderMap(stops, routePath, tour);
  } catch (e) {
    console.error('Error loading route:', e);
    document.getElementById('route-loading').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">&#9888;</div>
        <h2 class="empty-state-title">Error</h2>
        <p class="empty-state-text">${e.message}</p>
      </div>
    `;
  }
}

function _renderMap(stops, routePath, tour) {
  const tourColor = tour.colorHex || '#007AFF';

  // Initialize Leaflet map
  const map = L.map('route-map', {
    zoomControl: false,
    attributionControl: false
  });

  // Add OpenStreetMap tiles
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18
  }).addTo(map);

  // Zoom control top-right
  L.control.zoom({ position: 'topright' }).addTo(map);

  // Attribution bottom-right
  L.control.attribution({ position: 'bottomright', prefix: false })
    .addAttribution('&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>')
    .addTo(map);

  // Draw route polyline
  if (routePath.length > 1) {
    const latlngs = routePath.map(c => [c.lat, c.lon]);
    L.polyline(latlngs, {
      color: tourColor,
      weight: 2.5,
      opacity: 0.6
    }).addTo(map);
  }

  // Add stop markers
  const bounds = [];
  for (const stop of stops) {
    const latlng = [stop.coord.lat, stop.coord.lon];
    bounds.push(latlng);

    const label = stop.visits.map(v => v.index + 1).join(', ');
    const isReturn = stop.visits.length > 1;
    const size = isReturn ? [Math.max(28, label.length * 8 + 12), 24] : [24, 24];

    const icon = L.divIcon({
      className: 'route-stop-icon',
      html: `<div class="route-stop-pin ${isReturn ? 'route-stop-capsule' : ''}" style="background:${tourColor}">${label}</div>`,
      iconSize: size,
      iconAnchor: [size[0] / 2, size[1] / 2]
    });

    const marker = L.marker(latlng, { icon }).addTo(map);

    // Build popup/overlay content
    const overlay = document.getElementById('route-overlay');
    marker.on('click', () => {
      let html = `<div class="route-stop-detail">`;
      html += `<div class="route-stop-venue">${_esc(stop.venue)}</div>`;
      if (stop.city && stop.city !== stop.venue) {
        html += `<div class="route-stop-city">${_esc(stop.city)}</div>`;
      }
      for (const visit of stop.visits) {
        const dateStr = formatDateCompact(visit.date);
        if (visit.endDate) {
          const endStr = formatDateCompact(visit.endDate);
          html += `<div class="route-stop-date">Stop ${visit.index + 1}: ${dateStr} – ${endStr}</div>`;
        } else {
          html += `<div class="route-stop-date">Stop ${visit.index + 1}: ${dateStr}</div>`;
        }
      }
      html += `<button class="route-stop-close" onclick="document.getElementById('route-overlay').style.display='none'">&times;</button>`;
      html += `</div>`;
      overlay.innerHTML = html;
      overlay.style.display = 'block';
    });
  }

  // Fit map to bounds
  if (bounds.length > 0) {
    map.fitBounds(bounds, { padding: [40, 40] });
  }

  // Close overlay on map click
  map.on('click', () => {
    document.getElementById('route-overlay').style.display = 'none';
  });
}

function _esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
