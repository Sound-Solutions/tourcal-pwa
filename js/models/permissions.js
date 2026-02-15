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
    canViewTourSheets: true
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
    canViewTourSheets: true
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
    canViewTourSheets: true
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
    canViewTourSheets: true
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
    canViewTourSheets: false
  }
};

export function getPermissions(role) {
  return PERMISSIONS[role] || PERMISSIONS.Crew;
}

export function canEdit(role, type) {
  const perms = getPermissions(role);
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

export function canView(role, type) {
  const perms = getPermissions(role);
  switch (type) {
    case 'venue': return perms.canViewVenueNotes;
    case 'toursheets': return perms.canViewTourSheets;
    default: return true;
  }
}

// Check if crew can edit bus stock (must check lock status separately)
export function canEditBusStock(role, sheetLocked) {
  if (role === 'Owner' || role === 'Admin') return true;
  if (role === 'Crew Chief' || role === 'Crew') return !sheetLocked;
  return false;
}

export function isOwnerOrAdmin(role) {
  return role === 'Owner' || role === 'Admin';
}
