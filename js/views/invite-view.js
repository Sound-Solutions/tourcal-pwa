// Invite View - Accept a tour invite via token
// Flow: look up TourInvite (public DB) -> accept CKShare -> find CrewMember (shared DB) -> claim it

import { authService } from '../services/auth.js';
import { tourService } from '../services/tour-service.js';
import { showToast } from '../components/toast.js';

function _esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export async function renderInviteView(params) {
  const content = document.getElementById('app-content');
  document.getElementById('app-nav').classList.add('hidden');
  document.getElementById('header-title').textContent = 'Join Tour';
  document.getElementById('header-actions').innerHTML = '';

  const token = params.token;
  if (!token) {
    _showError(content, 'Invalid invite link', 'No invite token was found in the URL.');
    return;
  }

  // Kick off identity resolution — don't block here since /users/caller can be slow,
  // but we MUST await it before the claim step to avoid writing '_pending_'.
  const identityPromise = authService.resolveIdentityNow();

  _showProgress(content, 'Looking up your invite...');

  try {
    // Step 1: Look up TourInvite from PUBLIC database
    const invite = await _lookupInvite(token);
    if (!invite) {
      _showError(content, 'Invite Not Found', 'This invite link is invalid or has expired.');
      return;
    }

    const tourName = invite.tourName || 'this tour';
    const roleName = invite.roleName || 'Crew';

    _showProgress(content, `Joining ${_esc(tourName)}...`);

    // Step 2: Accept the CKShare (grants access to the shared zone)
    if (invite.shareURL) {
      const accepted = await _acceptShare(invite.shareURL);
      if (!accepted) {
        console.warn('[InviteView] Share acceptance returned failure — proceeding anyway (zone may already be accepted)');
      }
    } else {
      console.warn('[InviteView] No shareURL in TourInvite — cannot accept share');
    }

    // Step 3: Find the CrewMember record in shared zones
    const crewMember = await _findCrewMember(token, invite.crewMemberRecordName);
    if (!crewMember) {
      _showError(
        content,
        'Could Not Join',
        'The crew member record for this invite could not be found. ' +
        'The shared zone may not have propagated yet — please wait a moment and try the link again.'
      );
      return;
    }

    // Step 4: Wait for identity resolution before checking/writing userRecordName
    await identityPromise;
    await _waitForUserIdentity();

    // Step 5: Check if already claimed
    const existingUser = crewMember.fields?.userRecordName?.value;
    if (existingUser && existingUser !== '_pending_') {
      if (existingUser === authService.userRecordName) {
        // Already claimed by this user - just redirect
        _showSuccess(content, tourName, roleName, true);
        await _refreshAndRedirect();
        return;
      }
      _showError(content, 'Invite Already Used', 'This invite has already been claimed by another user.');
      return;
    }

    // Step 6: Claim the CrewMember record (identity must be resolved)
    const myRecordName = authService.userRecordName;
    if (!myRecordName || myRecordName === '_pending_') {
      _showError(
        content,
        'Identity Not Resolved',
        'Could not determine your Apple ID. Please sign out, sign back in, and try the invite link again.'
      );
      return;
    }
    await _claimCrewMember(crewMember);

    // Step 7: Show success and redirect
    _showSuccess(content, tourName, roleName, false);
    showToast(`Joined ${tourName} as ${roleName}`, 'info');
    await _refreshAndRedirect();

  } catch (e) {
    console.error('[InviteView] Error:', e);
    if (e.message === 'Session expired') {
      _showError(content, 'Session Expired', 'Your session has expired. Please sign in again.');
      return;
    }
    _showError(content, 'Something Went Wrong', e.message || 'An unexpected error occurred. Please try again.');
  }
}

// --- UI Helpers ---

function _showProgress(container, message) {
  container.innerHTML = `
    <div class="loading-container">
      <div class="spinner"></div>
      <span class="loading-text">${_esc(message)}</span>
    </div>
  `;
}

