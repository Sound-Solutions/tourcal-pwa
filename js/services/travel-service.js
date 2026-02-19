// Travel Service - Geocoding (Nominatim) + Routing (OSRM), both free, no API key

import { cache } from './cache.js';

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';
const CACHE_TTL = 7 * 24 * 3600000; // 7 days

// 2-letter codes that overlap with US state abbreviations → country names
const COUNTRY_CODE_MAP = {
  AL: 'Albania',  AR: 'Argentina', CO: 'Colombia',
  DE: 'Germany',  GA: 'Georgia',   ID: 'Indonesia',
  IL: 'Israel',   IN: 'India',     LA: 'Laos',
  MA: 'Morocco',  MD: 'Moldova',   ME: 'Montenegro',
  MN: 'Mongolia', MO: 'Monaco',    MT: 'Malta',
  NC: 'New Caledonia', NE: 'Netherlands',
  PA: 'Panama',   SC: 'Seychelles', VA: 'Vatican City',
};

class TravelService {
  constructor() {
    this._geocodeQueue = Promise.resolve();
  }

  /**
   * Geocode a city string to { lat, lon }.
   * Uses Nominatim (1 req/sec rate limit enforced via queue).
   */
  async geocode(city) {
    if (!city) return null;
    const key = `geo:${city.toLowerCase().trim()}`;

    const cached = await cache.get(key);
    if (cached) return cached;

    // Queue requests to respect Nominatim 1 req/sec
    const result = await this._enqueueGeocode(city);
    if (result) {
      await cache.put(key, result, CACHE_TTL);
    }
    return result;
  }

