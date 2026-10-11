// iCalendar (RFC 5545) export so plans can be imported into Google Calendar,
// Outlook or Apple Calendar.

const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Fold lines longer than 75 octets as required by RFC 5545. */
function fold(line) {
  const out = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  out.push(rest);
  return out.join('\r\n');
}

export const icsDateTime = (date, time) => `${date.replace(/-/g, '')}T${(time || '00:00').replace(':', '')}00`;

/** events: [{uid, date, start, end, title, description, location}] */
export function buildICS(events, calName = 'Teacher Planner') {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Teacher Planner//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(calName)}`];
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDateTime(e.date, e.start)}`,
      `DTEND:${icsDateTime(e.date, e.end || e.start)}`,
      `SUMMARY:${esc(e.title)}`,
    );
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n');
}

export function googleCalendarLink({ date, start, end, title, description, location }) {
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${icsDateTime(date, start)}/${icsDateTime(date, end || start)}`,
    details: description || '',
    location: location || '',
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

export const classroomShareLink = (url, title) =>
  `https://classroom.google.com/share?url=${encodeURIComponent(url)}${title ? `&title=${encodeURIComponent(title)}` : ''}`;
