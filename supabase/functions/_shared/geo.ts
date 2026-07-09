// Shared geography utilities for URide edge functions
// Handles WKB hex, WKT, GeoJSON point parsing and haversine distance

export function hexToDouble(hex: string): number {
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

export function parseWKBPoint(hex: string): { lat: number; lng: number } | null {
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
    return { lng: x, lat: y };
  } catch {
    return null;
  }
}

export function parseGeographyPoint(point: unknown): { lat: number; lng: number } | null {
  if (!point) return null;

  if (typeof point === 'string') {
    if (/^[0-9a-fA-F]+$/.test(point) && point.length >= 42) {
      return parseWKBPoint(point);
    }
    const cleaned = point.replace(/^SRID=\d+;/, '');
    const m = cleaned.match(/POINT\(([^ ]+) ([^)]+)\)/);
    if (m) return { lng: parseFloat(m[1]), lat: parseFloat(m[2]) };
  }

  const obj = point as any;
  if (obj?.coordinates && Array.isArray(obj.coordinates)) {
    return { lng: obj.coordinates[0], lat: obj.coordinates[1] };
  }
  if (obj?.type === 'Point' && obj?.coordinates) {
    return { lng: obj.coordinates[0], lat: obj.coordinates[1] };
  }

  return null;
}

// ============================================================================
// MVP CORE DESTINATION — University of Calgary (hardcoded)
// Every ride/request drops off at campus for the MVP. This is the single
// source of truth on the backend; client mirrors it in constants/campus.ts.
// ============================================================================
export const CAMPUS = {
  name: "University of Calgary",
  address: "2500 University Dr NW, Calgary, AB T2N 1N4",
  lat: 51.0776,
  lng: -114.1303,
  // "close enough to count as campus" tolerance for the dropoff filter
  radiusMeters: 4000,
} as const;

/** True if a point is within CAMPUS.radiusMeters of campus. */
export function isAtCampus(lat: number, lng: number): boolean {
  return haversineDistanceMeters(lat, lng, CAMPUS.lat, CAMPUS.lng) <= CAMPUS.radiusMeters;
}

// A real corridor trip locks one endpoint to campus. 1500 m covers the actual
// campus footprint — parkades, drop-off zones, and residences sit up to ~1.5 km
// from the centroid, and geocoded/seeded/legacy endpoints land there too.
// This only widens which trips COUNT as corridor trips; direction itself is
// still decided by which endpoint is closer to campus (dTo <= dFrom), so
// widening cannot flip a true to-campus trip into from-campus.
export const CAMPUS_MATCH_METERS = 1500;

export type RideDirection = "to_campus" | "from_campus" | "other";

/**
 * Commuter-corridor model: every trip is home <-> campus. Direction is inferred
 * from which endpoint is CLOSER to campus (one end is exactly campus, so this is
 * unambiguous even when the home end is itself within a few km of campus — a
 * plain isAtCampus() check on both ends would be ambiguous there).
 */
export function directionOf(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
): RideDirection {
  const dFrom = haversineDistanceMeters(fromLat, fromLng, CAMPUS.lat, CAMPUS.lng);
  const dTo = haversineDistanceMeters(toLat, toLng, CAMPUS.lat, CAMPUS.lng);
  // Neither end is genuinely AT campus -> not a corridor trip.
  if (Math.min(dFrom, dTo) > CAMPUS_MATCH_METERS) return "other";
  return dTo <= dFrom ? "to_campus" : "from_campus";
}

/**
 * The non-campus ("home") end of a trip — the endpoint FARTHER from campus.
 * Corridor + notify targeting keys off this point.
 */
