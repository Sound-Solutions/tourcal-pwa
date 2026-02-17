// Event Service - TourEvent CRUD (REST API)

import { tourService } from './tour-service.js';
import { cache } from './cache.js';
import { queryRecords, lookupRecord, saveRecord, tourFilter } from './cloudkit-api.js';

class EventService {
  async fetchEvents(tour) {
    if (!tour) return [];

    try {
      // Query all TourEvent records for this tour
      const records = await queryRecords(tour, 'TourEvent', {
        filterBy: [tourFilter(tour)],
        sortBy: [{ fieldName: 'startDate', ascending: true }]
      });

      const events = records
        .filter(r => !r.serverErrorCode)
        .map(r => this._parseEvent(r));

      await cache.put(cache.tourKey(tour.recordName, 'events'), events);
      return events;
    } catch (e) {
      console.warn('Error fetching events:', e);
      const cached = await cache.get(cache.tourKey(tour.recordName, 'events'), true);
      return cached || [];
    }
  }

  async saveEvent(tour, event) {
    const fields = {
      tourID: { value: { recordName: tour.recordName, action: 'DELETE_SELF' } },
      summary: { value: event.summary || '' },
      startDate: { value: event.startDate?.getTime() || Date.now() },
      endDate: { value: event.endDate?.getTime() || Date.now() },
      venue: { value: event.venue || '' },
      city: { value: event.city || '' },
      hotel: { value: event.hotel || '' },
      notes: { value: event.notes || '' },
      timeZoneIdentifier: { value: event.timeZoneIdentifier || '' },
      isArtistOnly: { value: event.isArtistOnly ? 1 : 0 },
      updatedAt: { value: Date.now() }
    };

    const record = {
      recordType: 'TourEvent',
      fields
    };

    if (event.recordName) {
      record.recordName = event.recordName;
      record.recordChangeTag = event.recordChangeTag;
    }

    const saved = await saveRecord(tour, record);
    return this._parseEvent(saved);
  }

  _parseEvent(record) {
    const f = record.fields || {};
    const startDate = f.startDate?.value ? new Date(f.startDate.value) : null;
    const endDate = f.endDate?.value ? new Date(f.endDate.value) : null;

    // Derive venue/city from location field if separate fields are empty
    let venue = f.venue?.value || '';
    let city = f.city?.value || '';
    if (!venue && !city && f.location?.value) {
      const parts = f.location.value.split(',').map(s => s.trim());
      venue = parts[0] || '';
      city = parts.slice(1).join(', ') || '';
    }

    return {
      recordName: record.recordName,
      recordChangeTag: record.recordChangeTag,
      zoneID: record.zoneID,
      summary: f.summary?.value || '',
      startDate,
      endDate,
      venue,
      city,
      hotel: f.hotel?.value || '',
      location: f.location?.value || '',
      notes: f.notes?.value || '',
      timeZoneIdentifier: f.timeZoneIdentifier?.value || '',
      isArtistOnly: (f.isArtistOnly?.value || 0) === 1,
      artistID: f.artistID?.value || '',
      createdAt: f.createdAt?.value ? new Date(f.createdAt.value) : null,
      updatedAt: f.updatedAt?.value ? new Date(f.updatedAt.value) : null,
      eventKey: this._generateEventKey(record.recordName, startDate)
    };
  }

  _generateEventKey(recordName, startDate) {
    if (!recordName || !startDate) return recordName || '';
    const dateStr = startDate.toISOString().split('T')[0];
    return `tour-${recordName}-${dateStr}`;
  }

  groupByDate(events) {
    const groups = new Map();
    for (const event of events) {
      if (!event.startDate) continue;
      const dateKey = event.startDate.toISOString().split('T')[0];
      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey).push(event);
    }
    return groups;
  }
}

export const eventService = new EventService();
