// Venue Service - VenueNote CRUD

import { tourService } from './tour-service.js';
import { cache } from './cache.js';

class VenueService {
  async fetchVenueNotes(tour) {
    if (!tour) return [];

    const db = tourService.getDB(tour);
    const zone = tourService.getZoneID(tour);

    try {
      const response = await db.performQuery({
        recordType: 'VenueNote',
        filterBy: [{
          fieldName: 'tourID',
          comparator: 'EQUALS',
          fieldValue: { value: tourService.getTourRef(tour) }
        }],
        zoneID: zone
      });

      const notes = (response.records || []).map(r => this._parseVenueNote(r));
      await cache.put(cache.tourKey(tour.recordName, 'venueNotes'), notes);
      return notes;
    } catch (e) {
      console.warn('Error fetching venue notes:', e);
      const cached = await cache.get(cache.tourKey(tour.recordName, 'venueNotes'), true);
      return cached || [];
    }
  }

  async fetchVenueNote(tour, venueKey) {
    if (!tour || !venueKey) return null;

    const db = tourService.getDB(tour);
    const zone = tourService.getZoneID(tour);

    try {
      const response = await db.fetchRecords([{
        recordName: `venueNote-${venueKey}`,
        zoneID: zone
      }]);

      if (response.records && response.records.length > 0) {
        return this._parseVenueNote(response.records[0]);
      }
    } catch (e) {
      // May not exist
    }
    return null;
  }

  async saveVenueNote(tour, venueNote) {
    const db = tourService.getDB(tour);
    const zone = tourService.getZoneID(tour);

    const fields = {
      tourID: { value: tourService.getTourRef(tour) },
      venueKey: { value: venueNote.venueKey },
      venueName: { value: venueNote.venueName || '' },
      wifiNetwork: { value: venueNote.wifiNetwork || '' },
      wifiPassword: { value: venueNote.wifiPassword || '' },
      loadInLocation: { value: venueNote.loadInLocation || '' },
      parking: { value: venueNote.parking || '' },
      greenRoom: { value: venueNote.greenRoom || '' },
      contacts: { value: venueNote.contacts || '' },
      notes: { value: venueNote.notes || '' },
      lastUpdated: { value: Date.now() }
    };

    const record = {
      recordType: 'VenueNote',
      recordName: `venueNote-${venueNote.venueKey}`,
      fields,
      zoneID: zone
    };

    if (venueNote.recordChangeTag) {
      record.recordChangeTag = venueNote.recordChangeTag;
    }

    const response = await db.saveRecords([record]);
    if (response.records && response.records.length > 0) {
      return this._parseVenueNote(response.records[0]);
    }
    throw new Error('Failed to save venue note');
  }

  _parseVenueNote(record) {
    const f = record.fields || {};
    return {
      recordName: record.recordName,
      recordChangeTag: record.recordChangeTag,
      venueKey: f.venueKey?.value || '',
      venueName: f.venueName?.value || '',
      wifiNetwork: f.wifiNetwork?.value || '',
      wifiPassword: f.wifiPassword?.value || '',
      loadInLocation: f.loadInLocation?.value || '',
      parking: f.parking?.value || '',
      greenRoom: f.greenRoom?.value || '',
      contacts: f.contacts?.value || '',
      notes: f.notes?.value || '',
      lastUpdated: f.lastUpdated?.value ? new Date(f.lastUpdated.value) : null
    };
  }

  // Generate venue key from venue name
  generateVenueKey(venueName) {
    return (venueName || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}

export const venueService = new VenueService();
