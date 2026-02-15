// Toast Notifications

export function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  // Style
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: `calc(${getComputedStyle(document.documentElement).getPropertyValue('--nav-height')} + ${getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom')} + 16px)`,
    left: '50%',
    transform: 'translateX(-50%) translateY(20px)',
    background: type === 'error' ? 'var(--system-red)' : 'var(--bg-elevated)',
    color: type === 'error' ? '#FFFFFF' : 'var(--text-primary)',
    padding: '10px 20px',
    borderRadius: '20px',
    fontSize: '15px',
    fontWeight: '500',
    boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
    zIndex: '1000',
    opacity: '0',
    transition: 'opacity 0.2s, transform 0.2s',
    pointerEvents: 'none',
    maxWidth: 'calc(100vw - 32px)',
    textAlign: 'center'
  });

  container.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });

  // Remove after duration
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
    setTimeout(() => toast.remove(), 200);
  }, duration);
}
