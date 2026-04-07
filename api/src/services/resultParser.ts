export type ParsedResult =
  | { success: true; formatted: string; numeric: number }
  | { success: false; error: string };

export function isAscUnit(unit: string): boolean {
  return unit === 'Seconds' || unit === 'Minutes' || unit === 'Hours';
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function formatCentiseconds(totalSeconds: number): string {
  const wholeSeconds = Math.floor(totalSeconds % 60);
  const cc = Math.round((totalSeconds % 1) * 100);
  return `${pad2(wholeSeconds)}.${cc.toString().padStart(2, '0')}`;
}

function formatSeconds(totalSeconds: number, unit: string): string {
  if (unit === 'Seconds') {
    if (totalSeconds >= 60) {
      const minutes = Math.floor(totalSeconds / 60);
      return `${minutes}:${formatCentiseconds(totalSeconds)}`;
    }
    return formatCentiseconds(totalSeconds);
  }

  if (unit === 'Minutes') {
    if (totalSeconds >= 3600) {
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor(totalSeconds / 60) % 60;
      return `${hours}:${pad2(minutes)}:${formatCentiseconds(totalSeconds)}`;
    }
    const minutes = Math.floor(totalSeconds / 60);
    return `${minutes}:${formatCentiseconds(totalSeconds)}`;
  }

  // Hours unit
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const secComponent = totalSeconds % 60;
  const wholeSeconds = Math.floor(secComponent);
  const hasFractionalSeconds = secComponent % 1 !== 0;

  if (hasFractionalSeconds) {
    return `${hours}:${pad2(minutes)}:${formatCentiseconds(totalSeconds)}`;
  } else if (wholeSeconds > 0) {
    return `${hours}:${pad2(minutes)}:${pad2(wholeSeconds)}`;
  } else {
    return `${hours}:${pad2(minutes)}`;
  }
}

function parseTimeComponents(input: string, unit: string): ParsedResult {
  // Normalize delimiters
  const normalized = input.replace(/[:'"\-]/g, ':');
  const parts = normalized.split(':');

  if (parts.length > 3) {
    return { success: false, error: 'Too many components' };
  }

  // Validate each part
  for (let i = 0; i < parts.length; i++) {
    const isLast = i === parts.length - 1;
    const pattern = isLast ? /^\d+(\.\d+)?$/ : /^\d+$/;
    if (!pattern.test(parts[i])) {
      return { success: false, error: 'Invalid time component' };
    }
  }

  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  const count = parts.length;

  if (count === 1) {
    if (unit === 'Hours') {
      hours = parseFloat(parts[0]);
    } else if (unit === 'Minutes') {
      minutes = parseFloat(parts[0]);
    } else {
      // Seconds
      seconds = parseFloat(parts[0]);
    }
  } else if (count === 2) {
    if (unit === 'Hours') {
      hours = parseFloat(parts[0]);
      minutes = parseFloat(parts[1]);
    } else {
      // Seconds or Minutes: min:sec
      minutes = parseFloat(parts[0]);
      seconds = parseFloat(parts[1]);
    }
  } else {
    // 3 parts: hr:min:sec for all units
    hours = parseFloat(parts[0]);
    minutes = parseFloat(parts[1]);
    seconds = parseFloat(parts[2]);
  }

  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  const formatted = formatSeconds(totalSeconds, unit);

  return { success: true, formatted, numeric: totalSeconds };
}

export function parseResult(input: string, unit: string): ParsedResult {
  const trimmed = input.trim();
  const asc = isAscUnit(unit);

  // Empty string → clear result
  if (trimmed === '') {
    return { success: true, formatted: null as any, numeric: 0 };
  }

  // Special values: FOUL (starts with f/F)
  if (trimmed[0] === 'f' || trimmed[0] === 'F') {
    return {
      success: true,
      formatted: 'FOUL',
      numeric: asc ? 3e38 : -1e38,
    };
  }

  // Special values: PARTICIPATE (starts with p/P)
  if (trimmed[0] === 'p' || trimmed[0] === 'P') {
    return {
      success: true,
      formatted: 'PARTICIPATE',
      numeric: asc ? 3e38 : -1e38,
    };
  }

  // Time parsing (ASC units)
  if (asc) {
    return parseTimeComponents(trimmed, unit);
  }

  // Distance/Points parsing (DESC units: Meters, Kilometers, Points, etc.)
  const stripped = trimmed.replace(/[^0-9.]+$/, '');
  const value = parseFloat(stripped);

  if (isNaN(value) || value < 0) {
    return { success: false, error: 'Invalid number' };
  }

  if (unit === 'Kilometers') {
    return { success: true, formatted: value.toFixed(2), numeric: value * 1000 };
  }

  return { success: true, formatted: value.toString(), numeric: value };
}
