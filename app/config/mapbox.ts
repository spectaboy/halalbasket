// Mapbox configuration.
// Public access token is injected at build time from EXPO_PUBLIC_MAPBOX_TOKEN
// (see .env and app.config.js) so it never lives in source control.
import Constants from 'expo-constants';

export const MAPBOX_ACCESS_TOKEN =
  process.env.EXPO_PUBLIC_MAPBOX_TOKEN ||
  ((Constants.expoConfig?.extra as any)?.mapboxAccessToken as string) ||
  '';

// Secret token (for server-side only - DO NOT expose in client code)
// Use this in backend/edge functions for Mapbox API calls that require write access
export const MAPBOX_SECRET_TOKEN = process.env.MAPBOX_SECRET_TOKEN || '';

// Mapbox Styles - Beautiful map themes
export const MAPBOX_STYLES = {
  // Standard styles
  streets: 'mapbox://styles/mapbox/streets-v12',
  outdoors: 'mapbox://styles/mapbox/outdoors-v12',
  light: 'mapbox://styles/mapbox/light-v11',
  dark: 'mapbox://styles/mapbox/dark-v11',
  satellite: 'mapbox://styles/mapbox/satellite-v9',
  satelliteStreets: 'mapbox://styles/mapbox/satellite-streets-v12',
  
  // Navigation-specific styles (optimized for driving)
  navigationDay: 'mapbox://styles/mapbox/navigation-day-v1',
  navigationNight: 'mapbox://styles/mapbox/navigation-night-v1',
  
  // Default style for URide
  default: 'mapbox://styles/mapbox/streets-v12',
  defaultNight: 'mapbox://styles/mapbox/dark-v11',
};

// Mapbox API Endpoints
export const MAPBOX_API = {
  // Directions API - for route calculation
  directions: 'https://api.mapbox.com/directions/v5/mapbox',
  
  // Geocoding API - for address search and reverse geocoding
  geocoding: 'https://api.mapbox.com/geocoding/v5/mapbox.places',
  
  // Search API (newer, more accurate) - for place search
  searchBox: 'https://api.mapbox.com/search/searchbox/v1',
  
  // Static Images API - for map thumbnails
  staticImages: 'https://api.mapbox.com/styles/v1/mapbox/streets-v12/static',
  
  // Optimization API - for multi-stop route optimization
  optimization: 'https://api.mapbox.com/optimized-trips/v1/mapbox',
  
  // Matrix API - for distance/time matrices (useful for ride matching)
  matrix: 'https://api.mapbox.com/directions-matrix/v1/mapbox',
  
  // Isochrone API - for "areas reachable within X minutes"
  isochrone: 'https://api.mapbox.com/isochrone/v1/mapbox',
};

// Driving profile options
export const MAPBOX_PROFILES = {
  drivingTraffic: 'driving-traffic', // Real-time traffic routing (recommended)
  driving: 'driving',                 // Standard driving
  walking: 'walking',
  cycling: 'cycling',
};

// Map camera defaults for Calgary region
export const MAPBOX_DEFAULTS = {
  // University of Calgary coordinates
  initialRegion: {
    latitude: 51.0777,
    longitude: -114.1397,
    zoom: 14,
  },
  // Calgary bounding box for search
  bbox: [-114.2711, 50.8424, -113.8600, 51.2124] as [number, number, number, number],
  // Country restriction
  country: 'ca',
  // Language
  language: 'en',
  // Animation durations (ms)
  animationDuration: 1000,
  zoomLevel: {
    street: 17,
    neighborhood: 14,
    city: 11,
    region: 8,
  },
};

// Route line styling for URide
export const ROUTE_STYLES = {
  primary: {
    lineColor: '#4285F4',      // URide blue
    lineWidth: 6,
    lineCap: 'round' as const,
    lineJoin: 'round' as const,
  },
  alternative: {
    lineColor: '#9AA0A6',      // Grey for alternatives
    lineWidth: 4,
    lineCap: 'round' as const,
    lineJoin: 'round' as const,
  },
  active: {
    lineColor: '#00C853',      // Green for active route
    lineWidth: 7,
    lineCap: 'round' as const,
    lineJoin: 'round' as const,
  },
  completed: {
    lineColor: '#34A853',      // Darker green for completed segments
    lineWidth: 5,
    lineCap: 'round' as const,
    lineJoin: 'round' as const,
  },
};

// Marker icon configurations
export const MARKER_ANCHORS = {
  center: { x: 0.5, y: 0.5 },
  bottom: { x: 0.5, y: 1 },
  top: { x: 0.5, y: 0 },
};

// Helper function to build API URLs
export function buildMapboxUrl(
  endpoint: string,
  params: Record<string, string | number | boolean | undefined>
): string {
  const url = new URL(endpoint);
  url.searchParams.append('access_token', MAPBOX_ACCESS_TOKEN);
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      url.searchParams.append(key, String(value));
    }
  });
  
  return url.toString();
}
