/**
 * Timezone utilities for URide MVP
 * 
 * For MVP, we're Calgary-only so we hardcode the timezone.
 * This ensures consistent time display regardless of device settings.
 */

// Calgary timezone
export const CALGARY_TIMEZONE = 'America/Edmonton';

/**
 * Options accepted by the formatters. Callers may pass:
 *  - nothing            -> the function's default format
 *  - a moment/date-fns style token string (e.g. 'h:mm a', 'EEEE, MMMM d')
 *  - an Intl.DateTimeFormatOptions object (optionally with { includeDate })
 *
 * Historically several call sites passed token strings into an Intl-typed
 * parameter; the string was spread into the options object and silently
 * re-enabled the Android "A M"/"P M" spacing bug (or dropped the format
 * entirely). Token strings are now parsed explicitly and rendered through the
 * Android-safe formatToParts path below.
 */
type CalgaryFormatArg = string | (Intl.DateTimeFormatOptions & { includeDate?: boolean });

/** Extract Calgary-timezone field values via formatToParts (Android-safe). */
function calgaryValues(d: Date) {
  const partsOf = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-US', { timeZone: CALGARY_TIMEZONE, ...opts }).formatToParts(d);
  const pick = (parts: Intl.DateTimeFormatPart[], type: string) =>
    parts.find(p => p.type === type)?.value || '';

  const timeParts = partsOf({ hour: 'numeric', minute: '2-digit', hour12: true });
  const dayPeriod = (pick(timeParts, 'dayPeriod') || 'AM').replace(/\./g, '').toUpperCase();

  return {
    hour12: pick(timeParts, 'hour') || '12',
    minute: pick(timeParts, 'minute') || '00',
    dayPeriod,
    weekdayLong: pick(partsOf({ weekday: 'long' }), 'weekday'),
    weekdayShort: pick(partsOf({ weekday: 'short' }), 'weekday'),
    monthLong: pick(partsOf({ month: 'long' }), 'month'),
    monthShort: pick(partsOf({ month: 'short' }), 'month'),
    day: pick(partsOf({ day: 'numeric' }), 'day') || '1',
    year: pick(partsOf({ year: 'numeric' }), 'year'),
  };
}

// Longest-first so multi-char tokens match before their single-char prefixes.
const TOKEN_ORDER = ['EEEE', 'EEE', 'MMMM', 'MMM', 'yyyy', 'yy', 'dd', 'hh', 'mm', 'a', 'A', 'h', 'd'];

/**
 * Render a moment/date-fns-style token pattern using Calgary-timezone values.
 * Supported tokens: EEEE/EEE (weekday), MMMM/MMM (month), yyyy/yy (year),
 * dd/d (day), hh/h (12h hour), mm (minute), a/A (AM/PM). Any other character
 * is emitted literally. All output flows through the Android-safe values above.
 */
function formatWithTokens(d: Date, pattern: string): string {
  const v = calgaryValues(d);
  const map: Record<string, string> = {
    EEEE: v.weekdayLong,
    EEE: v.weekdayShort,
    MMMM: v.monthLong,
    MMM: v.monthShort,
    yyyy: v.year,
    yy: v.year.slice(-2),
    dd: v.day.padStart(2, '0'),
    d: v.day,
    hh: v.hour12.padStart(2, '0'),
    h: v.hour12,
    mm: v.minute,
    a: v.dayPeriod,
    A: v.dayPeriod,
  };

  let out = '';
  let i = 0;
  while (i < pattern.length) {
    let matched = false;
    for (const tok of TOKEN_ORDER) {
      if (pattern.startsWith(tok, i)) {
        out += map[tok];
        i += tok.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out += pattern[i];
      i += 1;
    }
  }
  return out;
}

/**
 * Format a date/time for display in Calgary timezone.
 * Default (no arg) renders "8:30 PM" via the Android-safe manual formatter.
 */
export function formatTimeInCalgary(date: Date | string, arg?: CalgaryFormatArg): string {
  const d = typeof date === 'string' ? new Date(date) : date;

  // Token-string form (e.g. 'h:mm a', 'EEEE, MMMM d') — Android-safe path.
  if (typeof arg === 'string') {
    return formatWithTokens(d, arg);
  }

  // Custom { includeDate: true } flag — prepend the Calgary date to the time.
  if (arg && (arg as any).includeDate) {
    return formatWithTokens(d, 'MMM d, h:mm A');
  }

  // A real Intl options object — locale fallback for genuine edge cases.
  if (arg) {
    const defaultOptions: Intl.DateTimeFormatOptions = {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: CALGARY_TIMEZONE,
    };
    return d.toLocaleTimeString('en-US', { ...defaultOptions, ...arg });
  }

  // Default 12h time — manual formatter avoids the Android "A M" spacing bug.
  return formatWithTokens(d, 'h:mm A');
}

/**
 * Format a date for display in Calgary timezone. Default renders "Jul 4".
 * Accepts a token string (e.g. 'EEEE, MMMM d') or Intl options.
 */
export function formatDateInCalgary(date: Date | string, arg?: CalgaryFormatArg): string {
  const d = typeof date === 'string' ? new Date(date) : date;

  if (typeof arg === 'string') {
    return formatWithTokens(d, arg);
  }

  const defaultOptions: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    timeZone: CALGARY_TIMEZONE,
  };

  return d.toLocaleDateString('en-US', { ...defaultOptions, ...(arg || {}) });
}

/**
 * Format date and time together
 */
export function formatDateTimeInCalgary(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  
  const dateStr = formatDateInCalgary(d);
  const timeStr = formatTimeInCalgary(d);
  
  return `${dateStr}, ${timeStr}`;
}

/**
 * Get just the date portion as YYYY-MM-DD in Calgary timezone
 */
export function getDateStringInCalgary(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  
  // Get date parts in Calgary timezone
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: CALGARY_TIMEZONE,
  }).formatToParts(d);
  
  const year = parts.find(p => p.type === 'year')?.value || '';
  const month = parts.find(p => p.type === 'month')?.value || '';
  const day = parts.find(p => p.type === 'day')?.value || '';
  
  return `${year}-${month}-${day}`;
}

/**
 * Check if two dates are the same day in Calgary timezone
 */
export function isSameDayInCalgary(date1: Date | string, date2: Date | string): boolean {
  return getDateStringInCalgary(date1) === getDateStringInCalgary(date2);
}

/**
 * Get the current time in Calgary
 */
export function nowInCalgary(): Date {
  return new Date();
}

export default {
  CALGARY_TIMEZONE,
  formatTimeInCalgary,
  formatDateInCalgary,
  formatDateTimeInCalgary,
  getDateStringInCalgary,
  isSameDayInCalgary,
  nowInCalgary,
};

