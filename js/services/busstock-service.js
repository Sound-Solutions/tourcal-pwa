// Bus Stock Service - Buses, sheets, defaults

import { tourService } from './tour-service.js';
import { cache } from './cache.js';

class BusStockService {
  async fetchBuses(tour) {
    if (!tour) return [];

    const db = tourService.getDB(tour);
    const zone = tourService.getZoneID(tour);

    try {
      const response = await db.performQuery({
        recordType: 'Bus',
        filterBy: [{
          fieldName: 'tourID',
          comparator: 'EQUALS',
          fieldValue: { value: tourService.getTourRef(tour) }
        }],
        sortBy: [{ fieldName: 'order', ascending: true }],
        zoneID: zone
      });

      const buses = (response.records || []).map(r => this._parseBus(r));
      await cache.put(cache.tourKey(tour.recordName, 'buses'), buses);
      return buses;
    } catch (e) {
      console.warn('Error fetching buses:', e);
      const cached = await cache.get(cache.tourKey(tour.recordName, 'buses'), true);
      return cached || [];
    }
  }

  async fetchSheet(tour, busId, date) {
    if (!tour || !busId || !date) return null;

    const db = tourService.getDB(tour);
    const zone = tourService.getZoneID(tour);
    const dateStr = this._formatDate(date);
    const recordName = `bus-${busId}-${dateStr}`;

    try {
      const response = await db.fetchRecords([{
        recordName,
        zoneID: zone
      }]);

      if (response.records && response.records.length > 0) {
        return this._parseSheet(response.records[0]);
      }
    } catch (e) {
      // Sheet may not exist
    }
    return null;
  }

  async fetchSheetsForBus(tour, busId) {
    if (!tour || !busId) return [];

    const db = tourService.getDB(tour);
    const zone = tourService.getZoneID(tour);

    try {
      const response = await db.performQuery({
        recordType: 'BusStockSheet',
        filterBy: [{
          fieldName: 'busID',
          comparator: 'EQUALS',
          fieldValue: { value: busId }
        }],
        sortBy: [{ fieldName: 'date', ascending: false }],
        zoneID: zone
      });

      return (response.records || []).map(r => this._parseSheet(r));
    } catch (e) {
      console.warn('Error fetching sheets for bus:', e);
      return [];
    }
  }

  async fetchDefaults(tour, busId) {
    if (!tour || !busId) return null;

    const db = tourService.getDB(tour);
    const zone = tourService.getZoneID(tour);

    try {
      const response = await db.fetchRecords([{
        recordName: `defaults-${busId}`,
        zoneID: zone
      }]);

      if (response.records && response.records.length > 0) {
        return this._parseDefaults(response.records[0]);
      }
    } catch (e) {
      // Defaults may not exist
    }
    return null;
  }

  async saveSheet(tour, sheet) {
    const db = tourService.getDB(tour);
    const zone = tourService.getZoneID(tour);
    const dateStr = this._formatDate(new Date(sheet.date));

    const fields = {
      busID: { value: sheet.busID },
      tourID: { value: sheet.tourID || tour.recordName },
      date: { value: new Date(sheet.date).getTime() },
      notes: { value: sheet.notes || '' },
      isLocked: { value: sheet.isLocked ? 1 : 0 },
      lastUpdated: { value: Date.now() },
      itemsJSON: { value: JSON.stringify(sheet.items || []) }
    };

    if (sheet.isLocked) {
      fields.lockedAt = { value: sheet.lockedAt?.getTime() || Date.now() };
      fields.lockedBy = { value: sheet.lockedBy || '' };
    }

    if (sheet.lockSchedule) {
      fields.lockScheduleJSON = { value: JSON.stringify(sheet.lockSchedule) };
    }

    const record = {
      recordType: 'BusStockSheet',
      recordName: `bus-${sheet.busID}-${dateStr}`,
      fields,
      zoneID: zone
    };

    if (sheet.recordChangeTag) {
      record.recordChangeTag = sheet.recordChangeTag;
    }

    const response = await db.saveRecords([record]);
    if (response.records && response.records.length > 0) {
      return this._parseSheet(response.records[0]);
    }
    throw new Error('Failed to save sheet');
  }