function _showError(container, title, message) {
  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">&#9888;</div>
      <h2 class="empty-state-title">${_esc(title)}</h2>
      <p class="empty-state-text">${_esc(message)}</p>
      <button class="btn btn-primary" id="invite-go-tours" style="margin-top:16px">Go to Tours</button>
    </div>
  `;
  document.getElementById('invite-go-tours')?.addEventListener('click', () => {
    window.location.hash = '#/tours';
  });
}

function _showSuccess(container, tourName, roleName, alreadyJoined) {
  const heading = alreadyJoined
    ? `You're already in ${_esc(tourName)}`
    : `Welcome! You've joined ${_esc(tourName)} as ${_esc(roleName)}`;

  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon" style="opacity:1">&#9989;</div>
      <h2 class="empty-state-title">${heading}</h2>
      <p class="empty-state-text">Redirecting to your tours...</p>
      <div class="spinner" style="margin-top:16px"></div>
    </div>
  `;
}

// --- API Helpers ---

/**
 * Wait for authService.userRecordName to resolve from '_pending_' to a real value.
 * If still pending after initial wait, retries identity resolution once more.
 * Gives up after ~8 seconds total.
 */
async function _waitForUserIdentity() {
  if (authService.userRecordName && authService.userRecordName !== '_pending_') return;

  // First pass: wait for any in-flight resolution to complete
  let attempts = 0;
  while (authService.userRecordName === '_pending_' && attempts < 10) {
    attempts++;
    await new Promise(r => setTimeout(r, 500));
  }

  if (authService.userRecordName && authService.userRecordName !== '_pending_') return;

  // Still pending — try one more explicit resolution attempt
  console.log('[InviteView] Identity still pending after initial wait, retrying resolution...');
  await authService.resolveIdentityNow();

  // Final wait
  attempts = 0;
  while (authService.userRecordName === '_pending_' && attempts < 6) {
    attempts++;
    await new Promise(r => setTimeout(r, 500));
  }

  if (authService.userRecordName === '_pending_') {
    console.warn('[InviteView] Identity could not be resolved after all attempts');
  } else {
    console.log('[InviteView] Identity resolved:', authService.userRecordName);
  }
}

/**
 * Accept a CKShare via the CloudKit REST API.
 * Uses POST /public/records/accept with the shortGUID extracted from the share URL.
 * Returns true if accepted (or already accepted), false if the accept call failed.
 */
async function _acceptShare(shareURL) {
  // Extract shortGUID from the share URL
  // Format: https://www.icloud.com/share/0abCDeFgHiJ#TourCalZone
  let shortGUID;
  try {
    const url = new URL(shareURL);
    const pathParts = url.pathname.split('/').filter(Boolean);
    shortGUID = pathParts[pathParts.length - 1];
  } catch (e) {
    console.warn('[InviteView] Could not parse share URL:', shareURL, e);
    return false;
  }

  if (!shortGUID) {
    console.warn('[InviteView] No shortGUID found in share URL:', shareURL);
    return false;
  }

  console.log('[InviteView] Accepting share via REST API, shortGUID:', shortGUID);

  try {
    const res = await authService.apiFetch('/public/records/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shortGUIDs: [{ value: shortGUID }] })
    });
    const data = await res.json();
    console.log('[InviteView] Share acceptance response:', JSON.stringify(data).substring(0, 500));

    // Check for server errors in the response
    if (data.errors?.length > 0) {
      const err = data.errors[0];
      // ALREADY_SHARED = user already accepted this share — that's fine
      if (err.serverErrorCode === 'ALREADY_SHARED' || err.reason?.includes('already')) {
        console.log('[InviteView] Share already accepted (OK)');
      } else {
        console.warn('[InviteView] Share acceptance server error:', err.serverErrorCode, err.reason);
      }
    }

    // Give CloudKit time to propagate the zone access
    await new Promise(r => setTimeout(r, 2000));
    return true;
  } catch (e) {
    // Don't throw — user might already have access via publicPermission = .readWrite
    console.warn('[InviteView] Share acceptance error:', e.message || e);
    // Still wait a moment in case the zone was already accepted previously
    await new Promise(r => setTimeout(r, 1000));
    return false;
  }
}

/**
 * Query the PUBLIC database for a TourInvite record matching the given token.
 * Returns { tourName, roleName, shareURL } or null.
 */
async function _lookupInvite(token) {
  const body = {
    query: {
      recordType: 'TourInvite',
      filterBy: [{
        comparator: 'EQUALS',
        fieldName: 'inviteToken',
        fieldValue: { value: token, type: 'STRING' }
      }]
    }
  };

  const res = await authService.apiFetch('/public/records/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  console.log('[InviteView] TourInvite lookup:', JSON.stringify(data).substring(0, 500));

  if (!data.records || data.records.length === 0) {
    return null;
  }

  const record = data.records[0];
  if (record.serverErrorCode) {
    console.warn('[InviteView] Server error on invite record:', record.serverErrorCode);
    return null;
  }

  const f = record.fields || {};
  return {
    recordName: record.recordName,
    tourName: f.tourName?.value || null,
    roleName: f.roleName?.value || null,
    shareURL: f.shareURL?.value || null,
    crewMemberRecordName: f.crewMemberRecordName?.value || null,
    _record: record
  };
}

/**
 * Fetch a CrewMember record directly by its recordName from the shared zone.
 * This is more reliable than a query since it doesn't require the inviteToken
 * field to be indexed/queryable in the shared DB schema.
 */
async function _fetchCrewMemberByRecordName(recordName, zoneID) {
  try {
    const res = await authService.apiFetch('/shared/records/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        zoneID: { zoneName: zoneID.zoneName, ownerRecordName: zoneID.ownerRecordName },
        records: [{ recordName }]
      })
    });
    const data = await res.json();
    console.log('[InviteView] Direct lookup result:', JSON.stringify(data).substring(0, 500));
    if (data.records && data.records.length > 0) {
      const record = data.records[0];
      if (!record.serverErrorCode) {
        return record;
      }
      console.warn('[InviteView] Direct lookup error code:', record.serverErrorCode, record.reason);
    }
  } catch (e) {
    console.warn('[InviteView] Direct lookup error:', e);
  }
  return null;
}

/**
 * Search all shared zones for a CrewMember record with a matching inviteToken.
 * First tries a direct lookup by recordName (from the TourInvite's crewMemberRecordName field),
 * then falls back to a query by inviteToken field.
 * Retries up to 5 times (10s total) to allow time for zone propagation after share acceptance.
 * Returns the full record object or null.
 */
async function _findCrewMember(token, crewMemberRecordName) {
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) {
      console.log(`[InviteView] Retrying shared zone search (attempt ${attempt + 1}/5)...`);
      await new Promise(r => setTimeout(r, 2000));
    }

    // List all shared zones
    let zonesData;
    try {
      const zonesRes = await authService.apiFetch('/shared/zones/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      zonesData = await zonesRes.json();
    } catch (e) {
      console.warn('[InviteView] Error listing shared zones:', e);
      continue;
    }

    if (!zonesData.zones || zonesData.zones.length === 0) {
      console.warn(`[InviteView] No shared zones found (attempt ${attempt + 1}/5)`);
      continue;
    }

    console.log(`[InviteView] Found ${zonesData.zones.length} shared zone(s), searching for CrewMember...`);

    for (const zone of zonesData.zones) {
      const zid = zone.zoneID;

      // Strategy 1: Direct lookup by recordName (doesn't require field indexing)
      if (crewMemberRecordName) {
        const record = await _fetchCrewMemberByRecordName(crewMemberRecordName, zid);
        if (record) {
          // Ensure zoneID is set (REST API responses may omit it)
          if (!record.zoneID) record.zoneID = zid;
          console.log('[InviteView] Found CrewMember via direct lookup in zone:', zid.zoneName);
          return record;
        }
      }

      // Strategy 2: Query by inviteToken field
      try {
        const res = await authService.apiFetch('/shared/records/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            zoneID: { zoneName: zid.zoneName, ownerRecordName: zid.ownerRecordName },
            query: {
              recordType: 'CrewMember',
              filterBy: [{
                comparator: 'EQUALS',
                fieldName: 'inviteToken',
                fieldValue: { value: token, type: 'STRING' }
              }]
            }
          })
        });

        const data = await res.json();
        console.log('[InviteView] Query response:', JSON.stringify(data).substring(0, 300));
        if (data.records && data.records.length > 0) {
          const record = data.records[0];
          if (!record.serverErrorCode) {
            // Ensure zoneID is set (REST API responses may omit it)
            if (!record.zoneID) record.zoneID = zid;
            console.log('[InviteView] Found CrewMember via query in zone:', zid.zoneName);
            return record;
          }
          console.warn('[InviteView] Query record error:', record.serverErrorCode, record.reason);
        }
      } catch (e) {
        console.warn(`[InviteView] Error searching zone ${zid.zoneName}:`, e);
      }
    }
  }

  console.warn('[InviteView] CrewMember not found after all retries');
  return null;
}

/**
 * Claim a CrewMember record by writing the current user's identity.
 * Uses forceUpdate to avoid recordChangeTag conflicts.
 * Validates that userRecordName is a real identity (not '_pending_') before writing.
 */
async function _claimCrewMember(crewRecord) {
  const userRecordName = authService.userRecordName;
  if (!userRecordName || userRecordName === '_pending_') {
    throw new Error('Cannot claim invite: user identity not resolved');
  }

  console.log('[InviteView] Claiming CrewMember', crewRecord.recordName, 'as', userRecordName);
  const now = Date.now();

  const zid = crewRecord.zoneID;
  const body = {
    zoneID: { zoneName: zid.zoneName, ownerRecordName: zid.ownerRecordName },
    operations: [{
      operationType: 'forceUpdate',
      record: {
        recordName: crewRecord.recordName,
        recordType: 'CrewMember',
        recordChangeTag: crewRecord.recordChangeTag,
        fields: {
          userRecordName: { value: userRecordName },
          claimedAt: { value: now, type: 'TIMESTAMP' },
          updatedAt: { value: now, type: 'TIMESTAMP' }
        }
      }
    }]
  };

  const res = await authService.apiFetch('/shared/records/modify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  console.log('[InviteView] Claim result:', JSON.stringify(data).substring(0, 500));

  if (data.records && data.records[0]?.serverErrorCode) {
    throw new Error(`Failed to claim invite: ${data.records[0].serverErrorCode} — ${data.records[0].reason || ''}`);
  }

  return data;
}

/**
 * Refresh tours and redirect to the tour list.
 */
async function _refreshAndRedirect() {
  try {
    await tourService.fetchTours();
  } catch (e) {
    console.warn('[InviteView] Error refreshing tours:', e);
  }

  // Small delay so the user sees the success message
  await new Promise(r => setTimeout(r, 1500));
  window.location.hash = '#/tours';
}
