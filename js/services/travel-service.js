// Travel Service - Geocoding + Routing via MapKit JS (matches iOS MKDirections/CLGeocoder)

import { cache } from './cache.js';

const CACHE_TTL = 7 * 24 * 3600000; // 7 days

const MAPKIT_TOKEN = 'eyJhbGciOiJFUzI1NiIsImtpZCI6Ilg4SkNNNUE2VDMiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJNMjJYWDJDU0FZIiwiaWF0IjoxNzcxNTQ1NTk3LCJleHAiOjE4MDMwODE1OTcsIm9yaWdpbiI6Imh0dHBzOi8vc291bmQtc29sdXRpb25zLmdpdGh1Yi5pbyJ9.9HzCGXiTGAbRWPZU_fSiIUUkGCzWk3jhBPUpfsB1ZCCwzI4uWdRo2JZHbJ8cF7ww9_Ac_M5CbW5GFlWElDIapw';

let _mapkitReady = false;
let _mapkitInitPromise = null;

function ensureMapKit() {
  if (_mapkitReady) return Promise.resolve();
  if (_mapkitInitPromise) return _mapkitInitPromise;

  _mapkitInitPromise = new Promise((resolve, reject) => {
    if (typeof mapkit === 'undefined') {
      reject(new Error('MapKit JS not loaded'));
      return;
    }
    mapkit.init({
      authorizationCallback: (done) => done(MAPKIT_TOKEN)
    });
    _mapkitReady = true;
    resolve();
  });

  return _mapkitInitPromise;
}

class TravelService {
  /**
   * Geocode a city string to { lat, lon }.
   * Uses MapKit JS Geocoder (same engine as CLGeocoder on iOS).
   */
  async geocode(city) {
    if (!city) return null;
    const key = `geo:mk:${city.toLowerCase().trim()}`;

    const cached = await cache.get(key);
    if (cached) return cached;

    try {
      await ensureMapKit();

      const geocoder = new mapkit.Geocoder();
      const result = await new Promise((resolve) => {
        geocoder.lookup(city, (error, data) => {
          if (error || !data?.results?.[0]) {
            resolve(null);
            return;
          }
          const place = data.results[0];
          resolve({
            lat: place.coordinate.latitude,
            lon: place.coordinate.longitude
          });
        });
      });

      if (result) {
        await cache.put(key, result, CACHE_TTL);
      }
      return result;
    } catch (e) {
      console.warn(`[TravelService] MapKit geocode failed for '${city}':`, e);
      return null;
    }
  }

  /**
   * Get driving route between two {lat, lon} points via MapKit JS Directions.
   * Returns { distance (meters), duration (seconds) } or null.
   */
  async route(from, to) {
    if (!from || !to) return null;

    const key = `route:mk:${from.lat.toFixed(4)},${from.lon.toFixed(4)}-${to.lat.toFixed(4)},${to.lon.toFixed(4)}`;
    const cached = await cache.get(key);
    if (cached) return cached;

    try {
      await ensureMapKit();

      const directions = new mapkit.Directions();
      const request = {
        origin: new mapkit.Coordinate(from.lat, from.lon),
        destination: new mapkit.Coordinate(to.lat, to.lon),
        transportType: mapkit.Directions.Transport.Automobile
      };

      const response = await new Promise((resolve, reject) => {
        directions.route(request, (error, data) => {
          if (error) reject(error);
          else resolve(data);
        });
      });

      if (response.routes?.[0]) {
        const r = response.routes[0];
        const result = {
          distance: r.distance,                  // meters
          duration: r.expectedTravelTime         // seconds
        };
        await cache.put(key, result, CACHE_TTL);
        return result;
      }
    } catch (e) {
      console.warn('[TravelService] MapKit directions failed:', e);
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

    // Try MapKit JS driving directions
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

    // Geocode each group (MapKit has no strict rate limit like Nominatim)
    const geocodePromises = groups.map(g => this.geocode(g.city));
    const coords = await Promise.all(geocodePromises);

    const unmerged = [];
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      const coord = coords[i];
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
}

export const travelService = new TravelService();
