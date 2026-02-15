// Setlist Service - Fetch/Save setlists + master setlist

import { tourService } from './tour-service.js';
import { cache } from './cache.js';

class SetlistService {
  async fetchSetlists(tour) {
    if (!tour) return [];

    const db = tourService.getDB(tour);
    const zone = tourService.getZoneID(tour);

    try {
      const response = await db.performQuery({
        recordType: 'Setlist',
        filterBy: [{
          fieldName: 'tourID',
          comparator: 'EQUALS',
          fieldValue: { value: tourService.getTourRef(tour) }
        }],
        zoneID: zone
      });

      const setlists = (response.records || []).map(r => this._parseSetlist(r));
      await cache.put(cache.tourKey(tour.recordName, 'setlists'), setlists);
      return setlists;
    } catch (e) {
      console.warn('Error fetching setlists:', e);
      const cached = await cache.get(cache.tourKey(tour.recordName, 'setlists'), true);
      return cached || [];
    }
  }

  async fetchSetlistForEvent(tour, eventKey) {
    if (!tour || !eventKey) return null;

    const db = tourService.getDB(tour);
    const zone = tourService.getZoneID(tour);

    try {
      const response = await db.fetchRecords([{
        recordName: `setlist-${eventKey}`,
        zoneID: zone
      }]);

      if (response.records && response.records.length > 0) {
        return this._parseSetlist(response.records[0]);
      }
    } catch (e) {
      // May not exist
    }
    return null;
  }

  async fetchMasterSetlist(tour) {
    if (!tour) return null;

    const db = tourService.getDB(tour);
    const zone = tourService.getZoneID(tour);

    try {
      const response = await db.fetchRecords([{
        recordName: `setlist-master-${tour.recordName}`,
        zoneID: zone
      }]);

      if (response.records && response.records.length > 0) {
        return this._parseSetlist(response.records[0]);
      }
    } catch (e) {
      // May not exist
    }
    return null;
  }

  async saveSetlist(tour, setlist) {
    const db = tourService.getDB(tour);
    const zone = tourService.getZoneID(tour);

    const recordName = setlist.isMaster
      ? `setlist-master-${tour.recordName}`
      : `setlist-${setlist.eventKey}`;

    const fields = {
      tourID: { value: tourService.getTourRef(tour) },
      eventKey: { value: setlist.eventKey || 'master' },
      isMaster: { value: setlist.isMaster ? 1 : 0 },
      basedOnMaster: { value: setlist.basedOnMaster ? 1 : 0 },
      notes: { value: setlist.notes || '' },
      lastUpdated: { value: Date.now() },
      entriesJSON: { value: JSON.stringify(setlist.entries || []) }
    };

    const record = {
      recordType: 'Setlist',
      recordName,
      fields,
      zoneID: zone
    };

    if (setlist.recordChangeTag) {
      record.recordChangeTag = setlist.recordChangeTag;
    }

    const response = await db.saveRecords([record]);
    if (response.records && response.records.length > 0) {
      return this._parseSetlist(response.records[0]);
    }
    throw new Error('Failed to save setlist');
  }

  _parseSetlist(record) {
    const f = record.fields || {};

    let entries = [];
    if (f.entriesJSON?.value) {
      try {
        entries = JSON.parse(f.entriesJSON.value);
      } catch (e) {
        console.warn('Failed to parse entriesJSON:', e);
      }
    }

    // Sort entries by order
    entries.sort((a, b) => (a.order || 0) - (b.order || 0));

    return {
      recordName: record.recordName,
      recordChangeTag: record.recordChangeTag,
      eventKey: f.eventKey?.value || '',
      isMaster: (f.isMaster?.value || 0) === 1,
      basedOnMaster: (f.basedOnMaster?.value || 0) === 1,
      notes: f.notes?.value || '',
      lastUpdated: f.lastUpdated?.value ? new Date(f.lastUpdated.value) : null,
      entries
    };
  }

  // Get total duration of setlist in seconds
  getTotalDuration(setlist) {
    if (!setlist?.entries) return 0;
    return setlist.entries.reduce((sum, e) => sum + (e.duration || 0), 0);
  }

  // Parse rich notes from entry
  parseRichNotes(entry) {
    if (!entry.richNotes) return [];
    if (Array.isArray(entry.richNotes)) return entry.richNotes;
    try {
      return JSON.parse(entry.richNotes);
    } catch {
      return [{ text: String(entry.richNotes), color: 'plain' }];
    }
  }
}

export const setlistService = new SetlistService();
