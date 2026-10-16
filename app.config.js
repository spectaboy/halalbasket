// Dynamic Expo config. Extends the static values from app.json and injects the
// public Mapbox token from EXPO_PUBLIC_MAPBOX_TOKEN at build time so the token
// is never committed to source control.
module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    mapboxAccessToken: process.env.EXPO_PUBLIC_MAPBOX_TOKEN || '',
  },
});
