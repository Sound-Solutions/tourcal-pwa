// Crew View - Crew directory by department

import { tourService } from '../services/tour-service.js';
import { crewService } from '../services/crew-service.js';
import { getInitials } from '../models/formatters.js';

export async function renderCrewView() {
  const content = document.getElementById('app-content');
  const tour = tourService.activeTour;

  if (!tour) {
    window.location.hash = '#/tours';
    return;
  }

  content.innerHTML = `
    <div class="loading-container">
      <div class="spinner"></div>
      <span class="loading-text">Loading crew...</span>
    </div>
  `;

  try {
    const { members, departments } = await crewService.fetchCrew(tour);

    if (members.length === 0) {
      content.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">&#128101;</div>
          <h2 class="empty-state-title">No Crew</h2>
          <p class="empty-state-text">No crew members have been added to this tour yet.</p>
        </div>
      `;
      return;
    }

    const groups = crewService.groupByDepartment(members, departments);
    _render(content, groups);
  } catch (e) {
    content.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">&#9888;</div>
        <h2 class="empty-state-title">Error</h2>
        <p class="empty-state-text">${e.message}</p>
      </div>
    `;
  }
}

function _render(container, groups) {
  let html = '<div class="crew-view">';

  for (const group of groups) {
    const dept = group.department;

    html += `
      <div class="crew-department-header">
        <div class="crew-department-dot" style="background: ${dept.colorHex}"></div>
        <span class="crew-department-name">${_esc(dept.name)}</span>
      </div>
    `;

    html += '<div class="card">';

    for (const member of group.members) {
      html += `
        <div class="crew-member">
          <div class="crew-avatar" style="background: ${dept.colorHex}22; color: ${dept.colorHex}">
            ${getInitials(member.name)}
          </div>
          <div class="crew-info">
            <div class="crew-name">${_esc(member.name)}</div>
            ${member.role ? `<div class="crew-role">${_esc(member.role)}</div>` : ''}
          </div>
          <div class="crew-actions">
            ${member.phone ? `<a class="crew-action-btn" href="tel:${_esc(member.phone)}" title="Call">&#128222;</a>` : ''}
            ${member.email ? `<a class="crew-action-btn" href="mailto:${_esc(member.email)}" title="Email">&#9993;</a>` : ''}
          </div>
        </div>
      `;
    }

    html += '</div>';
  }

  html += '</div>';
  container.innerHTML = html;
}

function _esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
