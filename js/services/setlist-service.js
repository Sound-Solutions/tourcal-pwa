// Setlist Service - Fetch/Save setlists + master setlist (REST API)

import { tourService } from './tour-service.js';
import { cache } from './cache.js';
import { queryRecords, lookupRecord, saveRecord, tourFilter } from './cloudkit-api.js';

class SetlistService {
  async fetchSetlists(tour) {
    if (!tour) return [];

    try {
      const records = await queryRecords(tour, 'Setlist', {
        filterBy: [tourFilter(tour)]
      });

      const setlists = records
        .filter(r => !r.serverErrorCode)
        .map(r => this._parseSetlist(r));
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

    try {
      const record = await lookupRecord(tour, `setlist-${eventKey}`);
      if (record && !record.serverErrorCode) {
        return this._parseSetlist(record);
      }
    } catch (e) {
      // May not exist
    }
    return null;
  }

  async fetchMasterSetlist(tour) {
    if (!tour) return null;

    try {
      const record = await lookupRecord(tour, `setlist-master-${tour.recordName}`);
      if (record && !record.serverErrorCode) {
        return this._parseSetlist(record);
      }
    } catch (e) {
      // May not exist
    }
    return null;
  }

  async saveSetlist(tour, setlist) {
    const recordName = setlist.isMaster
      ? `setlist-master-${tour.recordName}`
      : `setlist-${setlist.eventKey}`;

    const fields = {
      tourID: { value: { recordName: tour.recordName, action: 'DELETE_SELF' } },
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
      fields
    };

    if (setlist.recordChangeTag) {
      record.recordChangeTag = setlist.recordChangeTag;
    }

    const saved = await saveRecord(tour, record);
    return this._parseSetlist(saved);
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

  getTotalDuration(setlist) {
    if (!setlist?.entries) return 0;
    return setlist.entries.reduce((sum, e) => sum + (e.duration || 0), 0);
  }

  parseRichNotes(entry) {
    const rn = entry.richNotes;
    if (!rn) return [];
    if (Array.isArray(rn)) return rn;
    if (rn.spans && Array.isArray(rn.spans)) return rn.spans;
    if (typeof rn === 'string') {
      try {
        const parsed = JSON.parse(rn);
        return Array.isArray(parsed) ? parsed : (parsed.spans || []);
      } catch {
        return [{ text: rn, color: 'plain' }];
      }
    }
    return [];
  }
}

export const setlistService = new SetlistService();
