const MONTHS: Record<string, number> = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sep: 8, sept: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
};

function toISO(d: Date): string {
  // Use local date parts — toISOString() converts to UTC which shifts the
  // date back by a day in timezones east of UTC (e.g. Australia UTC+10/11).
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Converts a date string from Claude output to YYYY-MM-DD.
 * Returns null if the string can't be meaningfully parsed
 * (e.g. "TBA", "Term 2 Week 3", "ongoing").
 */
export function parseToISODate(dateStr: string, ref: Date = new Date()): string | null {
  if (!dateStr) return null;

  const s = dateStr.trim();
  const lower = s.toLowerCase();

  if (['tba', 'tbd', '', 'ongoing', 'various', 'n/a'].includes(lower)) return null;

  // Already ISO: 2026-05-14
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // DD/MM/YYYY or MM/DD/YYYY — treat as DD/MM/YYYY (Australian)
  const slashFull = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashFull) {
    const d = new Date(parseInt(slashFull[3]), parseInt(slashFull[2]) - 1, parseInt(slashFull[1]));
    if (!isNaN(d.getTime())) return toISO(d);
  }

  // DD/MM or MM/DD without year — treat as DD/MM
  const slashShort = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (slashShort) {
    const d = new Date(ref.getFullYear(), parseInt(slashShort[2]) - 1, parseInt(slashShort[1]));
    if (d < ref) d.setFullYear(ref.getFullYear() + 1);
    if (!isNaN(d.getTime())) return toISO(d);
  }

  // "14 May" / "14th May" / "14 May 2026" / "14th May 2026"
  const dayMonth = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\s*,?\s*(\d{4})?$/i);
  if (dayMonth) {
    const month = MONTHS[dayMonth[2].toLowerCase()];
    if (month !== undefined) {
      const year = dayMonth[3] ? parseInt(dayMonth[3]) : ref.getFullYear();
      const d = new Date(year, month, parseInt(dayMonth[1]));
      if (!dayMonth[3] && d < ref) d.setFullYear(ref.getFullYear() + 1);
      if (!isNaN(d.getTime())) return toISO(d);
    }
  }

  // "May 14" / "May 14, 2026"
  const monthDay = s.match(/^([a-z]+)\s+(\d{1,2}),?\s*(\d{4})?$/i);
  if (monthDay) {
    const month = MONTHS[monthDay[1].toLowerCase()];
    if (month !== undefined) {
      const year = monthDay[3] ? parseInt(monthDay[3]) : ref.getFullYear();
      const d = new Date(year, month, parseInt(monthDay[2]));
      if (!monthDay[3] && d < ref) d.setFullYear(ref.getFullYear() + 1);
      if (!isNaN(d.getTime())) return toISO(d);
    }
  }

  // "Friday 5 May" / "Friday, 5 May 2026" — strip day-of-week prefix
  const dowPrefix = s.match(
    /^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s+(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\s*,?\s*(\d{4})?$/i
  );
  if (dowPrefix) {
    const month = MONTHS[dowPrefix[2].toLowerCase()];
    if (month !== undefined) {
      const year = dowPrefix[3] ? parseInt(dowPrefix[3]) : ref.getFullYear();
      const d = new Date(year, month, parseInt(dowPrefix[1]));
      if (!dowPrefix[3] && d < ref) d.setFullYear(ref.getFullYear() + 1);
      if (!isNaN(d.getTime())) return toISO(d);
    }
  }

  // Last resort: try native Date parse only when a 4-digit year is present
  // (avoids misinterpreting "May" as a valid date)
  if (/\d{4}/.test(s)) {
    const native = new Date(s);
    if (!isNaN(native.getTime())) return toISO(native);
  }

  return null;
}
