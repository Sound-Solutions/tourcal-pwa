// Venue Service - VenueNote CRUD (REST API)

import { tourService } from './tour-service.js';
import { cache } from './cache.js';
import { queryRecords, lookupRecord, saveRecord, tourFilter } from './cloudkit-api.js';

class VenueService {
  async fetchVenueNotes(tour) {
    if (!tour) return [];

    try {
      const records = await queryRecords(tour, 'VenueNote', {
        filterBy: [tourFilter(tour)]
      });

      const notes = records
        .filter(r => !r.serverErrorCode)
        .map(r => this._parseVenueNote(r));
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

    try {
      const record = await lookupRecord(tour, `venueNote-${venueKey}`);
      if (record && !record.serverErrorCode) {
        return this._parseVenueNote(record);
      }
    } catch (e) {
      // May not exist
    }
    return null;
  }

  async saveVenueNote(tour, venueNote) {
    const fields = {
      tourID: { value: { recordName: tour.recordName, action: 'DELETE_SELF' } },
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
      fields
    };

    if (venueNote.recordChangeTag) {
      record.recordChangeTag = venueNote.recordChangeTag;
    }

    const saved = await saveRecord(tour, record);
    return this._parseVenueNote(saved);
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

  generateVenueKey(venueName) {
    return (venueName || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}

export const venueService = new VenueService();
