// Tour Service - Fetch tours from private + shared CloudKit databases
// Uses REST API via authService.apiFetch() for reliable auth.

import { ZONE_NAME, zoneID } from '../cloudkit-config.js';
import { authService } from './auth.js';
import { cache } from './cache.js';

class TourService {
  constructor() {
    this._tours = [];
    this._activeTour = null;
    this._listeners = [];
  }

  get tours() {
    return this._tours;
  }

  get activeTour() {
    return this._activeTour;
  }

  set activeTour(tour) {
    this._activeTour = tour;
    if (tour) {
      localStorage.setItem('tourcal_activeTourId', tour.recordName);
    }
    this._notify();
  }

  onTourChange(callback) {
    this._listeners.push(callback);
    return () => {
      this._listeners = this._listeners.filter(l => l !== callback);
    };
  }

  _notify() {
    this._listeners.forEach(cb => cb(this._activeTour));
  }

  async fetchTours() {
    const tours = [];
    const errors = [];

    // Fetch from private DB
    try {
      const privateTours = await this._fetchPrivateTours();
      tours.push(...privateTours);
    } catch (e) {
      console.error('[TourService] Error fetching private tours:', e);
      errors.push(`Private: ${e.message}`);
    }

    // Fetch from shared DB
    try {
      const sharedTours = await this._fetchSharedTours();
      tours.push(...sharedTours);
    } catch (e) {
      console.error('[TourService] Error fetching shared tours:', e);
      errors.push(`Shared: ${e.message}`);
    }

    console.log(`[TourService] Total tours found: ${tours.length}` +
      (errors.length ? ` (errors: ${errors.join('; ')})` : ''));

    this._tours = tours.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    this._lastErrors = errors;

    // Cache tours
    await cache.put('tours', this._tours);

    // Restore active tour
    const savedId = localStorage.getItem('tourcal_activeTourId');
    if (savedId) {
      const saved = this._tours.find(t => t.recordName === savedId);
      if (saved) {
        this._activeTour = saved;
        this._notify();
      }
    }

    return this._tours;
  }

  get lastErrors() {
    return this._lastErrors || [];
  }

  async _fetchPrivateTours() {
    console.log('[TourService] Fetching private tours via REST API...');
    const body = {
      zoneID: { zoneName: ZONE_NAME },
      query: { recordType: 'Tour' }
    };
    console.log('[TourService] Private query body:', JSON.stringify(body));

    const res = await authService.apiFetch('/private/records/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    console.log('[TourService] Private response status:', res.status);
    const data = await res.json();
    console.log('[TourService] Private tours response:', JSON.stringify(data).substring(0, 1000));

    if (data.serverErrorCode) {
      throw new Error(`CloudKit error: ${data.serverErrorCode} - ${data.reason || ''}`);
    }

    if (!data.records) return [];

    console.log(`[TourService] Found ${data.records.length} private tours`);
    return data.records
      .filter(r => !r.serverErrorCode)
      .map(record => this._parseTour(record, false));
  }

  async _fetchSharedTours() {
    console.log('[TourService] Fetching shared tours via REST API...');
    const tours = [];

    try {
      // Fetch all shared zones
      const zonesRes = await authService.apiFetch('/shared/zones/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      console.log('[TourService] Shared zones response status:', zonesRes.status);
      const zonesData = await zonesRes.json();
      console.log('[TourService] Shared zones response:', JSON.stringify(zonesData).substring(0, 1000));
      if (!zonesData.zones) return [];

      for (const zone of zonesData.zones) {
        try {
          const zid = zone.zoneID;
          const res = await authService.apiFetch('/shared/records/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              zoneID: { zoneName: zid.zoneName, ownerRecordName: zid.ownerRecordName },
              query: { recordType: 'Tour' }
            })
          });

          const data = await res.json();
          if (data.records) {
            for (const record of data.records) {
              const tour = this._parseTour(record, true);
              tour.zoneID = {
                zoneName: zid.zoneName,
                ownerRecordName: zid.ownerRecordName
              };
              tour.role = this._detectRoleFromRecord(record);
              tours.push(tour);
            }
          }
        } catch (e) {
          console.warn(`Error querying zone ${zone.zoneID.zoneName}:`, e);
        }
      }
    } catch (e) {
      console.warn('Error fetching shared zones:', e);
    }

    return tours;
  }

  _detectRoleFromRecord(record) {
    // Check for share participant permissions in the record
    if (record.share) {
      const participant = record.share.currentUserParticipant;
      if (participant?.permission === 'READ_WRITE') return 'Admin';
    }
    return 'Crew';
  }

  _parseTour(record, isShared) {
    const f = record.fields || {};
    return {
      recordName: record.recordName,
      recordType: 'Tour',
      zoneID: record.zoneID || zoneID(ZONE_NAME),
      isShared,
      name: f.name?.value || 'Untitled Tour',
      colorHex: f.colorHex?.value || '#007AFF',
      createdAt: f.createdAt?.value ? new Date(f.createdAt.value) : null,
      daySheetDefaults: f.daySheetDefaults?.value
        ? JSON.parse(f.daySheetDefaults.value)
        : null,
      role: isShared ? 'Crew' : 'Owner',
      _record: record
    };
  }

  getDB(tour) {
    return tour?.isShared ? 'shared' : 'private';
  }

  getZoneID(tour) {
    if (tour?.isShared && tour.zoneID) {
      return tour.zoneID;
    }
    return zoneID(ZONE_NAME);
  }

  getTourRef(tour) {
    return {
      recordName: tour.recordName,
      zoneID: this.getZoneID(tour),
      action: 'DELETE_SELF'
    };
  }

  async loadCachedTours() {
    const cached = await cache.get('tours');
    if (cached) {
      this._tours = cached;
      const savedId = localStorage.getItem('tourcal_activeTourId');
      if (savedId) {
        this._activeTour = this._tours.find(t => t.recordName === savedId) || null;
      }
    }
    return this._tours;
  }
}

export const tourService = new TourService();
