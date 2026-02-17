// Crew Service - CrewMember + Department (REST API)

import { tourService } from './tour-service.js';
import { cache } from './cache.js';
import { queryRecords, tourFilter } from './cloudkit-api.js';

class CrewService {
  async fetchCrew(tour) {
    if (!tour) return { members: [], departments: [] };

    try {
      const [memberRecords, deptRecords] = await Promise.all([
        queryRecords(tour, 'CrewMember', {
          filterBy: [tourFilter(tour)],
          sortBy: [{ fieldName: 'order', ascending: true }]
        }),
        queryRecords(tour, 'Department', {
          filterBy: [tourFilter(tour)],
          sortBy: [{ fieldName: 'order', ascending: true }]
        })
      ]);

      const members = memberRecords
        .filter(r => !r.serverErrorCode)
        .map(r => this._parseMember(r));
      const departments = deptRecords
        .filter(r => !r.serverErrorCode)
        .map(r => this._parseDepartment(r));

      const result = { members, departments };
      await cache.put(cache.tourKey(tour.recordName, 'crew'), result);
      return result;
    } catch (e) {
      console.warn('Error fetching crew:', e);
      const cached = await cache.get(cache.tourKey(tour.recordName, 'crew'), true);
      return cached || { members: [], departments: [] };
    }
  }

  _parseMember(record) {
    const f = record.fields || {};
    return {
      recordName: record.recordName,
      recordChangeTag: record.recordChangeTag,
      tourID: f.tourID?.value?.recordName || f.tourID?.value || '',
      name: f.name?.value || '',
      email: f.email?.value || '',
      phone: f.phone?.value || '',
      departmentID: f.departmentID?.value || '',
      assignedBusID: f.assignedBusID?.value || '',
      role: f.role?.value || '',
      order: f.order?.value || 0
    };
  }

  _parseDepartment(record) {
    const f = record.fields || {};
    return {
      recordName: record.recordName,
      recordChangeTag: record.recordChangeTag,
      tourID: f.tourID?.value?.recordName || f.tourID?.value || '',
      name: f.name?.value || '',
      colorHex: f.colorHex?.value || '#8E8E93',
      order: f.order?.value || 0
    };
  }

  groupByDepartment(members, departments) {
    const deptMap = new Map();
    for (const dept of departments) {
      deptMap.set(dept.recordName, dept);
    }

    const groups = new Map();
    const ungrouped = [];

    for (const member of members) {
      if (member.departmentID && deptMap.has(member.departmentID)) {
        const dept = deptMap.get(member.departmentID);
        if (!groups.has(dept.recordName)) {
          groups.set(dept.recordName, { department: dept, members: [] });
        }
        groups.get(dept.recordName).members.push(member);
      } else {
        ungrouped.push(member);
      }
    }

    const sorted = [...groups.values()].sort(
      (a, b) => (a.department.order || 0) - (b.department.order || 0)
    );

    if (ungrouped.length > 0) {
      sorted.push({
        department: { name: 'Other', colorHex: '#8E8E93', order: 999 },
        members: ungrouped
      });
    }

    return sorted;
  }
}

export const crewService = new CrewService();
