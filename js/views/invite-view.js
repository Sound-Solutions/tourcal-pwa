// Invite View - Accept a tour invite via token
// Flow: look up TourInvite (public DB) -> find CrewMember (shared DB) -> claim it

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

  // Ensure we have a resolved userRecordName (not '_pending_')
  await _waitForUserIdentity();
  if (!authService.userRecordName || authService.userRecordName === '_pending_') {
    _showError(content, 'Authentication Error', 'Could not verify your identity. Please sign out and sign in again.');
    return;
  }

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

    // Step 2: Find the CrewMember record in shared zones
    const crewMember = await _findCrewMember(token);
    if (!crewMember) {
      _showError(
        content,
        'Could Not Join',
        'The crew member record for this invite could not be found. ' +
        'Make sure the tour owner has shared the tour with you first, then try again.'
      );
      return;
    }

    // Step 3: Check if already claimed
    const existingUser = crewMember.fields?.userRecordName?.value;
    if (existingUser) {
      if (existingUser === authService.userRecordName) {
        // Already claimed by this user - just redirect
        _showSuccess(content, tourName, roleName, true);
        await _refreshAndRedirect();
        return;
      }
      _showError(content, 'Invite Already Used', 'This invite has already been claimed by another user.');
      return;
    }

    // Step 4: Claim the CrewMember record
    await _claimCrewMember(crewMember);

    // Step 5: Show success and redirect
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
 * Retries up to 10 times (500ms apart).
 */
async function _waitForUserIdentity() {
  let attempts = 0;
  while (authService.userRecordName === '_pending_' && attempts < 10) {
    attempts++;
    console.log(`[InviteView] Waiting for user identity... (attempt ${attempts})`);
    await new Promise(r => setTimeout(r, 500));
  }
  if (authService.userRecordName === '_pending_') {
    console.warn('[InviteView] User identity still pending after retries');
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
    _record: record
  };
}

/**
 * Search all shared zones for a CrewMember record with a matching inviteToken.
 * Returns the full record object or null.
 */
async function _findCrewMember(token) {
  // List all shared zones
  const zonesRes = await authService.apiFetch('/shared/zones/list', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });

  const zonesData = await zonesRes.json();
  if (!zonesData.zones || zonesData.zones.length === 0) {
    console.warn('[InviteView] No shared zones found');
    return null;
  }

  // Search each zone for a CrewMember with this inviteToken
  for (const zone of zonesData.zones) {
    const zid = zone.zoneID;
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
      if (data.records && data.records.length > 0) {
        const record = data.records[0];
        if (!record.serverErrorCode) {
          console.log('[InviteView] Found CrewMember in zone:', zid.zoneName);
          return record;
        }
      }
    } catch (e) {
      console.warn(`[InviteView] Error searching zone ${zid.zoneName}:`, e);
    }
  }

  return null;
}

/**
 * Claim a CrewMember record by writing the current user's identity.
 * Uses forceUpdate to avoid recordChangeTag conflicts.
 */
async function _claimCrewMember(crewRecord) {
  const userRecordName = authService.userRecordName;
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
    throw new Error(`Failed to claim invite: ${data.records[0].serverErrorCode}`);
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
