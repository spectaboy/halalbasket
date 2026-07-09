// Dynamic Expo config. Reads static values from app.json and injects the
// public Mapbox token from EXPO_PUBLIC_MAPBOX_TOKEN at build time so the token
// is never committed to source control.
const appJson = require('./app.json');

module.exports = () => ({
  ...appJson.expo,
  extra: {
    ...appJson.expo.extra,
    mapboxAccessToken: process.env.EXPO_PUBLIC_MAPBOX_TOKEN || '',
  },
});
