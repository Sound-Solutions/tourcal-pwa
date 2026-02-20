// Role Permission Matrix - mirrors RolePermission.swift

const PERMISSIONS = {
  Owner: {
    canEditEvents: true,
    canEditDaySheets: true,
    canEditSetlists: true,
    canEditBusStock: true,
    canEditVenueNotes: true,
    canEditCrew: true,
    canShareTour: true,
    canViewVenueNotes: true,
    canViewTourSheets: true,
    canPostAnnouncements: true,
    canLockBusStock: true,
    canPurchaseBusStock: true,
    viewTodayOnly: false
  },
  Admin: {
    canEditEvents: true,
    canEditDaySheets: true,
    canEditSetlists: true,
    canEditBusStock: true,
    canEditVenueNotes: true,
    canEditCrew: true,
    canShareTour: true,
    canViewVenueNotes: true,
    canViewTourSheets: true,
    canPostAnnouncements: true,
    canLockBusStock: true,
    canPurchaseBusStock: true,
    viewTodayOnly: false
  },
  'Crew Chief': {
    canEditEvents: false,
    canEditDaySheets: false,
    canEditSetlists: false,
    canEditBusStock: true,
    canEditVenueNotes: false,
    canEditCrew: false,
    canShareTour: false,
    canViewVenueNotes: true,
    canViewTourSheets: true,
    canPostAnnouncements: true,
    canLockBusStock: false,
    canPurchaseBusStock: false,
    viewTodayOnly: false
  },
  Crew: {
    canEditEvents: false,
    canEditDaySheets: false,
    canEditSetlists: false,
    canEditBusStock: true, // Only unlocked sheets
    canEditVenueNotes: false,
    canEditCrew: false,
    canShareTour: false,
    canViewVenueNotes: true,
    canViewTourSheets: true,
    canPostAnnouncements: false,
    canLockBusStock: false,
    canPurchaseBusStock: false,
    viewTodayOnly: false
  },
  Artist: {
    canEditEvents: false,
    canEditDaySheets: false,
    canEditSetlists: false,
    canEditBusStock: false,
    canEditVenueNotes: false,
    canEditCrew: false,
    canShareTour: false,
    canViewVenueNotes: false,
    canViewTourSheets: false,
    canPostAnnouncements: false,
    canLockBusStock: false,
    canPurchaseBusStock: false,
    viewTodayOnly: false
  },
  Runner: {
    canEditEvents: false,
    canEditDaySheets: false,
    canEditSetlists: false,
    canEditBusStock: false,
    canEditVenueNotes: false,
    canEditCrew: false,
    canShareTour: false,
    canViewVenueNotes: false,
    canViewTourSheets: true,
    canPostAnnouncements: false,
    canLockBusStock: false,
    canPurchaseBusStock: true,
    viewTodayOnly: true
  }
};

export function getPermissions(role) {
  return PERMISSIONS[role] || PERMISSIONS.Crew;
}

export function resolvePermissions(role, permissionOverrides) {
  const defaults = { ...getPermissions(role) };
  if (permissionOverrides && typeof permissionOverrides === 'object') {
    for (const [key, value] of Object.entries(permissionOverrides)) {
      if (key in defaults && typeof value === 'boolean') {
        defaults[key] = value;
      }
    }
  }
  return defaults;
}

export function canEdit(role, type, permissionOverrides) {
  const perms = resolvePermissions(role, permissionOverrides);
  switch (type) {
    case 'events': return perms.canEditEvents;
    case 'daysheets': return perms.canEditDaySheets;
    case 'setlists': return perms.canEditSetlists;
    case 'busstock': return perms.canEditBusStock;
    case 'venue': return perms.canEditVenueNotes;
    case 'crew': return perms.canEditCrew;
    default: return false;
  }
}

export function canView(role, type, permissionOverrides) {
  const perms = resolvePermissions(role, permissionOverrides);
  switch (type) {
    case 'venue': return perms.canViewVenueNotes;
    case 'toursheets': return perms.canViewTourSheets;
    default: return true;
  }
}

// Check if crew can edit bus stock (must check lock status separately)
export function canEditBusStock(role, sheetLocked, permissionOverrides) {
  const perms = resolvePermissions(role, permissionOverrides);
  if (!perms.canEditBusStock) return false;
  if (role === 'Owner' || role === 'Admin') return true;
  return !sheetLocked;
}

export function canPostAnnouncements(role, permissionOverrides) {
  return resolvePermissions(role, permissionOverrides).canPostAnnouncements;
}

export function canLockBusStock(role, permissionOverrides) {
  return resolvePermissions(role, permissionOverrides).canLockBusStock;
}

export function canPurchaseBusStock(role, permissionOverrides) {
  return resolvePermissions(role, permissionOverrides).canPurchaseBusStock;
}

export function hasViewTodayOnly(role, permissionOverrides) {
  return resolvePermissions(role, permissionOverrides).viewTodayOnly;
}

export function isOwnerOrAdmin(role) {
  return role === 'Owner' || role === 'Admin';
}
