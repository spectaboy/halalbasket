# HalalBasket

Expo / React Native app. Entry is `index.ts` → `App.tsx`, using **react-navigation**
(not expo-router). Backend is Supabase; auth is Clerk, bridged to Supabase via
Third-Party Auth. Backend setup notes live in `docs/BACKEND_SETUP.md`.

## Expo SDK: stay on 57

The project targets **Expo SDK 57** so it runs in the Expo Go app testers have
installed. Don't upgrade the SDK unless asked. After any dependency change, run
`npx expo install --fix` so every `expo-*` package matches SDK 57.

Don't re-add `expo-router`. Since SDK 56 it refuses to bundle alongside
`@react-navigation`.

## Running on a phone (dev, needs this PC on)

```
npm run tunnel        # expo start --tunnel (uses @expo/ngrok)
```

Open the `exp://…exp.direct` URL in Expo Go. The phone loads the app from this
PC, so it stops working when the server stops.

- If `expo start` crashes with an adb `emulator-5554` error, a hung Android
  emulator is listed as `offline`. Kill the stale `emulator`/`qemu-system` process.
- If `npm install` fails with `EBUSY` in `node_modules`, Gradle/Kotlin daemons
  started by the IDE are locking files. Stop those `java` processes.

## Sharing with testers (no PC needed): EAS Update to Expo Go

Testers open the app in Expo Go from Expo's servers (branch + channel `expo-go`).
They need nothing but Expo Go, no login required.

Link to send (or make a QR code of it):

```
exp://u.expo.dev/5a0edf95-47f6-434e-81b0-eb11a83bf0b9?channel-name=expo-go&runtime-version=exposdk:57.0.0
```

Publish a new version after changes (testers get it on the next full reopen):

```
EXPO_GO_UPDATE=1 npx eas-cli update --branch expo-go --platform ios --environment preview --message "what changed" --non-interactive
```

- `EXPO_GO_UPDATE=1` makes `app.config.js` set `runtimeVersion` to
  `exposdk:57.0.0`, the only runtime Expo Go accepts. Real builds keep `1.0.0`.
- The EAS `preview` environment has no variables, so the local `.env` values
  (public Clerk/Supabase/Stripe/Mapbox keys) get embedded in the bundle.
- Expo Go limits: no Mapbox (placeholder map) and no real push notifications.
  Those need an EAS Build (iOS requires a paid Apple Developer account).

## Gotchas

- `public.users` uses column-level grants. The client may only update profile
  columns plus `expo_push_token`. Never write `updated_at` from the client,
  because the `users_touch` trigger maintains it.
- `PGRST301 "No suitable key was found to decode the JWT"` means Supabase
  Third-Party Auth isn't set to the Clerk domain
  `https://winning-starling-39.clerk.accounts.dev`.
- `Notifications.addPushTokenListener` emits the native APNs/FCM token, and
  fetching the Expo token re-emits it on iOS. Only act on a changed device token,
  or it loops (see `app/config/clerk.tsx`).
