import { MAPBOX_ACCESS_TOKEN, MAPBOX_API, MAPBOX_PROFILES } from '../config/mapbox';

interface DirectionsResult {
  /** Encoded polyline (Mapbox format - precision 5) */
  encodedPolyline: string;
  /** PostGIS LINESTRING format for storage */
  postgisLineString: string;
  /** Estimated duration in minutes */
  durationMins: number;
  /** Distance in kilometers */
  distanceKm: number;
  /** GeoJSON coordinates array for rendering */
  coordinates: Array<[number, number]>;
}

interface MultiRouteResult {
  /** Primary (fastest) route */
  primary: DirectionsResult;
  /** Alternative route if within 5 mins of primary (null if none) */
  alternative: DirectionsResult | null;
}

/**
 * Decode a Mapbox/Google encoded polyline to coordinates
 * Both use the same algorithm with precision 5
 * @param encoded The encoded polyline string
 * @param precision Coordinate precision (5 for Mapbox, 6 for some services)
 */
function decodePolyline(encoded: string, precision: number = 5): Array<{ lat: number; lng: number }> {
  const points: Array<{ lat: number; lng: number }> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const factor = Math.pow(10, precision);

  while (index < encoded.length) {
    // Decode latitude
    let shift = 0;
    let result = 0;
    let byte: number;
    
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    
    const deltaLat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += deltaLat;

    // Decode longitude
    shift = 0;
    result = 0;
    
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    
    const deltaLng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += deltaLng;

    points.push({
      lat: lat / factor,
      lng: lng / factor,
    });
  }

  return points;
}

/**
 * Convert decoded polyline points to PostGIS LINESTRING format
 * Format: SRID=4326;LINESTRING(lng1 lat1, lng2 lat2, ...)
 */
function toPostgisLineString(points: Array<{ lat: number; lng: number }>): string {
  if (points.length < 2) {
    throw new Error('LineString requires at least 2 points');
  }
  
  const coordString = points
    .map(p => `${p.lng} ${p.lat}`)
    .join(', ');
  
  return `SRID=4326;LINESTRING(${coordString})`;
}

/**
 * Convert GeoJSON coordinates [lng, lat][] to our format
 */
function geoJsonToPoints(coordinates: Array<[number, number]>): Array<{ lat: number; lng: number }> {
  return coordinates.map(([lng, lat]) => ({ lat, lng }));
}

/**
 * Convert points to GeoJSON coordinates format [lng, lat][]
 */
function pointsToGeoJson(points: Array<{ lat: number; lng: number }>): Array<[number, number]> {
  return points.map(p => [p.lng, p.lat]);
}

/** Maximum duration difference (in minutes) for alternative route to be considered */
const MAX_ALT_ROUTE_DIFF_MINS = 5;

/**
 * Parse a single route from Mapbox Directions response
 */
function parseRoute(route: any): DirectionsResult | null {
  const geometry = route.geometry;
  
  if (!geometry) return null;
  
  // Mapbox returns geometry as encoded polyline string when geometries=polyline
  // or as GeoJSON when geometries=geojson
  let points: Array<{ lat: number; lng: number }>;
  let coordinates: Array<[number, number]>;
  let encodedPolyline: string;
  
  if (typeof geometry === 'string') {
    // Encoded polyline format
    encodedPolyline = geometry;
    points = decodePolyline(geometry);
    coordinates = pointsToGeoJson(points);
  } else if (geometry.coordinates) {
    // GeoJSON format
    coordinates = geometry.coordinates;
    points = geoJsonToPoints(coordinates);
    // Re-encode for storage (optional, can store GeoJSON instead)
    encodedPolyline = encodePolyline(points);
  } else {
    return null;
  }
  
  const postgisLineString = toPostgisLineString(points);
  
  // Duration is in seconds, distance is in meters from Mapbox
  return {
    encodedPolyline,
    postgisLineString,
    durationMins: Math.round(route.duration / 60),
    distanceKm: route.distance / 1000,
    coordinates,
  };
}

/**
 * Encode coordinates to polyline format
 */
function encodePolyline(points: Array<{ lat: number; lng: number }>, precision: number = 5): string {
  const factor = Math.pow(10, precision);
  let output = '';
  let prevLat = 0;
  let prevLng = 0;

  for (const point of points) {
    const lat = Math.round(point.lat * factor);
    const lng = Math.round(point.lng * factor);

    output += encodeNumber(lat - prevLat);
    output += encodeNumber(lng - prevLng);

    prevLat = lat;
    prevLng = lng;
  }

  return output;
}

function encodeNumber(num: number): string {
  let encoded = '';
  let value = num < 0 ? ~(num << 1) : (num << 1);

  while (value >= 0x20) {
    encoded += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
    value >>= 5;
  }

  encoded += String.fromCharCode(value + 63);
  return encoded;
}

/**
 * Fetch driving directions from Mapbox Directions API and return route data
 * for storage in PostGIS. Returns up to 2 routes if alternatives are viable.
 */
