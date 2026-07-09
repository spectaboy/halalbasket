// Shared geography point parser
// Handles WKB hex (PostGIS binary), WKT POINT(), and GeoJSON formats

export interface GeoCoordinates {
  latitude: number;
  longitude: number;
}

/**
 * Parse a geography point from various formats returned by Supabase/PostGIS:
 * - WKB hex: "0101000020E6100000..."
 * - WKT: "POINT(lng lat)" or "SRID=4326;POINT(lng lat)"
 * - GeoJSON: { type: "Point", coordinates: [lng, lat] }
 */
export function parseGeographyPoint(point: string | any): GeoCoordinates | null {
  if (!point) return null;

  if (typeof point === 'string') {
    // WKB hex format (e.g. "0101000020E6100000...")
    if (/^[0-9a-fA-F]+$/.test(point) && point.length >= 42) {
      return parseWKBPoint(point);
    }
    // WKT: POINT(lng lat) or SRID=4326;POINT(lng lat)
    const cleaned = point.replace(/^SRID=\d+;/, '');
    const m = cleaned.match(/POINT\(([^ ]+) ([^)]+)\)/);
    if (m) return { longitude: parseFloat(m[1]), latitude: parseFloat(m[2]) };
  }

  // GeoJSON object
  if (point?.coordinates && Array.isArray(point.coordinates)) {
    return { longitude: point.coordinates[0], latitude: point.coordinates[1] };
  }

  return null;
}

function parseWKBPoint(hex: string): GeoCoordinates | null {
  try {
    if (hex.length < 42 || !hex.startsWith('01')) return null;
    const typeBytes = hex.substring(2, 10);
    let coordStart: number;
    if (typeBytes === '01000020') {
      coordStart = 18; // with SRID
    } else if (typeBytes === '01000000') {
      coordStart = 10; // without SRID
    } else {
      return null;
    }
    const x = hexToDouble(hex.substring(coordStart, coordStart + 16));
    const y = hexToDouble(hex.substring(coordStart + 16, coordStart + 32));
    if (isNaN(x) || isNaN(y)) return null;
    return { longitude: x, latitude: y };
  } catch {
    return null;
  }
}

function hexToDouble(hex: string): number {
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substring(i, i + 2), 16));
  }
  bytes.reverse();
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  for (let i = 0; i < 8; i++) {
    view.setUint8(i, bytes[i] || 0);
  }
  return view.getFloat64(0);
}
