// Bus Stock Service - Buses, persistent sheets, defaults, receipts (REST API)

import { tourService } from './tour-service.js';
import { cache } from './cache.js';
import { queryRecords, lookupRecord, saveRecord, tourFilter, stringFilter } from './cloudkit-api.js';

class BusStockService {
  async fetchBuses(tour) {
    if (!tour) return [];

    try {
      // Bus records store tourID as a plain string, not a reference
      const records = await queryRecords(tour, 'Bus', {
        filterBy: [stringFilter('tourID', tour.recordName)],
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

  async fetchSheet(tour, busId) {
    if (!tour || !busId) return null;

    const recordName = `bus-${busId}`;

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
    const fields = {
      busID: { value: sheet.busID },
      tourID: { value: sheet.tourID || tour.recordName },
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
      recordName: `bus-${sheet.busID}`,
      fields
    };

    if (sheet.recordChangeTag) {
      record.recordChangeTag = sheet.recordChangeTag;
    }

    const saved = await saveRecord(tour, record);
    return this._parseSheet(saved);
  }

  async saveDefaults(tour, busId, items) {
    const recordName = `defaults-${busId}`;

    // Try to fetch existing defaults to get recordChangeTag
    let existingTag = null;
    try {
      const existing = await lookupRecord(tour, recordName);
      if (existing && !existing.serverErrorCode) {
        existingTag = existing.recordChangeTag;
      }
    } catch (e) { /* new defaults */ }

    const fields = {
      busID: { value: busId },
      tourID: { value: tour.recordName },
      lastUpdated: { value: Date.now() },
      itemsJSON: { value: JSON.stringify(items) }
    };

    const record = {
      recordType: 'BusStockDefaults',
      recordName,
      fields
    };

    if (existingTag) {
      record.recordChangeTag = existingTag;
    }

    const saved = await saveRecord(tour, record);
    return this._parseDefaults(saved);
  }

  // --- Receipt Methods ---

  async fetchReceipts(tour, busId) {
    if (!tour || !busId) return [];

    try {
      const records = await queryRecords(tour, 'BusStockReceipt', {
        filterBy: [stringFilter('busID', busId)],
        sortBy: [{ fieldName: 'purchasedAt', ascending: false }]
      });

      return records
        .filter(r => !r.serverErrorCode)
        .map(r => this._parseReceipt(r));
    } catch (e) {
      console.warn('Error fetching receipts:', e);
      return [];
    }
  }

  async fetchReceiptsForDate(tour, busId, date) {
    if (!tour || !busId || !date) return [];

    const recordName = `receipt-${busId}-${this._formatDate(date)}`;

    try {
      const record = await lookupRecord(tour, recordName);
      if (record && !record.serverErrorCode) {
        return [this._parseReceipt(record)];
      }
    } catch (e) {
      // Receipt may not exist
    }
    return [];
  }

  async fetchAllReceiptsForDate(tour, buses, date) {
    if (!tour || !buses?.length || !date) return [];

    const dateStr = this._formatDate(date);
    const promises = buses.map(bus => {
      const recordName = `receipt-${bus.id}-${dateStr}`;
      return lookupRecord(tour, recordName)
        .then(record => {
          if (record && !record.serverErrorCode) {
            return { bus, receipt: this._parseReceipt(record) };
          }
          return null;
        })
        .catch(() => null);
    });

    const results = await Promise.all(promises);
    return results.filter(Boolean);
  }

  async saveReceipt(tour, receipt) {
    const dateStr = this._formatDate(new Date(receipt.date));

    const fields = {
      busID: { value: receipt.busID },
      tourID: { value: receipt.tourID || tour.recordName },
      date: { value: new Date(receipt.date).getTime() },
      purchasedBy: { value: receipt.purchasedBy || '' },
      purchasedAt: { value: new Date(receipt.purchasedAt || Date.now()).getTime() },
      notes: { value: receipt.notes || '' },
      itemsJSON: { value: JSON.stringify(receipt.items || []) }
    };

    const record = {
      recordType: 'BusStockReceipt',
      recordName: `receipt-${receipt.busID}-${dateStr}`,
      fields
    };

    if (receipt.recordChangeTag) {
      record.recordChangeTag = receipt.recordChangeTag;
    }

    const saved = await saveRecord(tour, record);
    return this._parseReceipt(saved);
  }

  async purchaseItem(tour, bus, sheet, item, userRecordName) {
    const dateStr = this._formatDate(new Date());
    const receiptKey = `receipt-${bus.id}-${dateStr}`;

    // Get or create today's receipt for this bus
    let receipt = null;
    try {
      const existing = await lookupRecord(tour, receiptKey);
      if (existing && !existing.serverErrorCode) {
        receipt = this._parseReceipt(existing);
      }
    } catch (e) { /* no existing receipt */ }

    if (!receipt) {
      receipt = {
        busID: bus.id,
        tourID: tour.recordName,
        date: new Date(),
        items: [],
        purchasedBy: userRecordName || null,
        purchasedAt: new Date(),
        notes: ''
      };
    }

    // Append item snapshot to receipt
    receipt.items.push({ ...item });
    receipt.purchasedAt = new Date();
    const savedReceipt = await this.saveReceipt(tour, receipt);

    // Clone sheet items before mutating (don't corrupt _state.sheet on failure)
    const updatedItems = sheet.items.map(i => ({ ...i }));
    if (item.isFromDefaults) {
      const idx = updatedItems.findIndex(i => i.id === item.id);
      if (idx >= 0) updatedItems[idx].isChecked = false;
    } else {
      const filtered = updatedItems.filter(i => i.id !== item.id);
      updatedItems.length = 0;
      updatedItems.push(...filtered);
    }

    const sheetCopy = { ...sheet, items: updatedItems };
    const savedSheet = await this.saveSheet(tour, sheetCopy);

    return { receipt: savedReceipt, sheet: savedSheet };
  }

  isSheetLocked(sheet) {
    if (!sheet) return false;
    if (sheet.isLocked) return true;

    if (sheet.lockSchedule) {
      return this._isLockedBySchedule(sheet.lockSchedule, new Date());
    }

    return false;
  }

  _isLockedBySchedule(schedule, now) {
    if (!schedule || !schedule.lockTime) return false;

    const todayDay = now.getDay();
    if (schedule.daysToLock && !schedule.daysToLock.includes(todayDay)) {
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
      items,
      notes: f.notes?.value || '',
      isLocked: (f.isLocked?.value || 0) === 1,
      lockedAt: f.lockedAt?.value ? new Date(f.lockedAt.value) : null,
      lockedBy: f.lockedBy?.value || '',
      lockSchedule,
      lastUpdated: f.lastUpdated?.value ? new Date(f.lastUpdated.value) : null
    };
  }

  _parseReceipt(record) {
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
      date: f.date?.value ? new Date(f.date.value) : null,
      items,
      purchasedBy: f.purchasedBy?.value || '',
      purchasedAt: f.purchasedAt?.value ? new Date(f.purchasedAt.value) : null,
      notes: f.notes?.value || ''
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
