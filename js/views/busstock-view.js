// Bus Stock View - Bus selector, date picker, stock items

import { tourService } from '../services/tour-service.js';
import { busStockService } from '../services/busstock-service.js';
import { formatDateISO, formatDateShort, todayKey } from '../models/formatters.js';
import { canEditBusStock } from '../models/permissions.js';
import { showToast } from '../components/toast.js';

let _state = {
  buses: [],
  selectedBusId: null,
  selectedDate: todayKey(),
  sheet: null,
  tour: null
};

export async function renderBusStockView() {
  const content = document.getElementById('app-content');
  const tour = tourService.activeTour;

  if (!tour) {
    window.location.hash = '#/tours';
    return;
  }

  _state.tour = tour;

  content.innerHTML = `
    <div class="loading-container">
      <div class="spinner"></div>
      <span class="loading-text">Loading bus stock...</span>
    </div>
  `;

  try {
    _state.buses = await busStockService.fetchBuses(tour);

    if (_state.buses.length === 0) {
      content.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">&#128652;</div>
          <h2 class="empty-state-title">No Buses</h2>
          <p class="empty-state-text">No buses have been set up for this tour yet.</p>
        </div>
      `;
      return;
    }

    // Select first bus if none selected
    if (!_state.selectedBusId) {
      _state.selectedBusId = _state.buses[0].id;
    }

    await _loadSheet();
    _render(content);
  } catch (e) {
    console.error('Error loading bus stock:', e);
    content.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">&#9888;</div>
        <h2 class="empty-state-title">Error</h2>
        <p class="empty-state-text">${e.message}</p>
      </div>
    `;
  }
}

export async function renderBusStockSheetView({ busId, date }) {
  _state.selectedBusId = busId;
  _state.selectedDate = date;
  _state.tour = tourService.activeTour;
  await renderBusStockView();
}

async function _loadSheet() {
  if (!_state.selectedBusId || !_state.selectedDate || !_state.tour) return;
  _state.sheet = await busStockService.fetchSheet(
    _state.tour,
    _state.selectedBusId,
    new Date(_state.selectedDate + 'T12:00:00')
  );
}

function _render(container) {
  const { buses, selectedBusId, selectedDate, sheet, tour } = _state;
  const role = tour.role;
  const locked = busStockService.isSheetLocked(sheet);
  const editable = canEditBusStock(role, locked);

  let html = '<div class="busstock-view">';

  // Bus selector chips
  html += '<div class="bus-selector">';
  for (const bus of buses) {
    const active = bus.id === selectedBusId ? 'active' : '';
    html += `<button class="bus-chip ${active}" data-bus-id="${bus.id}">${_esc(bus.name)}</button>`;
  }
  html += '</div>';

  // Date picker
  html += `
    <div class="busstock-date-picker">
      <button class="btn btn-text btn-sm" id="date-prev">&#8249; Prev</button>
      <input type="date" class="edit-time-input" id="date-input" value="${selectedDate}" style="width:auto;text-align:center">
      <button class="btn btn-text btn-sm" id="date-next">Next &#8250;</button>
    </div>
  `;

  // Lock status
  if (sheet) {
    html += `<div style="text-align:center;margin-bottom:12px">
      <span class="badge ${locked ? 'badge-locked' : 'badge-unlocked'}">
        ${locked ? 'Locked' : 'Unlocked'}
      </span>
    </div>`;
  }

  // Stock items
  if (sheet && sheet.items.length > 0) {
    const groups = busStockService.groupByCategory(sheet.items);

    for (const [category, items] of groups) {
      html += `<div class="stock-category-header">${_esc(category)}</div>`;
      html += '<div class="card">';

      for (const item of items) {
        html += `
          <div class="check-item" data-item-id="${item.id}">
            <div class="check-box ${item.isChecked ? 'checked' : ''}" data-action="toggle" data-item-id="${item.id}" ${!editable ? 'style="pointer-events:none;opacity:0.5"' : ''}></div>
            <span class="check-item-name ${item.isChecked ? 'checked' : ''}">${_esc(item.name)}</span>
            <div class="check-item-qty">
              ${editable ? `<button class="qty-btn" data-action="dec" data-item-id="${item.id}">&minus;</button>` : ''}
              <span class="qty-value">${item.quantity || 0}</span>
              ${editable ? `<button class="qty-btn" data-action="inc" data-item-id="${item.id}">+</button>` : ''}
            </div>
          </div>
        `;
      }

      html += '</div>';
    }

    if (sheet.notes) {
      html += `<div class="daysheet-notes" style="margin-top:12px">${_esc(sheet.notes)}</div>`;
    }
  } else if (sheet) {
    html += `
      <div class="empty-state" style="padding:32px">
        <div class="empty-state-icon">&#128230;</div>
        <h2 class="empty-state-title">No Items</h2>
        <p class="empty-state-text">This sheet has no stock items.</p>
      </div>
    `;
  } else {
    html += `
      <div class="empty-state" style="padding:32px">
        <div class="empty-state-icon">&#128203;</div>
        <h2 class="empty-state-title">No Sheet</h2>
        <p class="empty-state-text">No stock sheet exists for this date.</p>
      </div>
    `;
  }

  html += '</div>';
  container.innerHTML = html;

  // Bind events
  _bindEvents(container);
}

function _bindEvents(container) {
  // Bus selector
  container.querySelectorAll('.bus-chip').forEach(chip => {
    chip.addEventListener('click', async () => {
      _state.selectedBusId = chip.dataset.busId;
      await _loadSheet();
      _render(container);
    });
  });

  // Date navigation
  const dateInput = container.querySelector('#date-input');
  if (dateInput) {
    dateInput.addEventListener('change', async () => {
      _state.selectedDate = dateInput.value;
      await _loadSheet();
      _render(container);
    });
  }

  container.querySelector('#date-prev')?.addEventListener('click', async () => {
    const d = new Date(_state.selectedDate + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    _state.selectedDate = formatDateISO(d);
    await _loadSheet();
    _render(container);
  });

  container.querySelector('#date-next')?.addEventListener('click', async () => {
    const d = new Date(_state.selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    _state.selectedDate = formatDateISO(d);
    await _loadSheet();
    _render(container);
  });

  // Item interactions
  container.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = el.dataset.action;
      const itemId = el.dataset.itemId;

      if (!_state.sheet) return;
      const item = _state.sheet.items.find(i => i.id === itemId);
      if (!item) return;

      if (action === 'toggle') {
        item.isChecked = !item.isChecked;
      } else if (action === 'inc') {
        item.quantity = (item.quantity || 0) + 1;
      } else if (action === 'dec') {
        item.quantity = Math.max(0, (item.quantity || 0) - 1);
      }

      // Save
      try {
        await busStockService.saveSheet(_state.tour, _state.sheet);
        _render(container);
      } catch (err) {
        showToast('Failed to save changes', 'error');
        console.error('Save error:', err);
      }
    });
  });
}

function _esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
