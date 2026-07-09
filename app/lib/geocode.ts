import { MAPBOX_ACCESS_TOKEN, MAPBOX_API, MAPBOX_DEFAULTS } from '../config/mapbox';

interface GeocodingResult {
  lat: number;
  lng: number;
  placeName?: string;
  address?: string;
}

interface PlaceSearchResult {
  id: string;
  name: string;
  address: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  placeType: string;
}

/**
 * Forward geocode: Convert an address/place name to coordinates
 * Uses Mapbox Geocoding API
 */
export async function geocodePlace(text: string): Promise<GeocodingResult | null> {
  console.log('🗺️ [Geocode] Forward geocoding:', text);
  try {
    const encodedText = encodeURIComponent(text);
    
    // Build URL with Calgary proximity for better local results
    const url = `${MAPBOX_API.geocoding}/${encodedText}.json?` +
      `access_token=${MAPBOX_ACCESS_TOKEN}` +
      `&country=${MAPBOX_DEFAULTS.country}` +
      `&language=${MAPBOX_DEFAULTS.language}` +
      `&proximity=${MAPBOX_DEFAULTS.initialRegion.longitude},${MAPBOX_DEFAULTS.initialRegion.latitude}` +
      `&limit=1`;
    
    console.log('🗺️ [Geocode] Fetching from Mapbox...');
    const res = await fetch(url);
    const json = await res.json();
    
    console.log('🗺️ [Geocode] Response:', { 
      hasFeatures: !!(json.features && json.features.length > 0),
      featureCount: json.features?.length || 0,
      message: json.message || null
    });
    
    if (json.features && json.features.length > 0) {
      const feature = json.features[0];
      const [lng, lat] = feature.center;
      
      const result = {
        lat,
        lng,
        placeName: feature.place_name,
        address: feature.properties?.address || feature.place_name,
      };
      console.log('🗺️ [Geocode] ✅ Result:', { lat, lng, placeName: result.placeName?.substring(0, 50) });
      return result;
    }
    console.log('🗺️ [Geocode] ⚠️ No results found for:', text);
  } catch (error) {
    console.error('🗺️ [Geocode] ❌ Forward geocoding failed:', error);
  }
  return null;
}

/**
 * Reverse geocode: Convert coordinates to an address
 * Uses Mapbox Geocoding API
 */
export async function reverseGeocode(lat: number, lng: number): Promise<GeocodingResult | null> {
  try {
    const url = `${MAPBOX_API.geocoding}/${lng},${lat}.json?` +
      `access_token=${MAPBOX_ACCESS_TOKEN}` +
      `&language=${MAPBOX_DEFAULTS.language}` +
      `&types=address,poi,place` +
      `&limit=1`;
    
    const res = await fetch(url);
    const json = await res.json();
    
    if (json.features && json.features.length > 0) {
      const feature = json.features[0];
      
      return {
        lat,
        lng,
        placeName: feature.place_name,
        address: feature.properties?.address || feature.place_name,
      };
    }
  } catch (error) {
    console.error('🗺️ Geocode: Reverse geocoding failed', error);
  }
  return null;
}

/**
 * Search for places with autocomplete suggestions
 * Uses Mapbox Search Box API for better results
 * 
 * IMPORTANT: The /suggest endpoint does NOT return coordinates!
 * You MUST call getPlaceDetails() after user selects a suggestion.
 */
export async function searchPlaces(
  query: string, 
  options?: {
    limit?: number;
    types?: string[];
    proximity?: { lat: number; lng: number };
  }
): Promise<PlaceSearchResult[]> {
  try {
    if (!query || query.length < 2) return [];
    
    const encodedQuery = encodeURIComponent(query);
    const limit = options?.limit || 5;
    const proximity = options?.proximity
      ? { longitude: options.proximity.lng, latitude: options.proximity.lat }
      : MAPBOX_DEFAULTS.initialRegion;
    
    // Use cached session token (same token must be used for /suggest and /retrieve)
    const sessionToken = getSessionToken();
    
    // Use Search Box API for better autocomplete
    const url = `${MAPBOX_API.searchBox}/suggest?` +
      `q=${encodedQuery}` +
      `&access_token=${MAPBOX_ACCESS_TOKEN}` +
      `&session_token=${sessionToken}` +
      `&language=${MAPBOX_DEFAULTS.language}` +
      `&country=${MAPBOX_DEFAULTS.country}` +
      `&proximity=${proximity.longitude},${proximity.latitude}` +
      `&limit=${limit}`;
    
    const res = await fetch(url);
    const json = await res.json();
    
    if (json.suggestions && json.suggestions.length > 0) {
      return json.suggestions.map((suggestion: any) => ({
        id: suggestion.mapbox_id,
        name: suggestion.name,
        address: suggestion.full_address || suggestion.place_formatted || suggestion.name,
        // NOTE: Coordinates from /suggest are often 0,0 or undefined!
        // Always call getPlaceDetails() to get actual coordinates
        coordinates: {
          lat: suggestion.feature?.geometry?.coordinates?.[1] || 0,
          lng: suggestion.feature?.geometry?.coordinates?.[0] || 0,
        },
        placeType: suggestion.feature_type || 'place',
      }));
    }
  } catch (error) {
    console.error('🗺️ Search: Place search failed', error);
  }
  return [];
}