export async function getRoutesForStorage(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): Promise<MultiRouteResult | null> {
  try {
    // Mapbox uses lng,lat format
    const coordinates = `${fromLng},${fromLat};${toLng},${toLat}`;
    
    console.log('🗺️ Directions: Fetching routes with alternatives (Mapbox)', { 
      from: `${fromLat},${fromLng}`,
      to: `${toLat},${toLng}`
    });
    
    // Use driving-traffic profile for real-time traffic
    const profile = MAPBOX_PROFILES.drivingTraffic;
    
    const url = `${MAPBOX_API.directions}/${profile}/${coordinates}?` +
      `access_token=${MAPBOX_ACCESS_TOKEN}` +
      `&alternatives=true` +           // Request alternative routes
      `&geometries=polyline` +         // Get encoded polyline
      `&overview=full` +               // Full route geometry
      `&steps=false` +                 // Don't need turn-by-turn for storage
      `&annotations=duration,distance`; // Include timing data
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.code !== 'Ok' || !data.routes?.[0]) {
      console.error('🗺️ Directions: API error', { 
        code: data.code, 
        message: data.message 
      });
      return null;
    }
    
    // Parse all routes
    const parsedRoutes: DirectionsResult[] = [];
    for (const route of data.routes) {
      const parsed = parseRoute(route);
      if (parsed) parsedRoutes.push(parsed);
    }
    
    if (parsedRoutes.length === 0) {
      console.error('🗺️ Directions: No valid routes found');
      return null;
    }
    
    // Sort by duration (fastest first) - Mapbox usually returns sorted
    parsedRoutes.sort((a, b) => a.durationMins - b.durationMins);
    
    const primary = parsedRoutes[0];
    
    // Log all routes for debugging
    console.log('🗺️ Directions: All routes from Mapbox', {
      routeCount: parsedRoutes.length,
      routes: parsedRoutes.map((r, i) => ({
        index: i,
        duration: `${r.durationMins} min`,
        distance: `${r.distanceKm.toFixed(1)} km`,
      }))
    });
    
    // Find first alternative that's within 5 mins of primary
    let alternative: DirectionsResult | null = null;
    let rejectionReason: string | null = null;
    
    for (let i = 1; i < parsedRoutes.length; i++) {
      const altRoute = parsedRoutes[i];
      const timeDiff = altRoute.durationMins - primary.durationMins;
      
      if (timeDiff <= MAX_ALT_ROUTE_DIFF_MINS) {
        alternative = altRoute;
        console.log(`🗺️ Directions: Route ${i} ACCEPTED as alternative`, {
          timeDiff: `${timeDiff} min`,
          duration: `${altRoute.durationMins} min`,
          distance: `${altRoute.distanceKm.toFixed(1)} km`,
        });
        break;
      } else {
        rejectionReason = `Route ${i} too slow (+${timeDiff} min)`;
        console.log(`🗺️ Directions: Route ${i} too slow`, {
          timeDiff: `${timeDiff} min`,
          maxAllowed: `${MAX_ALT_ROUTE_DIFF_MINS} min`,
        });
        break;
      }
    }
    
    console.log('🗺️ Directions: Routes processed', { 
      totalRoutes: data.routes.length,
      primaryDuration: `${primary.durationMins} min`,
      primaryDistance: `${primary.distanceKm.toFixed(1)} km`,
      hasAlternative: !!alternative,
      alternativeDuration: alternative ? `${alternative.durationMins} min` : null,
      alternativeDistance: alternative ? `${alternative.distanceKm.toFixed(1)} km` : null,
      rejectionReason: !alternative ? rejectionReason : null,
    });
    
    return { primary, alternative };
  } catch (error) {
    console.error('🗺️ Directions: Failed to fetch routes', error);
    return null;
  }
}

/**
 * Fetch driving directions from Mapbox Directions API and return route data
 * for storage in PostGIS (single route - backwards compatible)
 */
export async function getRouteForStorage(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): Promise<DirectionsResult | null> {
  const result = await getRoutesForStorage(fromLat, fromLng, toLat, toLng);
  return result?.primary || null;
}

/**
 * Get route coordinates for map display (simplified for UI)
 */
export async function getRouteCoordinates(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): Promise<Array<[number, number]> | null> {
  const result = await getRouteForStorage(fromLat, fromLng, toLat, toLng);
  return result?.coordinates || null;
}

/**
 * Get route with full details (coordinates, ETA, distance)
 * Useful for displaying trip info during a ride
 */
export async function getRouteWithDetails(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): Promise<{
  coordinates: Array<[number, number]>;
  etaMinutes: number;
  distanceKm: number;
} | null> {
  // Guard against invalid/sentinel coords (0,0 or NaN / out of range). These
  // make the Mapbox Directions API return {code: "InvalidInput"}. Callers on
  // the live-ride screens sometimes pass a not-yet-known driver location.
  const valid = (lat: number, lng: number) =>
    Number.isFinite(lat) && Number.isFinite(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0);
  if (!valid(fromLat, fromLng) || !valid(toLat, toLng)) {
    return null;
  }

  const result = await getRouteForStorage(fromLat, fromLng, toLat, toLng);
  if (!result) return null;
  
  return {
    coordinates: result.coordinates,
    etaMinutes: result.durationMins,
    distanceKm: result.distanceKm,
  };
}

