// Tour Picker - Dropdown for selecting active tour

import { tourService } from '../services/tour-service.js';

export function renderTourPicker(headerEl) {
  const tour = tourService.activeTour;
  if (!tour) return;

  headerEl.innerHTML = `
    <div class="tour-picker" id="tour-picker-toggle">
      <div class="tour-dot" style="background: ${tour.colorHex}"></div>
      <span class="tour-picker-name">${_esc(tour.name)}</span>
      <span class="tour-picker-arrow">&#9660;</span>
    </div>
  `;

  const toggle = headerEl.querySelector('#tour-picker-toggle');
  toggle.addEventListener('click', () => {
    if (document.querySelector('.dropdown-overlay')) {
      _closeDropdown();
      return;
    }
    _openDropdown(tour);
  });
}

function _openDropdown(currentTour) {
  const tours = tourService.tours;
  if (tours.length <= 1) return;

  // Overlay
  const overlay = document.createElement('div');
  overlay.className = 'dropdown-overlay';
  overlay.addEventListener('click', _closeDropdown);

  // Menu
  const menu = document.createElement('div');
  menu.className = 'dropdown-menu';

  let html = '';
  for (const tour of tours) {
    const isActive = tour.recordName === currentTour.recordName;
    html += `
      <div class="list-item${isActive ? ' active' : ''}" data-tour-id="${tour.recordName}" style="${isActive ? 'background:var(--bg-tertiary)' : ''}">
        <div class="tour-dot" style="background: ${tour.colorHex}"></div>
        <div class="list-item-content">
          <div class="list-item-title">${_esc(tour.name)}</div>
          <div class="list-item-subtitle">${tour.role}</div>
        </div>
      </div>
    `;
  }

  // Change tour link
  html += `
    <div class="list-item" style="border-top:1px solid var(--separator)">
      <div class="list-item-content" style="text-align:center">
        <a href="#/tours" class="list-item-title" style="color:var(--tour-color);text-decoration:none">All Tours</a>
      </div>
    </div>
  `;

  menu.innerHTML = html;

  document.body.appendChild(overlay);
  document.body.appendChild(menu);

  // Toggle picker arrow
  document.querySelector('.tour-picker')?.classList.add('open');

  // Bind selection
  menu.querySelectorAll('[data-tour-id]').forEach(item => {
    item.addEventListener('click', () => {
      const tourId = item.dataset.tourId;
      const selected = tours.find(t => t.recordName === tourId);
      if (selected) {
        tourService.activeTour = selected;
        _closeDropdown();
        // Re-render current view
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      }
    });
  });
}

function _closeDropdown() {
  document.querySelector('.dropdown-overlay')?.remove();
  document.querySelector('.dropdown-menu')?.remove();
  document.querySelector('.tour-picker')?.classList.remove('open');
}

function _esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
