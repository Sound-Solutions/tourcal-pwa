// CloudKit REST API helper - replaces CloudKit JS database methods
// All services should use this instead of CloudKit JS db.performQuery/fetchRecords/saveRecords

import { authService } from './auth.js';
import { tourService } from './tour-service.js';

/**
 * Query records by type with optional filters
 * Replaces: db.performQuery({ recordType, filterBy, sortBy, zoneID })
 */
export async function queryRecords(tour, recordType, { filterBy = [], sortBy = [] } = {}) {
  const db = tourService.getDB(tour);   // 'private' or 'shared'
  const zone = tourService.getZoneID(tour);

  const body = {
    zoneID: zone,
    query: { recordType }
  };

  if (filterBy.length > 0) body.query.filterBy = filterBy;
  if (sortBy.length > 0) body.query.sortBy = sortBy;

  const res = await authService.apiFetch(`/${db}/records/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  return data.records || [];
}

/**
 * Build a tourID reference filter for queries
 * Replaces: { fieldName: 'tourID', comparator: 'EQUALS', fieldValue: { value: tourRef } }
 */
export function tourFilter(tour) {
  return {
    comparator: 'EQUALS',
    fieldName: 'tourID',
    fieldValue: {
      value: {
        recordName: tour.recordName,
        action: 'NONE'
      }
    }
  };
}

/**
 * Build a reference filter for any field
 */
export function refFilter(fieldName, recordName) {
  return {
    comparator: 'EQUALS',
    fieldName,
    fieldValue: {
      value: {
        recordName,
        action: 'NONE'
      }
    }
  };
}

/**
 * Build a string field filter
 */
export function stringFilter(fieldName, value) {
  return {
    comparator: 'EQUALS',
    fieldName,
    fieldValue: { value }
  };
}

/**
 * Fetch records by their recordNames
 * Replaces: db.fetchRecords([{ recordName, zoneID }])
 */
export async function lookupRecords(tour, recordNames) {
  const db = tourService.getDB(tour);
  const zone = tourService.getZoneID(tour);

  const body = {
    zoneID: zone,
    records: recordNames.map(rn => ({ recordName: rn }))
  };

  const res = await authService.apiFetch(`/${db}/records/lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  return data.records || [];
}

/**
 * Fetch a single record by name
 */
export async function lookupRecord(tour, recordName) {
  const records = await lookupRecords(tour, [recordName]);
  return records.length > 0 ? records[0] : null;
}

/**
 * Save (create or update) records
 * Replaces: db.saveRecords([record])
 */
export async function saveRecord(tour, record) {
  const db = tourService.getDB(tour);
  const zone = tourService.getZoneID(tour);

  // Determine operation type
  const operationType = record.recordChangeTag ? 'update' : 'create';

  const op = {
    operationType,
    record: {
      recordType: record.recordType,
      fields: record.fields,
    }
  };

  if (record.recordName) {
    op.record.recordName = record.recordName;
  }
  if (record.recordChangeTag) {
    op.record.recordChangeTag = record.recordChangeTag;
  }

  const body = {
    zoneID: zone,
    operations: [op]
  };

  const res = await authService.apiFetch(`/${db}/records/modify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await res.json();

  // Handle server record changed (conflict) - retry with forceUpdate
  if (data.records?.[0]?.serverErrorCode === 'CONFLICT') {
    console.warn('[CloudKitAPI] Conflict on save, retrying with forceUpdate');
    op.operationType = 'forceUpdate';
    // Get the server record's change tag
    const serverTag = data.records[0]?.serverRecord?.recordChangeTag;
    if (serverTag) {
      op.record.recordChangeTag = serverTag;
    }
    const retryRes = await authService.apiFetch(`/${db}/records/modify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const retryData = await retryRes.json();
    if (retryData.records?.length > 0 && !retryData.records[0].serverErrorCode) {
      return retryData.records[0];
    }
    throw new Error(`Save failed: ${retryData.records?.[0]?.serverErrorCode || 'unknown'}`);
  }

  if (data.records?.length > 0 && !data.records[0].serverErrorCode) {
    return data.records[0];
  }

  throw new Error(`Save failed: ${data.records?.[0]?.serverErrorCode || JSON.stringify(data)}`);
}

/**
 * Delete a record by name
 */
export async function deleteRecord(tour, recordName, recordChangeTag) {
  const db = tourService.getDB(tour);
  const zone = tourService.getZoneID(tour);

  const op = {
    operationType: 'delete',
    record: { recordName }
  };
  if (recordChangeTag) {
    op.record.recordChangeTag = recordChangeTag;
  }

  const body = {
    zoneID: zone,
    operations: [op]
  };

  const res = await authService.apiFetch(`/${db}/records/modify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  if (data.records?.[0]?.serverErrorCode) {
    throw new Error(`Delete failed: ${data.records[0].serverErrorCode}`);
  }
}
