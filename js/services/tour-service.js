// Tour Service - Fetch tours from private + shared CloudKit databases

import { getPrivateDB, getSharedDB, ZONE_NAME, zoneID } from '../cloudkit-config.js';
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

    // Fetch from private DB
    try {
      const privateTours = await this._fetchPrivateTours();
      tours.push(...privateTours);
    } catch (e) {
      console.warn('Error fetching private tours:', e);
    }

    // Fetch from shared DB
    try {
      const sharedTours = await this._fetchSharedTours();
      tours.push(...sharedTours);
    } catch (e) {
      console.warn('Error fetching shared tours:', e);
    }

    this._tours = tours.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

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

  async _fetchPrivateTours() {
    const db = getPrivateDB();
    const response = await db.performQuery({
      recordType: 'Tour',
      zoneID: zoneID(ZONE_NAME)
    });

    if (!response.records) return [];

    return response.records.map(record => this._parseTour(record, false));
  }

  async _fetchSharedTours() {
    const db = getSharedDB();
    const tours = [];

    try {
      const zonesResponse = await db.fetchAllRecordZones();
      if (!zonesResponse.zones) return [];

      for (const zone of zonesResponse.zones) {
        try {
          const response = await db.performQuery({
            recordType: 'Tour',
            zoneID: {
              zoneName: zone.zoneID.zoneName,
              ownerRecordName: zone.zoneID.ownerRecordName
            }
          });

          if (response.records) {
            for (const record of response.records) {
              const tour = this._parseTour(record, true);
              tour.zoneID = {
                zoneName: zone.zoneID.zoneName,
                ownerRecordName: zone.zoneID.ownerRecordName
              };

              // Detect share role
              tour.role = await this._detectRole(record, zone);
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

  async _detectRole(record, zone) {
    try {
      const db = getSharedDB();
      // Try to fetch the share record for this zone
      const shareResponse = await db.fetchRecords([{
        recordName: `cloudkit.share.${zone.zoneID.zoneName}`,
        zoneID: {
          zoneName: zone.zoneID.zoneName,
          ownerRecordName: zone.zoneID.ownerRecordName
        }
      }]);

      if (shareResponse.records && shareResponse.records.length > 0) {
        const share = shareResponse.records[0];
        // Check custom tourRole field first (new shares)
        if (share.fields?.tourRole?.value) {
          return share.fields.tourRole.value;
        }
        // Fall back to permission-based detection
        if (share.publicPermission === 'READ_WRITE' ||
            share.currentUserParticipant?.permission === 'READ_WRITE') {
          return 'Admin';
        }
        return 'Crew';
      }
    } catch (e) {
      console.warn('Error detecting role:', e);
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
      role: isShared ? 'Crew' : 'Owner', // Updated after share role detection
      _record: record
    };
  }

  getDB(tour) {
    return tour?.isShared ? getSharedDB() : getPrivateDB();
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
