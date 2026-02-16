// CloudKit Configuration
// API token must be created in CloudKit Dashboard:
// Container: iCloud.com.soundsolutionsllc.tourcal
// Token name: TourCal-PWA

export const CK_CONFIG = {
  containerIdentifier: 'iCloud.com.soundsolutionsllc.tourcal',
  apiTokenAuth: {
    apiToken: 'ca655afb03eea6e5beb7d3745f54160e39c57925cb82b7c45ee6cd9b71e8bd1e',
    persist: true,
    signInButton: {
      id: 'apple-sign-in-button',
      theme: 'dark'
    },
    signOutButton: {
      id: 'apple-sign-out-button',
      theme: 'dark'
    }
  },
  environment: 'development'
};

export const ZONE_NAME = 'TourCalZone';

export function getContainer() {
  return CloudKit.getDefaultContainer();
}

export function getPrivateDB() {
  return getContainer().privateCloudDatabase;
}

export function getSharedDB() {
  return getContainer().sharedCloudDatabase;
}

export function getPublicDB() {
  return getContainer().publicCloudDatabase;
}

export function zoneID(zoneName = ZONE_NAME, ownerRecordName) {
  const z = { zoneName };
  if (ownerRecordName) z.ownerRecordName = ownerRecordName;
  return z;
}

export function recordReference(recordName, zoneID, action = 'DELETE_SELF') {
  return {
    recordName,
    zoneID,
    action
  };
}
