// Bottom Tab Bar Navigation

import { canView } from '../models/permissions.js';

const TABS = [
  { id: 'schedule', hash: '#/', icon: '&#128197;', label: 'Schedule' },
  { id: 'setlists', hash: '#/setlists', icon: '&#127925;', label: 'Setlists' },
  { id: 'busstock', hash: '#/busstock', icon: '&#128652;', label: 'Bus Stock' },
  { id: 'venue', hash: '#/venue', icon: '&#127961;', label: 'Venue' },
  { id: 'more', hash: '#/more', icon: '&#8943;', label: 'More' }
];

export function renderNavBar(activeTab, role) {
  const nav = document.getElementById('app-nav');
  nav.classList.remove('hidden');

  // Filter tabs based on role
  const visibleTabs = TABS.filter(tab => {
    if (tab.id === 'venue') return canView(role, 'venue');
    return true;
  });

  nav.innerHTML = `
    <div class="tab-bar">
      ${visibleTabs.map(tab => `
        <a class="tab-item ${tab.id === activeTab ? 'active' : ''}"
           href="${tab.hash}"
           data-tab="${tab.id}">
          <span class="tab-icon">${tab.icon}</span>
          <span class="tab-label">${tab.label}</span>
        </a>
      `).join('')}
    </div>
  `;
}

export function getActiveTab(routePattern) {
  switch (routePattern) {
    case '#/':
    case '#/event/:id':
      return 'schedule';
    case '#/setlists':
      return 'setlists';
    case '#/busstock':
    case '#/busstock/:busId/:date':
      return 'busstock';
    case '#/venue':
    case '#/venue/:venueKey':
      return 'venue';
    case '#/crew':
    case '#/announcements':
    case '#/more':
      return 'more';
    default:
      return 'schedule';
  }
}
