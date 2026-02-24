// Bus Stock View - Bus selector, persistent stock list with purchase action

import { tourService } from '../services/tour-service.js';
import { busStockService } from '../services/busstock-service.js';
import { formatDateISO, formatDateShort, todayKey } from '../models/formatters.js';
import { canEditBusStock, isOwnerOrAdmin, canPurchaseBusStock } from '../models/permissions.js';
import { authService } from '../services/auth.js';
import { showToast } from '../components/toast.js';

const STORAGE_BUS_KEY = 'tourcal_busstock_busId';

let _state = {
  buses: [],
  selectedBusId: sessionStorage.getItem(STORAGE_BUS_KEY) || null,
  sheet: null,
  items: [],
  tour: null,
  showAddForm: false,
  receipts: [],
  showReceipts: false
};

function _saveSelection() {
  if (_state.selectedBusId) sessionStorage.setItem(STORAGE_BUS_KEY, _state.selectedBusId);
}

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

    // Restore or default bus selection
    if (!_state.selectedBusId || !_state.buses.find(b => b.id === _state.selectedBusId)) {
      _state.selectedBusId = _state.buses[0].id;
    }

    _saveSelection();
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

export async function renderBusStockSheetView({ busId }) {
  _state.selectedBusId = busId;
  _state.tour = tourService.activeTour;
  _saveSelection();

  // Set header with back button to event detail
  document.getElementById('header-title').textContent = 'Bus Stock';
  document.getElementById('header-actions').innerHTML = `
    <button class="btn btn-text" onclick="history.back()">&#8249; Back</button>
  `;

  await renderBusStockView();
}

async function _loadSheet() {
  if (!_state.selectedBusId || !_state.tour) return;

  // Fetch sheet (lock/notes) and items separately
  _state.sheet = await busStockService.fetchSheet(
    _state.tour,
    _state.selectedBusId
  );

  _state.items = await busStockService.fetchItems(
    _state.tour,
    _state.selectedBusId
  );

  // One-time migration: if sheet has legacy items but no individual records exist
  if (_state.sheet?._legacyItems?.length > 0 && _state.items.length === 0) {
    console.log('[BusStock] Migrating legacy items to individual records...');
    const legacyItems = _state.sheet._legacyItems.map((item, i) => ({
      id: item.id || _uuid(),
      name: item.name || '',
      brand: item.brand || '',
      size: item.size || '',
      quantity: item.quantity || 1,
      isChecked: item.isChecked || false,
      isFromDefaults: item.isFromDefaults || false,
      order: item.order ?? i,
      createdBy: item.createdBy || ''
    }));

    try {
      _state.items = await busStockService.saveItems(_state.tour, legacyItems, _state.selectedBusId);
    } catch (e) {
      console.warn('Migration failed, using legacy items in-memory:', e);
      _state.items = legacyItems;
    }
  }

  // Also load recent receipts for this bus (last 24 hours only)
  const allReceipts = await busStockService.fetchReceipts(
    _state.tour,
    _state.selectedBusId
  );
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  _state.receipts = allReceipts.filter(r => {
    const t = r.purchasedAt ? new Date(r.purchasedAt).getTime() : 0;
    return t > cutoff;
  });
}

