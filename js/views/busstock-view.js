// Bus Stock View - Bus selector, date picker, stock items with add/edit

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
  tour: null,
  showAddForm: false
};

export async function renderBusStockView() {
  const content = document.getElementById('app-content');
  const tour = tourService.activeTour;

  if (!tour) {
    window.location.hash = '#/tours';
    return;
  }

  _state.tour = tour;
  _state.showAddForm = false;

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
            <span class="check-item-name">${_esc(item.name)}</span>
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
        <p class="empty-state-text">Add items to this stock sheet.</p>
      </div>
    `;
  } else {
    html += `
      <div class="empty-state" style="padding:32px">
        <div class="empty-state-icon">&#128203;</div>
        <h2 class="empty-state-title">No Sheet</h2>
        <p class="empty-state-text">No stock sheet for this date yet.</p>
        ${editable ? `
          <button class="btn btn-primary" id="create-sheet-btn" style="margin-top:12px">Create Sheet</button>
          <button class="btn btn-text" id="create-from-defaults-btn" style="margin-top:8px">Load from Defaults</button>
        ` : ''}
      </div>
    `;
  }

  // Add item button (when editable)
  if (editable) {
    if (_state.showAddForm) {
      html += `
        <div class="card" style="margin-top:16px;padding:16px">
          <div style="font-weight:600;margin-bottom:12px">Add Item</div>
          <input type="text" id="add-item-name" class="edit-time-input" placeholder="Item name" style="width:100%;margin-bottom:8px">
          <div style="display:flex;gap:8px;margin-bottom:8px">
            <input type="number" id="add-item-qty" class="edit-time-input" placeholder="Qty" value="1" min="0" style="width:80px">
            <input type="text" id="add-item-brand" class="edit-time-input" placeholder="Brand (optional)" style="flex:1">
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-primary" id="add-item-save" style="flex:1">Add</button>
            <button class="btn btn-text" id="add-item-cancel">Cancel</button>
          </div>
        </div>
      `;
    } else {
      html += `
        <button class="btn btn-text" id="show-add-form" style="width:100%;margin-top:16px;padding:12px;border:1px dashed var(--separator);border-radius:10px;color:var(--system-blue)">
          + Add Item
        </button>
      `;
    }
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
      _state.showAddForm = false;
      await _loadSheet();
      _render(container);
    });
  });

  // Date navigation
  const dateInput = container.querySelector('#date-input');
  if (dateInput) {
    dateInput.addEventListener('change', async () => {
      _state.selectedDate = dateInput.value;
      _state.showAddForm = false;
      await _loadSheet();
      _render(container);
    });
  }

  container.querySelector('#date-prev')?.addEventListener('click', async () => {
    const d = new Date(_state.selectedDate + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    _state.selectedDate = formatDateISO(d);
    _state.showAddForm = false;
    await _loadSheet();
    _render(container);
  });

  container.querySelector('#date-next')?.addEventListener('click', async () => {
    const d = new Date(_state.selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    _state.selectedDate = formatDateISO(d);
    _state.showAddForm = false;
    await _loadSheet();
    _render(container);
  });

  // Item interactions (toggle, inc, dec)
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

      try {
        const saved = await busStockService.saveSheet(_state.tour, _state.sheet);
        _state.sheet.recordChangeTag = saved.recordChangeTag;
        _render(container);
      } catch (err) {
        showToast('Failed to save changes', 'error');
        console.error('Save error:', err);
      }
    });
  });

  // Create empty sheet
  container.querySelector('#create-sheet-btn')?.addEventListener('click', async () => {
    await _createSheet([]);
    _render(container);
  });

  // Create sheet from defaults
  container.querySelector('#create-from-defaults-btn')?.addEventListener('click', async () => {
    try {
      const defaults = await busStockService.fetchDefaults(_state.tour, _state.selectedBusId);
      const items = defaults?.items?.map((item, i) => ({
        id: _uuid(),
        name: item.name || item.displayName || 'Item',
        brand: item.brand || '',
        size: item.size || '',
        quantity: item.defaultQuantity || item.quantity || 1,
        isChecked: item.enabledByDefault || false,
        isFromDefaults: true,
        order: i
      })) || [];
      await _createSheet(items);
      _render(container);
      if (items.length > 0) {
        showToast(`Loaded ${items.length} items from defaults`);
      } else {
        showToast('No defaults found for this bus');
      }
    } catch (err) {
      showToast('Failed to load defaults', 'error');
      console.error('Defaults error:', err);
    }
  });

  // Show add form
  container.querySelector('#show-add-form')?.addEventListener('click', () => {
    _state.showAddForm = true;
    _render(container);
    // Focus the name input
    setTimeout(() => container.querySelector('#add-item-name')?.focus(), 50);
  });

  // Cancel add form
  container.querySelector('#add-item-cancel')?.addEventListener('click', () => {
    _state.showAddForm = false;
    _render(container);
  });

  // Save new item
  container.querySelector('#add-item-save')?.addEventListener('click', async () => {
    await _addItem(container);
  });

  // Enter key in name field submits
  container.querySelector('#add-item-name')?.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      await _addItem(container);
    }
  });
}

async function _createSheet(items) {
  const sheet = {
    busID: _state.selectedBusId,
    tourID: _state.tour.recordName,
    date: _state.selectedDate + 'T12:00:00',
    items,
    notes: '',
    isLocked: false
  };

  try {
    const saved = await busStockService.saveSheet(_state.tour, sheet);
    _state.sheet = saved;
  } catch (err) {
    showToast('Failed to create sheet', 'error');
    console.error('Create sheet error:', err);
  }
}

async function _addItem(container) {
  const nameInput = container.querySelector('#add-item-name');
  const qtyInput = container.querySelector('#add-item-qty');
  const brandInput = container.querySelector('#add-item-brand');

  const name = nameInput?.value?.trim();
  if (!name) {
    showToast('Enter an item name');
    nameInput?.focus();
    return;
  }

  const quantity = parseInt(qtyInput?.value) || 1;
  const brand = brandInput?.value?.trim() || '';

  const newItem = {
    id: _uuid(),
    name,
    brand,
    size: '',
    quantity,
    isChecked: false,
    isFromDefaults: false,
    order: _state.sheet ? _state.sheet.items.length : 0
  };

  // Create sheet if it doesn't exist
  if (!_state.sheet) {
    await _createSheet([newItem]);
  } else {
    _state.sheet.items.push(newItem);
    try {
      const saved = await busStockService.saveSheet(_state.tour, _state.sheet);
      _state.sheet.recordChangeTag = saved.recordChangeTag;
    } catch (err) {
      showToast('Failed to add item', 'error');
      console.error('Add item error:', err);
      _state.sheet.items.pop(); // rollback
      return;
    }
  }

  _state.showAddForm = false;
  _render(container);
  showToast(`Added "${name}"`);
}

function _uuid() {
  return crypto.randomUUID ? crypto.randomUUID() :
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

function _esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