  // Check if sheet is locked (manual or schedule)
  isSheetLocked(sheet) {
    if (!sheet) return false;
    if (sheet.isLocked) return true;

    // Check lock schedule
    if (sheet.lockSchedule) {
      return this._isLockedBySchedule(sheet.lockSchedule, new Date(), sheet.date);
    }

    return false;
  }

  _isLockedBySchedule(schedule, now, sheetDate) {
    if (!schedule || !schedule.lockTime) return false;

    const sheetDay = new Date(sheetDate).getDay(); // 0=Sunday
    if (schedule.daysToLock && !schedule.daysToLock.includes(sheetDay)) {
      return false;
    }

    const [lockH, lockM] = schedule.lockTime.split(':').map(Number);
    const lockMinutes = lockH * 60 + lockM;

    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    if (schedule.unlockTime) {
      const [unlockH, unlockM] = schedule.unlockTime.split(':').map(Number);
      const unlockMinutes = unlockH * 60 + unlockM;

      if (lockMinutes < unlockMinutes) {
        return nowMinutes >= lockMinutes && nowMinutes < unlockMinutes;
      } else {
        return nowMinutes >= lockMinutes || nowMinutes < unlockMinutes;
      }
    }

    return nowMinutes >= lockMinutes;
  }

  _parseBus(record) {
    const f = record.fields || {};
    return {
      recordName: record.recordName,
      id: record.recordName,
      tourID: f.tourID?.value?.recordName || f.tourID?.value || '',
      name: f.name?.value || 'Bus',
      order: f.order?.value || 0,
      updatedAt: f.updatedAt?.value ? new Date(f.updatedAt.value) : null
    };
  }

  _parseSheet(record) {
    const f = record.fields || {};

    let items = [];
    if (f.itemsJSON?.value) {
      try { items = JSON.parse(f.itemsJSON.value); } catch (e) {}
    }

    let lockSchedule = null;
    if (f.lockScheduleJSON?.value) {
      try { lockSchedule = JSON.parse(f.lockScheduleJSON.value); } catch (e) {}
    }

    return {
      recordName: record.recordName,
      recordChangeTag: record.recordChangeTag,
      busID: f.busID?.value || '',
      tourID: f.tourID?.value || '',
      date: f.date?.value ? new Date(f.date.value) : null,
      items,
      notes: f.notes?.value || '',
      isLocked: (f.isLocked?.value || 0) === 1,
      lockedAt: f.lockedAt?.value ? new Date(f.lockedAt.value) : null,
      lockedBy: f.lockedBy?.value || '',
      lockSchedule,
      lastUpdated: f.lastUpdated?.value ? new Date(f.lastUpdated.value) : null
    };
  }

  _parseDefaults(record) {
    const f = record.fields || {};

    let items = [];
    if (f.itemsJSON?.value) {
      try { items = JSON.parse(f.itemsJSON.value); } catch (e) {}
    }

    return {
      recordName: record.recordName,
      recordChangeTag: record.recordChangeTag,
      busID: f.busID?.value || '',
      tourID: f.tourID?.value || '',
      items,
      lastUpdated: f.lastUpdated?.value ? new Date(f.lastUpdated.value) : null
    };
  }

  _formatDate(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // Group items by category
  groupByCategory(items) {
    const groups = new Map();
    for (const item of items) {
      const cat = item.category || 'Other';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(item);
    }
    // Sort items within each group
    for (const [, items] of groups) {
      items.sort((a, b) => (a.order || 0) - (b.order || 0));
    }
    return groups;
  }
}

export const busStockService = new BusStockService();