/**
 * Retrieve full place details from a Mapbox place ID
 * Used after selecting a search suggestion to get actual coordinates
 * 
 * MUST be called after searchPlaces() to get coordinates!
 * Uses same session token as searchPlaces() for billing optimization.
 */
export async function getPlaceDetails(mapboxId: string): Promise<GeocodingResult | null> {
  try {
    // Use same session token as /suggest for Mapbox billing optimization
    const sessionToken = getSessionToken();
    
    console.log('🗺️ [Geocode] Retrieving place details for:', mapboxId);
    
    const url = `${MAPBOX_API.searchBox}/retrieve/${mapboxId}?` +
      `access_token=${MAPBOX_ACCESS_TOKEN}` +
      `&session_token=${sessionToken}`;
    
    const res = await fetch(url);
    const json = await res.json();
    
    if (json.features && json.features.length > 0) {
      const feature = json.features[0];
      const [lng, lat] = feature.geometry.coordinates;
      
      console.log('🗺️ [Geocode] ✅ Retrieved coordinates:', { lat, lng });
      
      return {
        lat,
        lng,
        placeName: feature.properties?.name,
        address: feature.properties?.full_address || feature.properties?.place_formatted,
      };
    }
    
    console.warn('🗺️ [Geocode] ⚠️ No features in retrieve response for:', mapboxId);
  } catch (error) {
    console.error('🗺️ [Geocode] ❌ Place details retrieval failed:', error);
  }
  return null;
}

/**
 * Search for places using the standard geocoding API (fallback)
 * More reliable but less autocomplete-friendly
 */
export async function geocodeSearch(
  query: string,
  options?: {
    limit?: number;
    types?: string;
    bbox?: [number, number, number, number];
  }
): Promise<PlaceSearchResult[]> {
  try {
    if (!query || query.length < 2) return [];
    
    const encodedQuery = encodeURIComponent(query);
    const limit = options?.limit || 5;
    
    let url = `${MAPBOX_API.geocoding}/${encodedQuery}.json?` +
      `access_token=${MAPBOX_ACCESS_TOKEN}` +
      `&country=${MAPBOX_DEFAULTS.country}` +
      `&language=${MAPBOX_DEFAULTS.language}` +
      `&proximity=${MAPBOX_DEFAULTS.initialRegion.longitude},${MAPBOX_DEFAULTS.initialRegion.latitude}` +
      `&limit=${limit}`;
    
    if (options?.types) {
      url += `&types=${options.types}`;
    }
    
    if (options?.bbox) {
      url += `&bbox=${options.bbox.join(',')}`;
    }
    
    const res = await fetch(url);
    const json = await res.json();
    
    if (json.features && json.features.length > 0) {
      return json.features.map((feature: any) => ({
        id: feature.id,
        name: feature.text,
        address: feature.place_name,
        coordinates: {
          lat: feature.center[1],
          lng: feature.center[0],
        },
        placeType: feature.place_type?.[0] || 'place',
      }));
    }
  } catch (error) {
    console.error('🗺️ Geocode: Search failed', error);
  }
  return [];
}

/**
 * Generate a random session token for Mapbox Search API
 * Helps with billing optimization
 */
function generateSessionToken(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Session token cache (reuse for autocomplete sessions)
let _sessionToken: string | null = null;
let _sessionTokenExpiry: number = 0;

/**
 * Get or create a session token (expires after 60 seconds of inactivity)
 */
export function getSessionToken(): string {
  const now = Date.now();
  if (!_sessionToken || now > _sessionTokenExpiry) {
    _sessionToken = generateSessionToken();
  }
  _sessionTokenExpiry = now + 60000; // Extend by 60 seconds
  return _sessionToken;
}

/**
 * Clear session token (call when autocomplete session ends)
 */
export function clearSessionToken(): void {
  _sessionToken = null;
  _sessionTokenExpiry = 0;
}

/**
 * Alias for geocodePlace - forward geocode an address to coordinates
 */
export const forwardGeocode = geocodePlace;