/**
 * Simplify a polyline by reducing the number of points
 * Useful to reduce storage size while maintaining route shape
 * Uses Ramer-Douglas-Peucker algorithm
 */
export function simplifyPolyline(
  points: Array<{ lat: number; lng: number }>,
  tolerance: number = 0.0001 // ~10m at equator
): Array<{ lat: number; lng: number }> {
  if (points.length < 3) return points;

  // Find the point with the maximum distance from the line
  let maxDist = 0;
  let maxIndex = 0;

  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], first, last);
    if (dist > maxDist) {
      maxDist = dist;
      maxIndex = i;
    }
  }

  // If max distance is greater than tolerance, recursively simplify
  if (maxDist > tolerance) {
    const left = simplifyPolyline(points.slice(0, maxIndex + 1), tolerance);
    const right = simplifyPolyline(points.slice(maxIndex), tolerance);
    return [...left.slice(0, -1), ...right];
  }

  // Otherwise, return just the endpoints
  return [first, last];
}

function perpendicularDistance(
  point: { lat: number; lng: number },
  lineStart: { lat: number; lng: number },
  lineEnd: { lat: number; lng: number }
): number {
  const dx = lineEnd.lng - lineStart.lng;
  const dy = lineEnd.lat - lineStart.lat;

  if (dx === 0 && dy === 0) {
    return Math.sqrt(
      Math.pow(point.lng - lineStart.lng, 2) +
      Math.pow(point.lat - lineStart.lat, 2)
    );
  }

  const t = Math.max(0, Math.min(1,
    ((point.lng - lineStart.lng) * dx + (point.lat - lineStart.lat) * dy) /
    (dx * dx + dy * dy)
  ));

  const nearestLng = lineStart.lng + t * dx;
  const nearestLat = lineStart.lat + t * dy;

  return Math.sqrt(
    Math.pow(point.lng - nearestLng, 2) +
    Math.pow(point.lat - nearestLat, 2)
  );
}

/**
 * Get a route through multiple waypoints (for multi-passenger pickup).
 * Waypoints must be in the desired visit order:
 *   [driver_origin, pickup1, pickup2, ..., driver_destination]
 * Returns the full stitched route polyline and totals.
 */
export async function getMultiStopRoute(
  waypoints: Array<{ lat: number; lng: number }>
): Promise<{ coordinates: Array<[number, number]>; totalMinutes: number; totalKm: number } | null> {
  if (waypoints.length < 2) return null;

  try {
    // Mapbox uses lng,lat order
    const coordsString = waypoints.map(w => `${w.lng},${w.lat}`).join(';');
    const profile = MAPBOX_PROFILES.drivingTraffic;

    const url =
      `${MAPBOX_API.directions}/${profile}/${coordsString}?` +
      `access_token=${MAPBOX_ACCESS_TOKEN}` +
      `&alternatives=false` +
      `&geometries=polyline` +
      `&overview=full` +
      `&steps=false`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.code !== 'Ok' || !data.routes?.[0]) {
      console.error('[getMultiStopRoute] Mapbox error:', data.code, data.message);
      return null;
    }

    const route = parseRoute(data.routes[0]);
    if (!route) return null;

    return {
      coordinates: route.coordinates,
      totalMinutes: route.durationMins,
      totalKm: route.distanceKm,
    };
  } catch (error) {
    console.error('[getMultiStopRoute] Failed:', error);
    return null;
  }
}

/**
 * Sort pickup locations by their position along a route polyline.
 * Returns the input array reordered so that stops follow the polyline progression.
 * Falls back to haversine sort from origin if no polyline is provided.
 */
export function sortWaypointsByRouteOrder<T extends { lat: number; lng: number }>(
  origin: { lat: number; lng: number },
  stops: T[],
  routeCoords?: Array<[number, number]>
): T[] {
  if (stops.length <= 1) return stops;

  if (routeCoords && routeCoords.length > 1) {
    // Find each stop's nearest index on the polyline and sort by that index
    const withIndex = stops.map(stop => {
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < routeCoords.length; i++) {
        const [lng, lat] = routeCoords[i];
        const d = haversineSimple(stop.lat, stop.lng, lat, lng);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      return { stop, idx: bestIdx };
    });
    withIndex.sort((a, b) => a.idx - b.idx);
    return withIndex.map(x => x.stop);
  }

  // Fallback: sort by haversine distance from origin
  return [...stops].sort((a, b) => {
    const dA = haversineSimple(origin.lat, origin.lng, a.lat, a.lng);
    const dB = haversineSimple(origin.lat, origin.lng, b.lat, b.lng);
    return dA - dB;
  });
}

function haversineSimple(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export { decodePolyline, toPostgisLineString, pointsToGeoJson, geoJsonToPoints };