  /**
   * Get driving route between two {lat, lon} points via OSRM.
   * Returns { distance (meters), duration (seconds) } or null.
   */
  async route(from, to) {
    if (!from || !to) return null;

    const key = `route:${from.lat.toFixed(4)},${from.lon.toFixed(4)}-${to.lat.toFixed(4)},${to.lon.toFixed(4)}`;
    const cached = await cache.get(key);
    if (cached) return cached;

    try {
      const url = `${OSRM_BASE}/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.code === 'Ok' && data.routes?.[0]) {
        const r = data.routes[0];
        const result = {
          distance: r.distance,  // meters
          duration: r.duration   // seconds
        };
        await cache.put(key, result, CACHE_TTL);
        return result;
      }
    } catch (e) {
      console.warn('[TravelService] OSRM route failed:', e);
    }
    return null;
  }

  /**
   * Get travel info between two city strings.
   * Returns { distance, duration, distanceMiles, formattedDistance, formattedDuration, isFlight } or null.
   */
  async travelBetween(fromCity, toCity) {
    const [fromCoord, toCoord] = await Promise.all([
      this.geocode(fromCity),
      this.geocode(toCity)
    ]);

    if (!fromCoord || !toCoord) return null;

    // Try OSRM driving route
    const routeData = await this.route(fromCoord, toCoord);

    if (routeData) {
      const miles = routeData.distance / 1609.34;
      return {
        distance: routeData.distance,
        duration: routeData.duration,
        distanceMiles: miles,
        formattedDistance: this._formatDistance(miles),
        formattedDuration: this._formatDuration(routeData.duration),
        isFlight: false,
        fromCoord,
        toCoord
      };
    }

    // Fallback: straight-line (flight) distance
    const straightLine = this._haversine(fromCoord, toCoord);
    const miles = straightLine / 1609.34;
    return {
      distance: straightLine,
      duration: null,
      distanceMiles: miles,
      formattedDistance: this._formatDistance(miles),
      formattedDuration: null,
      isFlight: true,
      fromCoord,
      toCoord
    };
  }

  /**
   * Get coordinates for all events, collapsing consecutive same-city into stops.
   * Returns { stops: [...], routePath: [...] } for the route map.
   */
  async buildRouteStops(events) {
    // Collapse consecutive same-city events
    const groups = [];
    for (const event of events) {
      const city = (event.city || event.venue || '').trim();
      const normalized = city.toLowerCase();
      if (groups.length > 0 && groups[groups.length - 1].normalized === normalized) {
        groups[groups.length - 1].lastDate = event.startDate;
        groups[groups.length - 1].events.push(event);
      } else {
        groups.push({
          city,
          normalized,
          firstEvent: event,
          lastDate: event.startDate,
          events: [event]
        });
      }
    }

    // Geocode each group
    const unmerged = [];
    for (const group of groups) {
      const coord = await this.geocode(group.city);
      if (coord) {
        const hasMultipleDays = group.lastDate && group.firstEvent.startDate &&
          new Date(group.lastDate).toDateString() !== new Date(group.firstEvent.startDate).toDateString();
        unmerged.push({
          id: group.firstEvent.recordName,
          coord,
          venue: group.firstEvent.venue || group.firstEvent.summary,
          city: group.city,
          date: group.firstEvent.startDate,
          endDate: hasMultipleDays ? group.lastDate : null,
          index: unmerged.length
        });
      }
    }

    // Route path (unmerged, for polyline)
    const routePath = unmerged.map(s => s.coord);

    // Merge return visits (non-consecutive same city)
    const mergedByCity = new Map();
    const cityOrder = [];

    for (const stop of unmerged) {
      const key = stop.city.toLowerCase().trim();
      if (mergedByCity.has(key)) {
        mergedByCity.get(key).visits.push({
          index: stop.index,
          date: stop.date,
          endDate: stop.endDate
        });
      } else {
        const merged = {
          ...stop,
          visits: [{ index: stop.index, date: stop.date, endDate: stop.endDate }]
        };
        mergedByCity.set(key, merged);
        cityOrder.push(key);
      }
    }

    const stops = cityOrder.map(k => mergedByCity.get(k));

    return { stops, routePath };
  }

  // --- Private helpers ---

  _enqueueGeocode(city) {
    this._geocodeQueue = this._geocodeQueue.then(async () => {
      await this._sleep(1100); // Nominatim rate limit
      let result = await this._doGeocode(city);

      // If failed and ends with a 2-letter code that overlaps with a US state,
      // retry with the full country name (e.g. "LANDGRAAF, NE" → "LANDGRAAF, Netherlands")
      if (!result) {
        const parts = city.split(',').map(s => s.trim());
        if (parts.length >= 2) {
          const suffix = parts[parts.length - 1];
          if (suffix.length === 2) {
            const countryName = COUNTRY_CODE_MAP[suffix.toUpperCase()];
            if (countryName) {
              const cityPart = parts.slice(0, -1).join(', ');
              const expanded = `${cityPart}, ${countryName}`;
              console.log(`[TravelService] Retrying with country name: '${expanded}'`);
              await this._sleep(1100);
              result = await this._doGeocode(expanded);
            }
          }
        }
      }

      return result;
    });
    return this._geocodeQueue;
  }

  async _doGeocode(city) {
    try {
      const url = `${NOMINATIM_BASE}?q=${encodeURIComponent(city)}&format=json&limit=1`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'TourCal-PWA/1.0' }
      });
      const data = await res.json();
      if (data?.[0]) {
        return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
      }
    } catch (e) {
      console.warn(`[TravelService] Geocode failed for '${city}':`, e);
    }
    return null;
  }

  _haversine(a, b) {
    const R = 6371000; // Earth radius in meters
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const sinLat = Math.sin(dLat / 2);
    const sinLon = Math.sin(dLon / 2);
    const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLon * sinLon;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  _formatDistance(miles) {
    if (miles >= 1000) return `${(miles / 1000).toFixed(1)}k mi`;
    return `${Math.round(miles)} mi`;
  }

  _formatDuration(seconds) {
    if (!seconds) return null;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }

  _sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
}

export const travelService = new TravelService();
