# v1.0.1 - Stabilization and Release Polish

Patch release focused on making the project easier to configure, validate, and demo after the initial `v1.0.0` release.

## Changes

- Added `.env.example` with optional Supabase environment variables.
- Expanded README deployment guidance for demo mode, Supabase mode, build command, and publish directory.
- Added smoke QA checklist for simulation, analysis, upload, dashboard, exports, and Supabase fallback.
- Added `CHANGELOG.md` covering `v1.0.0` and `v1.0.1`.
- Replaced blocking validation alerts with non-blocking in-app toast notifications.
- Updated package version to `1.0.1`.

## Validation

- `npm install` completed successfully.
- `npm run build` completed successfully.
- Dev server smoke check returned HTTP `200` and detected the app title.
- Verified `window.alert(...)` is no longer used in `src/app.ts`.

## Known Notes

- `npm audit --omit=dev` reports a high severity vulnerability in `xlsx`; npm currently reports no available fix.
