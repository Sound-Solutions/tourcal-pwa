// Bus Stock Service - Buses, sheets, defaults (REST API)

import { tourService } from './tour-service.js';
import { cache } from './cache.js';
import { queryRecords, lookupRecord, saveRecord, tourFilter, stringFilter } from './cloudkit-api.js';

class BusStockService {
  async fetchBuses(tour) {
    if (!tour) return [];

    try {
      const records = await queryRecords(tour, 'Bus', {
        filterBy: [tourFilter(tour)],
        sortBy: [{ fieldName: 'order', ascending: true }]
      });

      const buses = records
        .filter(r => !r.serverErrorCode)
        .map(r => this._parseBus(r));
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

    const dateStr = this._formatDate(date);
    const recordName = `bus-${busId}-${dateStr}`;

    try {
      const record = await lookupRecord(tour, recordName);
      if (record && !record.serverErrorCode) {
        return this._parseSheet(record);
      }
    } catch (e) {
      // Sheet may not exist
    }
    return null;
  }

  async fetchSheetsForBus(tour, busId) {
    if (!tour || !busId) return [];

    try {
      const records = await queryRecords(tour, 'BusStockSheet', {
        filterBy: [stringFilter('busID', busId)],
        sortBy: [{ fieldName: 'date', ascending: false }]
      });

      return records
        .filter(r => !r.serverErrorCode)
        .map(r => this._parseSheet(r));
    } catch (e) {
      console.warn('Error fetching sheets for bus:', e);
      return [];
    }
  }

  async fetchDefaults(tour, busId) {
    if (!tour || !busId) return null;

    try {
      const record = await lookupRecord(tour, `defaults-${busId}`);
      if (record && !record.serverErrorCode) {
        return this._parseDefaults(record);
      }
    } catch (e) {
      // Defaults may not exist
    }
    return null;
  }

  async saveSheet(tour, sheet) {
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
      fields
    };

    if (sheet.recordChangeTag) {
      record.recordChangeTag = sheet.recordChangeTag;
    }

    const saved = await saveRecord(tour, record);
    return this._parseSheet(saved);
  }

  isSheetLocked(sheet) {
    if (!sheet) return false;
    if (sheet.isLocked) return true;

    if (sheet.lockSchedule) {
      return this._isLockedBySchedule(sheet.lockSchedule, new Date(), sheet.date);
    }

    return false;
  }

  _isLockedBySchedule(schedule, now, sheetDate) {
    if (!schedule || !schedule.lockTime) return false;

    const sheetDay = new Date(sheetDate).getDay();
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

  groupByCategory(items) {
    const groups = new Map();
    for (const item of items) {
      const cat = item.category || 'Other';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(item);
    }
    for (const [, items] of groups) {
      items.sort((a, b) => (a.order || 0) - (b.order || 0));
    }
    return groups;
  }
}

export const busStockService = new BusStockService();
