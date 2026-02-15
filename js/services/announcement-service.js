// Announcement Service - TourAnnouncement fetch

import { tourService } from './tour-service.js';
import { cache } from './cache.js';

class AnnouncementService {
  async fetchAnnouncements(tour) {
    if (!tour) return [];

    const db = tourService.getDB(tour);
    const zone = tourService.getZoneID(tour);

    try {
      const response = await db.performQuery({
        recordType: 'TourAnnouncement',
        filterBy: [{
          fieldName: 'tourReference',
          comparator: 'EQUALS',
          fieldValue: { value: tourService.getTourRef(tour) }
        }],
        sortBy: [{ fieldName: 'createdAt', ascending: false }],
        zoneID: zone
      });

      const announcements = (response.records || []).map(r => this._parseAnnouncement(r));
      await cache.put(cache.tourKey(tour.recordName, 'announcements'), announcements);
      return announcements;
    } catch (e) {
      console.warn('Error fetching announcements:', e);
      const cached = await cache.get(cache.tourKey(tour.recordName, 'announcements'), true);
      return cached || [];
    }
  }

  _parseAnnouncement(record) {
    const f = record.fields || {};

    let targetRoles = [];
    if (f.targetRoles?.value) {
      targetRoles = Array.isArray(f.targetRoles.value)
        ? f.targetRoles.value
        : [f.targetRoles.value];
    }

    return {
      recordName: record.recordName,
      id: f.id?.value || record.recordName,
      senderID: f.senderID?.value || '',
      senderName: f.senderName?.value || '',
      title: f.title?.value || '',
      body: f.body?.value || '',
      urgency: f.urgency?.value || 'info',
      targetRoles,
      relatedEventID: f.relatedEventID?.value || '',
      createdAt: f.createdAt?.value ? new Date(f.createdAt.value) : null
    };
  }

  // Filter announcements visible to a role
  filterForRole(announcements, role) {
    return announcements.filter(a => {
      if (!a.targetRoles || a.targetRoles.length === 0) return true;
      return a.targetRoles.includes(role);
    });
  }
}

export const announcementService = new AnnouncementService();