function _render(container) {
  const { buses, selectedBusId, sheet, items, tour, receipts } = _state;
  const role = tour.role;
  const locked = busStockService.isSheetLocked(sheet);
  const editable = canEditBusStock(role, locked, tour.permissionOverrides);
  const isAdmin = isOwnerOrAdmin(role);
  const canPurchase = canPurchaseBusStock(role, tour.permissionOverrides);
  const currentUser = authService.userRecordName;

  function canDeleteItem(item) {
    if (isAdmin) return true;
    if (!item.createdBy) return false;  // no creator info — only admin can delete
    return item.createdBy === currentUser;
  }

  const requestedCount = items.filter(i => i.isChecked).length;
  const totalCount = items.length;

  let html = '<div class="busstock-view">';

  // Bus selector chips
  html += '<div class="bus-selector">';
  for (const bus of buses) {
    const active = bus.id === selectedBusId ? 'active' : '';
    html += `<button class="bus-chip ${active}" data-bus-id="${bus.id}">${_esc(bus.name)}</button>`;
  }
  html += '</div>';

  // Lock status
  if (sheet) {
    html += `<div style="text-align:center;margin-bottom:12px">
      <span class="badge ${locked ? 'badge-locked' : 'badge-unlocked'}">
        ${locked ? 'Locked' : 'Unlocked'}
      </span>
      <span style="font-size:13px;color:var(--text-secondary);margin-left:8px;font-variant-numeric:tabular-nums">${requestedCount}/${totalCount} requested</span>
    </div>`;
  }

  // Stock items
  if (items.length > 0) {
    const groups = busStockService.groupByCategory(items);

    for (const [category, catItems] of groups) {
      html += `<div class="stock-category-header">${_esc(category)}</div>`;
      html += '<div class="card">';

      for (const item of catItems) {
        const subtitleParts = [item.brand, item.size].filter(Boolean);
        if (isAdmin && item.createdBy) {
          const addedByText = item.createdBy === currentUser ? 'You' : item.createdBy.substring(0, 8) + '...';
          subtitleParts.push(`Added by ${addedByText}`);
        }
        if (!item.isFromDefaults && item.createdBy) {
          subtitleParts.push('Added');
        }
        const subtitle = subtitleParts.join(' \u00b7 ');
        html += `
          <div class="check-item" data-item-id="${item.id}">
            <div class="check-box ${item.isChecked ? 'checked' : ''}" data-action="toggle" data-item-id="${item.id}" ${!editable ? 'style="pointer-events:none;opacity:0.5"' : ''}></div>
            <div class="check-item-info">
              <span class="check-item-name">${_esc(item.name)}</span>
              ${subtitle ? `<span class="check-item-subtitle">${_esc(subtitle)}</span>` : ''}
            </div>
            <div class="check-item-qty">
              ${editable ? `<button class="qty-btn" data-action="dec" data-item-id="${item.id}">&minus;</button>` : ''}
              <span class="qty-value">${item.quantity || 0}</span>
              ${editable ? `<button class="qty-btn" data-action="inc" data-item-id="${item.id}">+</button>` : ''}
              ${item.isChecked && canPurchase ? `<button class="qty-btn" data-action="purchase" data-item-id="${item.id}" style="color:var(--system-green,#34c759);margin-left:4px" title="Mark purchased">&#128722;</button>` : ''}
              ${editable && canDeleteItem(item) ? `<button class="qty-btn" data-action="delete" data-item-id="${item.id}" style="color:var(--system-red);margin-left:4px" title="Remove item">\u2715</button>` : ''}
            </div>
          </div>
        `;
      }

      html += '</div>';
    }

    if (sheet?.notes) {
      html += `<div class="daysheet-notes" style="margin-top:12px">${_esc(sheet.notes)}</div>`;
    }

    // Clear all requests
    if (requestedCount > 0) {
      html += `
        <button class="btn btn-text" id="clear-requests-btn" style="width:100%;margin-top:16px;color:var(--text-secondary)">
          Clear All Requests
        </button>
      `;
    }
  } else if (sheet) {
    html += `
      <div class="empty-state" style="padding:32px">
        <div class="empty-state-icon">&#128230;</div>
        <h2 class="empty-state-title">No Items</h2>
        <p class="empty-state-text">Add items to this stock list.</p>
      </div>
    `;
  } else {
    html += `
      <div class="empty-state" style="padding:32px">
        <div class="empty-state-icon">&#128203;</div>
        <h2 class="empty-state-title">No Stock List</h2>
        <p class="empty-state-text">No stock list for this bus yet.</p>
        ${editable ? `
          <button class="btn btn-primary" id="create-sheet-btn" style="margin-top:12px">Create Stock List</button>
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
          <input type="text" id="add-item-size" class="edit-time-input" placeholder="Size (optional, e.g. Case of 24, 12oz)" style="width:100%;margin-bottom:8px">
          <label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;font-size:14px;color:var(--text-secondary);cursor:pointer">
            <input type="checkbox" id="add-item-defaults" style="width:18px;height:18px">
            Also add to defaults
          </label>
          <div style="display:flex;gap:8px">
            <button class="btn btn-primary" id="add-item-save" style="flex:1">Add</button>
            <button class="btn btn-text" id="add-item-cancel">Cancel</button>
          </div>
        </div>
      `;
    } else if (sheet || items.length > 0) {
      html += `
        <button class="btn btn-text" id="show-add-form" style="width:100%;margin-top:16px;padding:12px;border:1px dashed var(--separator);border-radius:10px;color:var(--system-blue)">
          + Add Item
        </button>
      `;
    }
  }

  // Recent Receipts section
  if (receipts.length > 0) {
    const totalPurchased = receipts.reduce((sum, r) => sum + r.items.length, 0);
    html += `
      <div style="margin-top:24px">
        <button class="btn btn-text" id="toggle-receipts" style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:10px 0;color:var(--text-secondary);font-weight:600">
          <span>&#128722; Purchased (${totalPurchased})</span>
          <span style="font-size:12px">${_state.showReceipts ? '&#9650;' : '&#9660;'}</span>
        </button>
      </div>
    `;

    if (_state.showReceipts) {
      for (const r of receipts) {
        const dateStr = r.date ? new Date(r.date).toLocaleDateString() : 'Unknown';
        const timeStr = r.purchasedAt ? new Date(r.purchasedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        html += `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;padding:0 4px">
            <span style="font-size:13px;font-weight:500;color:var(--text-secondary)">${dateStr}</span>
            <span style="font-size:12px;color:var(--text-tertiary)">${timeStr}</span>
          </div>
        `;
        html += '<div class="card">';
        for (let i = 0; i < r.items.length; i++) {
          const item = r.items[i];
          const subtitleParts = [item.brand, item.size].filter(Boolean);
          const subtitle = subtitleParts.join(' \u00b7 ');
          html += `
            <div style="display:flex;align-items:center;gap:10px;padding:8px 12px${i < r.items.length - 1 ? ';border-bottom:1px solid var(--separator)' : ''}">
              <span style="color:var(--system-green,#34c759);font-size:16px">&#10003;</span>
              <div style="flex:1;min-width:0">
                <div style="font-size:15px">${_esc(item.name)}</div>
                ${subtitle ? `<div style="font-size:12px;color:var(--text-tertiary)">${_esc(subtitle)}</div>` : ''}
              </div>
              <span style="font-size:13px;color:var(--text-secondary);font-variant-numeric:tabular-nums">x${item.quantity || 1}</span>
            </div>
          `;
        }
        html += '</div>';
      }
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
      _state.showReceipts = false;
      _saveSelection();
      await _loadSheet();
      _render(container);
    });
  });

  // Item interactions (toggle, inc, dec, delete, purchase)
  container.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = el.dataset.action;
      const itemId = el.dataset.itemId;

      const item = _state.items.find(i => i.id === itemId);
      if (!item) return;

      // Per-item purchase
      if (action === 'purchase') {
        if (!confirm(`Mark "${item.name}" as purchased?`)) return;
        try {
          const bus = _state.buses.find(b => b.id === _state.selectedBusId);
          const result = await busStockService.purchaseItem(
            _state.tour, bus, _state.items, item, authService.userRecordName
          );
          if (result) {
            _state.items = result.items;
            const allReceipts = await busStockService.fetchReceipts(_state.tour, _state.selectedBusId);
            const cutoff = Date.now() - 24 * 60 * 60 * 1000;
            _state.receipts = allReceipts.filter(r => {
              const t = r.purchasedAt ? new Date(r.purchasedAt).getTime() : 0;
              return t > cutoff;
            });
            _state.showReceipts = true;
            showToast(`Purchased "${item.name}"`);
            _render(container);
          }
        } catch (err) {
          showToast('Failed to mark purchased', 'error');
          console.error('Purchase error:', err);
        }
        return;
      }

      // Toggle, inc, dec, delete — each saves a single item record
      if (action === 'toggle') {
        item.isChecked = !item.isChecked;
      } else if (action === 'inc') {
        item.quantity = (item.quantity || 0) + 1;
      } else if (action === 'dec') {
        item.quantity = Math.max(0, (item.quantity || 0) - 1);
      } else if (action === 'delete') {
        if (!confirm(`Remove "${item.name}" from the list?`)) return;
        try {
          await busStockService.deleteItem(_state.tour, itemId, item.recordChangeTag);
          _state.items = _state.items.filter(i => i.id !== itemId);
          // Reorder remaining
          _state.items.forEach((it, i) => { it.order = i; });
          if (_state.items.length > 0) {
            await busStockService.saveItems(_state.tour, _state.items, _state.selectedBusId);
          }
          _render(container);
          showToast(`Removed "${item.name}"`);
        } catch (err) {
          showToast('Failed to remove item', 'error');
          console.error('Delete error:', err);
        }
        return;
      }

      // Save the single modified item
      try {
        const saved = await busStockService.saveItem(_state.tour, item, _state.selectedBusId);
        // Update in-memory with server recordChangeTag
        const idx = _state.items.findIndex(i => i.id === itemId);
        if (idx >= 0) {
          _state.items[idx].recordChangeTag = saved.recordChangeTag;
        }
        _render(container);
      } catch (err) {
        showToast('Failed to save changes', 'error');
        console.error('Save error:', err);
      }
    });
  });

  // Clear All Requests
  container.querySelector('#clear-requests-btn')?.addEventListener('click', async () => {
    if (!confirm('Clear all requests? Items will remain on the list but none will be marked for purchase.')) return;

    for (const item of _state.items) {
      item.isChecked = false;
    }

    try {
      await busStockService.saveItems(_state.tour, _state.items, _state.selectedBusId);
      _render(container);
      showToast('All requests cleared');
    } catch (err) {
      showToast('Failed to clear requests', 'error');
      console.error('Clear error:', err);
    }
  });

  // Toggle receipts
  container.querySelector('#toggle-receipts')?.addEventListener('click', () => {
    _state.showReceipts = !_state.showReceipts;
    _render(container);
  });

  // Create empty sheet
  container.querySelector('#create-sheet-btn')?.addEventListener('click', async () => {
    await _createSheet();
    _render(container);
  });

  // Create sheet from defaults
  container.querySelector('#create-from-defaults-btn')?.addEventListener('click', async () => {
    try {
      const defaults = await busStockService.fetchDefaults(_state.tour, _state.selectedBusId);
      const defaultItems = defaults?.items?.map((item, i) => ({
        id: _uuid(),
        name: item.name || item.displayName || 'Item',
        brand: item.brand || '',
        size: item.size || '',
        quantity: item.defaultQuantity || item.quantity || 1,
        isChecked: false,
        isFromDefaults: true,
        order: i,
        createdBy: authService.userRecordName || null
      })) || [];

      // Create the sheet (lock/notes)
      await _createSheet();

      // Save items as individual records
      if (defaultItems.length > 0) {
        _state.items = await busStockService.saveItems(_state.tour, defaultItems, _state.selectedBusId);
        showToast(`Loaded ${defaultItems.length} items from defaults`);
      } else {
        showToast('No defaults found for this bus');
      }
      _render(container);
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

async function _createSheet() {
  const sheet = {
    busID: _state.selectedBusId,
    tourID: _state.tour.recordName,
    notes: '',
    isLocked: false
  };

  try {
    const saved = await busStockService.saveSheet(_state.tour, sheet);
    _state.sheet = saved;
  } catch (err) {
    showToast('Failed to create stock list', 'error');
    console.error('Create sheet error:', err);
  }
}

async function _addItem(container) {
  const nameInput = container.querySelector('#add-item-name');
  const qtyInput = container.querySelector('#add-item-qty');
  const brandInput = container.querySelector('#add-item-brand');
  const sizeInput = container.querySelector('#add-item-size');
  const defaultsCheck = container.querySelector('#add-item-defaults');

  const name = nameInput?.value?.trim();
  if (!name) {
    showToast('Enter an item name');
    nameInput?.focus();
    return;
  }

  const quantity = parseInt(qtyInput?.value) || 1;
  const brand = brandInput?.value?.trim() || '';
  const size = sizeInput?.value?.trim() || '';
  const addToDefaults = defaultsCheck?.checked || false;

  const newItem = {
    id: _uuid(),
    name,
    brand,
    size,
    quantity,
    isChecked: true,  // new items default to requested
    isFromDefaults: false,
    order: _state.items.length,
    createdBy: authService.userRecordName || null
  };

  // Create sheet if it doesn't exist
  if (!_state.sheet) {
    await _createSheet();
  }

  // Save the single item record
  try {
    const saved = await busStockService.saveItem(_state.tour, newItem, _state.selectedBusId);
    _state.items.push(saved);
  } catch (err) {
    showToast('Failed to add item', 'error');
    console.error('Add item error:', err);
    return;
  }

  // Add to defaults if requested
  if (addToDefaults) {
    try {
      const existing = await busStockService.fetchDefaults(_state.tour, _state.selectedBusId);
      const defaultItems = existing?.items || [];
      defaultItems.push({
        id: _uuid(),
        name,
        brand,
        size,
        defaultQuantity: quantity,
        enabledByDefault: false,
        order: defaultItems.length
      });
      await busStockService.saveDefaults(_state.tour, _state.selectedBusId, defaultItems);
      showToast(`Added "${name}" + saved to defaults`);
    } catch (err) {
      console.error('Save defaults error:', err);
      showToast(`Added "${name}" (defaults save failed)`, 'error');
    }
  } else {
    showToast(`Added "${name}"`);
  }

  _state.showAddForm = false;
  _render(container);
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
