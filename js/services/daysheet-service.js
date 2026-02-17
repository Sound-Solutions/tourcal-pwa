// DaySheet Service - Fetch/Save day sheets (REST API)

import { tourService } from './tour-service.js';
import { cache } from './cache.js';
import { queryRecords, lookupRecord, saveRecord, tourFilter } from './cloudkit-api.js';

class DaySheetService {
  async fetchDaySheets(tour) {
    if (!tour) return [];

    try {
      const records = await queryRecords(tour, 'DaySheet', {
        filterBy: [tourFilter(tour)]
      });

      const sheets = records
        .filter(r => !r.serverErrorCode)
        .map(r => this._parseDaySheet(r));
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

    try {
      const record = await lookupRecord(tour, `daySheet-${eventKey}`);
      if (record && !record.serverErrorCode) {
        return this._parseDaySheet(record);
      }
    } catch (e) {
      // Record may not exist yet
    }
    return null;
  }

  async saveDaySheet(tour, daysheet) {
    const fields = {
      tourID: { value: { recordName: tour.recordName, action: 'DELETE_SELF' } },
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
      fields
    };

    if (daysheet.recordChangeTag) {
      record.recordChangeTag = daysheet.recordChangeTag;
    }

    const saved = await saveRecord(tour, record);
    return this._parseDaySheet(saved);
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

    items.sort((a, b) => {
      if (!a.startTime) return 1;
      if (!b.startTime) return -1;
      return a.startTime - b.startTime;
    });

    return items;
  }
}

export const daySheetService = new DaySheetService();
