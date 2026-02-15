// DaySheet Service - Fetch/Save day sheets

import { tourService } from './tour-service.js';
import { cache } from './cache.js';

class DaySheetService {
  async fetchDaySheets(tour) {
    if (!tour) return [];

    const db = tourService.getDB(tour);
    const zone = tourService.getZoneID(tour);

    try {
      const response = await db.performQuery({
        recordType: 'DaySheet',
        filterBy: [{
          fieldName: 'tourID',
          comparator: 'EQUALS',
          fieldValue: { value: tourService.getTourRef(tour) }
        }],
        zoneID: zone
      });

      const sheets = (response.records || []).map(r => this._parseDaySheet(r));
      await cache.put(cache.tourKey(tour.recordName, 'daysheets'), sheets);
      return sheets;
    } catch (e) {
      console.warn('Error fetching day sheets:', e);
      const cached = await cache.get(cache.tourKey(tour.recordName, 'daysheets'), true);
      return cached || [];
    }
  }

  async fetchDaySheet(tour, eventKey) {
    if (!tour || !eventKey) return null;

    const db = tourService.getDB(tour);
    const zone = tourService.getZoneID(tour);
    const recordName = `daySheet-${eventKey}`;

    try {
      const response = await db.fetchRecords([{
        recordName,
        zoneID: zone
      }]);

      if (response.records && response.records.length > 0) {
        return this._parseDaySheet(response.records[0]);
      }
    } catch (e) {
      // Record may not exist yet
    }
    return null;
  }

  async saveDaySheet(tour, daysheet) {
    const db = tourService.getDB(tour);
    const zone = tourService.getZoneID(tour);

    const fields = {
      tourID: { value: tourService.getTourRef(tour) },
      eventKey: { value: daysheet.eventKey },
      notes: { value: daysheet.notes || '' },
      lastUpdated: { value: Date.now() }
    };

    // Time fields
    const timeFields = ['busCall', 'busCallEnd', 'loadIn', 'loadInEnd',
      'soundcheck', 'soundcheckEnd', 'doors', 'doorsEnd',
      'showTime', 'showTimeEnd', 'curfew', 'curfewEnd'];

    for (const field of timeFields) {
      if (daysheet[field]) {
        fields[field] = { value: daysheet[field].getTime() };
      }
    }

    // Custom items as JSON
    if (daysheet.customItems) {
      fields.customItems = { value: JSON.stringify(daysheet.customItems) };
    }

    const record = {
      recordType: 'DaySheet',
      recordName: `daySheet-${daysheet.eventKey}`,
      fields,
      zoneID: zone
    };

    if (daysheet.recordChangeTag) {
      record.recordChangeTag = daysheet.recordChangeTag;
    }

    const response = await db.saveRecords([record]);
    if (response.records && response.records.length > 0) {
      return this._parseDaySheet(response.records[0]);
    }
    throw new Error('Failed to save day sheet');
  }

  _parseDaySheet(record) {
    const f = record.fields || {};

    const parseDate = (field) => {
      const v = f[field]?.value;
      return v ? new Date(v) : null;
    };

    let customItems = [];
    if (f.customItems?.value) {
      try {
        customItems = JSON.parse(f.customItems.value);
      } catch (e) {
        console.warn('Failed to parse customItems:', e);
      }
    }

    return {
      recordName: record.recordName,
      recordChangeTag: record.recordChangeTag,
      eventKey: f.eventKey?.value || '',
      busCall: parseDate('busCall'),
      busCallEnd: parseDate('busCallEnd'),
      loadIn: parseDate('loadIn'),
      loadInEnd: parseDate('loadInEnd'),
      soundcheck: parseDate('soundcheck'),
      soundcheckEnd: parseDate('soundcheckEnd'),
      doors: parseDate('doors'),
      doorsEnd: parseDate('doorsEnd'),
      showTime: parseDate('showTime'),
      showTimeEnd: parseDate('showTimeEnd'),
      curfew: parseDate('curfew'),
      curfewEnd: parseDate('curfewEnd'),
      notes: f.notes?.value || '',
      lastUpdated: parseDate('lastUpdated'),
      customItems
    };
  }

  // Get standard schedule items from a daysheet
  getScheduleItems(daysheet) {
    if (!daysheet) return [];

    const items = [];
    const add = (label, start, end) => {
      if (start) items.push({ label, startTime: start, endTime: end || null });
    };

    add('Bus Call', daysheet.busCall, daysheet.busCallEnd);
    add('Load In', daysheet.loadIn, daysheet.loadInEnd);
    add('Soundcheck', daysheet.soundcheck, daysheet.soundcheckEnd);
    add('Doors', daysheet.doors, daysheet.doorsEnd);
    add('Show Time', daysheet.showTime, daysheet.showTimeEnd);
    add('Curfew', daysheet.curfew, daysheet.curfewEnd);

    // Add custom items
    if (daysheet.customItems) {
      for (const item of daysheet.customItems) {
        if (item.isEnabled !== false) {
          add(
            item.label,
            item.startTime ? new Date(item.startTime) : null,
            item.endTime ? new Date(item.endTime) : null
          );
        }
      }
    }

    // Sort by start time
    items.sort((a, b) => {
      if (!a.startTime) return 1;
      if (!b.startTime) return -1;
      return a.startTime - b.startTime;
    });

    return items;
  }
}

export const daySheetService = new DaySheetService();