export function homeEndOf(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
): { lat: number; lng: number } {
  const dFrom = haversineDistanceMeters(fromLat, fromLng, CAMPUS.lat, CAMPUS.lng);
  const dTo = haversineDistanceMeters(toLat, toLng, CAMPUS.lat, CAMPUS.lng);
  // Home is the endpoint FARTHER from campus. On an exact tie, break
  // deterministically (lat then lng) so A->B and B->A resolve to the SAME
  // home end regardless of argument order.
  let fromIsHome: boolean;
  if (dFrom !== dTo) {
    fromIsHome = dFrom > dTo;
  } else if (fromLat !== toLat) {
    fromIsHome = fromLat > toLat;
  } else {
    fromIsHome = fromLng >= toLng;
  }
  return fromIsHome
    ? { lat: fromLat, lng: fromLng } // from_campus -> pickup is home
    : { lat: toLat, lng: toLng };    // to_campus -> dropoff is home
}

export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// ============================================================================
// ROUTE / POLYLINE GEOMETRY
// Shared corridor model so rider SEARCH (search-rides) and post-ride NOTIFY
// (match-ride-to-requests) use the SAME "distance from home end to the driver's
// route" test instead of drifting (search = route-corridor, notify was
// endpoint-to-endpoint). See F32.
// ============================================================================

/** Decode a Google/Mapbox encoded polyline string to lat/lng coordinates. */
export function decodePolyline(
  encoded: string,
): Array<{ lat: number; lng: number }> {
  const points: Array<{ lat: number; lng: number }> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;
}

/** Perpendicular distance (meters) from a point to a line segment. */
function pointToSegmentDistanceMeters(
  pointLat: number,
  pointLng: number,
  segStartLat: number,
  segStartLng: number,
  segEndLat: number,
  segEndLng: number,
): number {
  const segDx = segEndLng - segStartLng;
  const segDy = segEndLat - segStartLat;
  const segLengthSquared = segDx * segDx + segDy * segDy;

  if (segLengthSquared === 0) {
    return haversineDistanceMeters(pointLat, pointLng, segStartLat, segStartLng);
  }

  const dx = pointLng - segStartLng;
  const dy = pointLat - segStartLat;
  const t = Math.max(0, Math.min(1, (dx * segDx + dy * segDy) / segLengthSquared));

  const closestLng = segStartLng + t * segDx;
  const closestLat = segStartLat + t * segDy;

  return haversineDistanceMeters(pointLat, pointLng, closestLat, closestLng);
}

/** Minimum distance (meters) from a point to any segment of a polyline route. */
export function minDistanceToRoute(
  pointLat: number,
  pointLng: number,
  routePoints: Array<{ lat: number; lng: number }>,
): number {
  let minDistance = Infinity;

  for (let i = 0; i < routePoints.length - 1; i++) {
    const segmentStart = routePoints[i];
    const segmentEnd = routePoints[i + 1];
    const distance = pointToSegmentDistanceMeters(
      pointLat,
      pointLng,
      segmentStart.lat,
      segmentStart.lng,
      segmentEnd.lat,
      segmentEnd.lng,
    );
    if (distance < minDistance) {
      minDistance = distance;
    }
  }

  return minDistance;
}

/**
 * Decode a ride's stored route geometry into points, or null if none is
 * parseable. Prefers the encoded polyline, falls back to a PostGIS
 * LINESTRING text. Logger-free so it can be shared across edge functions.
 */
export function routePointsFromRide(
  ride: { route_polyline?: unknown; route_line?: unknown },
): Array<{ lat: number; lng: number }> | null {
  if (ride.route_polyline && typeof ride.route_polyline === "string") {
    try {
      const points = decodePolyline(ride.route_polyline);
      if (points.length >= 2) return points;
    } catch {
      // fall through to LINESTRING
    }
  }

  if (ride.route_line && typeof ride.route_line === "string") {
    const match = ride.route_line.match(/(?:SRID=4326;)?LINESTRING\(([^)]+)\)/);
    if (match) {
      const points: Array<{ lat: number; lng: number }> = [];
      for (const pair of match[1].split(",")) {
        const [lng, lat] = pair.trim().split(" ").map(Number);
        if (!isNaN(lng) && !isNaN(lat)) points.push({ lat, lng });
      }
      if (points.length >= 2) return points;
    }
  }

  return null;
}
