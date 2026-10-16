// Dynamic Expo config. Extends the static values from app.json and injects the
// public Mapbox token from EXPO_PUBLIC_MAPBOX_TOKEN at build time so the token
// is never committed to source control.
//
// EXPO_GO_UPDATE=1 publishes an EAS Update that Expo Go can open: Expo Go only
// loads updates whose runtime version is `exposdk:<sdk>`, while real builds keep
// the fixed runtimeVersion from app.json.
const expoSdk = `${require('expo/package.json').version.split('.')[0]}.0.0`;

module.exports = ({ config }) => ({
  ...config,
  ...(process.env.EXPO_GO_UPDATE === '1' && { runtimeVersion: `exposdk:${expoSdk}` }),
  extra: {
    ...config.extra,
    mapboxAccessToken: process.env.EXPO_PUBLIC_MAPBOX_TOKEN || '',
  },
});
