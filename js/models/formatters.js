// Date/Time/SMPTE Formatters

// Format date as "Mon, Jan 15"
export function formatDateShort(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
}

// Format date as "Monday, January 15, 2025"
export function formatDateLong(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

// Format date as "Jan 15"
export function formatDateCompact(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Format date as "2025-01-15"
export function formatDateISO(date) {
  if (!date) return '';
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Format time as "3:30 PM"
export function formatTime(date, timeZone) {
  if (!date) return '';
  const d = new Date(date);
  const opts = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  };
  if (timeZone) opts.timeZone = timeZone;
  return d.toLocaleTimeString('en-US', opts);
}

// Format time as "15:30"
export function formatTime24(date, timeZone) {
  if (!date) return '';
  const d = new Date(date);
  const opts = {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  };
  if (timeZone) opts.timeZone = timeZone;
  return d.toLocaleTimeString('en-US', opts);
}

// Format time range "3:30 PM - 5:00 PM"
export function formatTimeRange(start, end, timeZone) {
  if (!start) return '';
  const s = formatTime(start, timeZone);
  if (!end) return s;
  const e = formatTime(end, timeZone);
  return `${s} - ${e}`;
}

// Format duration in seconds as "3:45" or "1:23:45"
export function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Format total duration as "1h 23m"
export function formatDurationHM(seconds) {
  if (!seconds || seconds <= 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

// Format SMPTE timecode "HH:MM:SS:FF"
export function formatSMPTE(timecode) {
  if (!timecode) return '';
  const h = String(timecode.hours || 0).padStart(2, '0');
  const m = String(timecode.minutes || 0).padStart(2, '0');
  const s = String(timecode.seconds || 0).padStart(2, '0');
  const f = String(timecode.frames || 0).padStart(2, '0');
  return `${h}:${m}:${s}:${f}`;
}

// Format relative time "2 hours ago", "just now"
export function formatRelative(date) {
  if (!date) return '';
  const d = new Date(date);
  const now = Date.now();
  const diff = now - d.getTime();

  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return formatDateShort(d);
}

// Format BPM
export function formatBPM(bpm) {
  if (!bpm) return '';
  return `${bpm} BPM`;
}

// Get initials from name
export function getInitials(name) {
  if (!name) return '?';
  return name.split(' ')
    .filter(Boolean)
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// Get today's date key
export function todayKey() {
  return formatDateISO(new Date());
}
