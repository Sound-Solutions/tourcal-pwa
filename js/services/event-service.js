// Event Service - TourEvent CRUD

import { tourService } from './tour-service.js';
import { cache } from './cache.js';

class EventService {
  async fetchEvents(tour) {
    if (!tour) return [];

    const db = tourService.getDB(tour);
    const zone = tourService.getZoneID(tour);

    try {
      const response = await db.performQuery({
        recordType: 'TourEvent',
        filterBy: [{
          fieldName: 'tourID',
          comparator: 'EQUALS',
          fieldValue: { value: tourService.getTourRef(tour) }
        }],
        sortBy: [{ fieldName: 'startDate', ascending: true }],
        zoneID: zone
      });

      const events = (response.records || []).map(r => this._parseEvent(r));

      // Cache
      await cache.put(cache.tourKey(tour.recordName, 'events'), events);

      return events;
    } catch (e) {
      console.warn('Error fetching events:', e);
      // Try cache
      const cached = await cache.get(cache.tourKey(tour.recordName, 'events'), true);
      return cached || [];
    }
  }

  async saveEvent(tour, event) {
    const db = tourService.getDB(tour);
    const zone = tourService.getZoneID(tour);

    const fields = {
      tourID: { value: tourService.getTourRef(tour) },
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
      fields,
      zoneID: zone
    };

    if (event.recordName) {
      record.recordName = event.recordName;
      record.recordChangeTag = event.recordChangeTag;
    }

    const response = await db.saveRecords([record]);
    if (response.records && response.records.length > 0) {
      return this._parseEvent(response.records[0]);
    }
    throw new Error('Failed to save event');
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
      // Generate event key for daysheet/setlist linkage
      eventKey: this._generateEventKey(record.recordName, startDate)
    };
  }

  _generateEventKey(recordName, startDate) {
    if (!recordName || !startDate) return recordName || '';
    const dateStr = startDate.toISOString().split('T')[0]; // yyyy-MM-dd
    return `tour-${recordName}-${dateStr}`;
  }

  // Group events by date
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
