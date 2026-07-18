// CloudKit Configuration
// API tokens are per-environment, created in CloudKit Console > Tokens & Keys
// (Container: iCloud.com.soundsolutionsllc.tourcal, token name: TourCal-PWA).
// The live site must use production — that's where TestFlight/App Store builds
// read and write. localhost stays on development for local testing.

const IS_LIVE = location.hostname === 'sound-solutions.github.io';

export const CK_CONFIG = {
  containerIdentifier: 'iCloud.com.soundsolutionsllc.tourcal',
  apiTokenAuth: {
    apiToken: IS_LIVE
      ? '7c8ebec430a26ae64d3bbbfd534d5e7c8f443344474c67dee780b5bbbe9d2954'
      : 'ca655afb03eea6e5beb7d3745f54160e39c57925cb82b7c45ee6cd9b71e8bd1e',
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
  environment: IS_LIVE ? 'production' : 'development'
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
