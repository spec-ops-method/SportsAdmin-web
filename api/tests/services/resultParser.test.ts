import { parseResult, isAscUnit } from '../../src/services/resultParser';

describe('isAscUnit', () => {
  it('returns true for Seconds', () => expect(isAscUnit('Seconds')).toBe(true));
  it('returns true for Minutes', () => expect(isAscUnit('Minutes')).toBe(true));
  it('returns true for Hours', () => expect(isAscUnit('Hours')).toBe(true));
  it('returns false for Meters', () => expect(isAscUnit('Meters')).toBe(false));
  it('returns false for Kilometers', () => expect(isAscUnit('Kilometers')).toBe(false));
  it('returns false for Points', () => expect(isAscUnit('Points')).toBe(false));
  it('returns false for seconds (lowercase)', () => expect(isAscUnit('seconds')).toBe(false));
});

describe('parseResult', () => {
  // ─── Seconds tests ────────────────────────────────────────────────────────

  it('SECS: "12" → { formatted: "12.00", numeric: 12.0 }', () => {
    const r = parseResult('12', 'Seconds');
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.formatted).toBe('12.00');
      expect(r.numeric).toBeCloseTo(12.0);
    }
  });

  it('SECS: "1:05.23" → { formatted: "1:05.23", numeric: 65.23 }', () => {
    const r = parseResult('1:05.23', 'Seconds');
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.formatted).toBe('1:05.23');
      expect(r.numeric).toBeCloseTo(65.23);
    }
  });

  it('SECS: "1:30:05.23" → { formatted: "1:30:05.23", numeric: 5405.23 }', () => {
    const r = parseResult('1:30:05.23', 'Seconds');
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.formatted).toBe('1:30:05.23');
      expect(r.numeric).toBeCloseTo(5405.23);
    }
  });

  it('SECS: "59.99" stays under 60 → "59.99"', () => {
    const r = parseResult('59.99', 'Seconds');
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.formatted).toBe('59.99');
      expect(r.numeric).toBeCloseTo(59.99);
    }
  });

  // ─── Minutes tests ────────────────────────────────────────────────────────

  it('MINS: "5" → { formatted: "5:00.00", numeric: 300.0 }', () => {
    const r = parseResult('5', 'Minutes');
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.formatted).toBe('5:00.00');
      expect(r.numeric).toBeCloseTo(300.0);
    }
  });

  it('MINS: "5:30.45" → { formatted: "5:30.45", numeric: 330.45 }', () => {
    const r = parseResult('5:30.45', 'Minutes');
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.formatted).toBe('5:30.45');
      expect(r.numeric).toBeCloseTo(330.45);
    }
  });

  it('MINS: "1:05:30.00" → H:MM:SS.cc format', () => {
    const r = parseResult('1:05:30.00', 'Minutes');
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.formatted).toBe('1:05:30.00');
      expect(r.numeric).toBeCloseTo(3930.0);
    }
  });

  // ─── Hours tests ──────────────────────────────────────────────────────────

  it('HRS: "2:30" → { formatted: "2:30", numeric: 9000.0 }', () => {
    const r = parseResult('2:30', 'Hours');
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.formatted).toBe('2:30');
      expect(r.numeric).toBeCloseTo(9000.0);
    }
  });

  it('HRS: "1:30:45" → H:MM:SS format', () => {
    const r = parseResult('1:30:45', 'Hours');
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.formatted).toBe('1:30:45');
      expect(r.numeric).toBeCloseTo(5445.0);
    }
  });

  it('HRS: "1:30:45.50" → H:MM:SS.cc format', () => {
    const r = parseResult('1:30:45.50', 'Hours');
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.formatted).toBe('1:30:45.50');
      expect(r.numeric).toBeCloseTo(5445.5);
    }
  });

  // ─── Meters tests ─────────────────────────────────────────────────────────

  it('M: "5.67" → { formatted: "5.67", numeric: 5.67 }', () => {
    const r = parseResult('5.67', 'Meters');
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.formatted).toBe('5.67');
      expect(r.numeric).toBeCloseTo(5.67);
    }
  });

  it('M: "5.67m" strips suffix → { formatted: "5.67", numeric: 5.67 }', () => {
    const r = parseResult('5.67m', 'Meters');
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.formatted).toBe('5.67');
      expect(r.numeric).toBeCloseTo(5.67);
    }
  });

  // ─── Kilometers tests ─────────────────────────────────────────────────────

  it('KM: "2.5" → { formatted: "2.50", numeric: 2500.0 }', () => {
    const r = parseResult('2.5', 'Kilometers');
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.formatted).toBe('2.50');
      expect(r.numeric).toBeCloseTo(2500.0);
    }
  });

  // ─── Points tests ─────────────────────────────────────────────────────────

  it('PTS: "45" → { formatted: "45", numeric: 45.0 }', () => {
    const r = parseResult('45', 'Points');
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.formatted).toBe('45');
      expect(r.numeric).toBeCloseTo(45.0);
    }
  });

  // ─── Special values ───────────────────────────────────────────────────────

  it('Special: "F" with Seconds → FOUL ASC', () => {
    const r = parseResult('F', 'Seconds');
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.formatted).toBe('FOUL');
      expect(r.numeric).toBe(3e38);
    }
  });

  it('Special: "FOUL" with Seconds → same as F', () => {
    const r = parseResult('FOUL', 'Seconds');
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.formatted).toBe('FOUL');
      expect(r.numeric).toBe(3e38);
    }
  });

  it('Special: "foul" lowercase → FOUL', () => {
    const r = parseResult('foul', 'Seconds');
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.formatted).toBe('FOUL');
    }
  });

  it('Special: "F" with Meters → FOUL DESC (numeric = -1e38)', () => {
    const r = parseResult('F', 'Meters');
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.formatted).toBe('FOUL');
      expect(r.numeric).toBe(-1e38);
    }
  });

  it('Special: "P" with Meters → PARTICIPATE DESC', () => {
    const r = parseResult('P', 'Meters');
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.formatted).toBe('PARTICIPATE');
      expect(r.numeric).toBe(-1e38);
    }
  });

  it('Special: "P" with Seconds → PARTICIPATE ASC', () => {
    const r = parseResult('P', 'Seconds');
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.formatted).toBe('PARTICIPATE');
      expect(r.numeric).toBe(3e38);
    }
  });

  it('Special: "" → clear result (formatted=null, numeric=0)', () => {
    const r = parseResult('', 'Seconds');
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.formatted).toBeNull();
      expect(r.numeric).toBe(0);
    }
  });

  it('Special: "  " (whitespace only) → clear result', () => {
    const r = parseResult('  ', 'Seconds');
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.formatted).toBeNull();
      expect(r.numeric).toBe(0);
    }
  });

  // ─── Error cases ──────────────────────────────────────────────────────────

  it('Error: "abc" with Seconds → failure', () => {
    const r = parseResult('abc', 'Seconds');
    expect(r.success).toBe(false);
  });

  it('Error: "1:2:3:4" with Seconds → too many components', () => {
    const r = parseResult('1:2:3:4', 'Seconds');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe('Too many components');
  });

  it('Error: "1:abc" with Seconds → invalid time component', () => {
    const r = parseResult('1:abc', 'Seconds');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe('Invalid time component');
  });

  it('Error: "-5.0" with Meters → invalid (negative)', () => {
    const r = parseResult('-5.0', 'Meters');
    expect(r.success).toBe(false);
  });

  it('Error: "abc" with Meters → invalid number', () => {
    const r = parseResult('abc', 'Meters');
    expect(r.success).toBe(false);
  });

  // ─── Delimiter normalization ───────────────────────────────────────────────

  it('SECS: "1\'05.23" (apostrophe) → same as colon', () => {
    const r = parseResult("1'05.23", 'Seconds');
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.formatted).toBe('1:05.23');
    }
  });

  it('SECS: "1-05.23" (dash) → same as colon', () => {
    const r = parseResult('1-05.23', 'Seconds');
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.formatted).toBe('1:05.23');
    }
  });
});
