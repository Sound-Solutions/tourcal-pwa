// Pull-to-Refresh gesture handler

export function setupPullToRefresh(scrollContainer, onRefresh) {
  const indicator = scrollContainer.querySelector('.ptr-indicator');
  if (!indicator) return;

  let startY = 0;
  let pulling = false;

  scrollContainer.addEventListener('touchstart', (e) => {
    if (scrollContainer.scrollTop <= 0) {
      startY = e.touches[0].clientY;
      pulling = true;
    }
  }, { passive: true });

  scrollContainer.addEventListener('touchmove', (e) => {
    if (!pulling) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 0 && scrollContainer.scrollTop <= 0) {
      const progress = Math.min(dy / 100, 1);
      indicator.style.height = `${Math.min(dy * 0.5, 60)}px`;
      indicator.style.opacity = progress;
    }
  }, { passive: true });

  scrollContainer.addEventListener('touchend', async () => {
    if (!pulling) return;
    pulling = false;

    const height = parseInt(indicator.style.height || '0');
    if (height > 40) {
      indicator.classList.add('active');
      indicator.style.height = '';
      indicator.style.opacity = '';
      try {
        await onRefresh();
      } catch (e) {
        console.warn('Refresh error:', e);
      }
    }

    indicator.classList.remove('active');
    indicator.style.height = '0';
    indicator.style.opacity = '0';
  }, { passive: true });
}
