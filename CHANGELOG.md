# Changelog

## v1.1.0 - Hybrid AI Upload

- Added provider-neutral AI Upload settings for endpoint, API key, model, and connection status.
- Added hybrid local-plus-AI extraction merge logic with confidence penalties when AI and local peaks disagree.
- Added extraction source badges for Local, AI Assisted, and Manual Corrected upload results.
- Kept local extraction as the default fallback when AI assist is disabled, incomplete, or unavailable.
- Added unit coverage for AI settings readiness, merge behavior, disagreement penalties, and report payload sanitization.

## v1.0.1 - Stabilization and Release Polish

- Added `.env.example` for optional Supabase configuration.
- Expanded README deployment and smoke QA guidance.
- Replaced blocking validation alerts with non-blocking in-app notifications.
- Verified production build after lazy-loaded report/export and visualization chunks.
- Confirmed generated artifacts remain excluded from Git.

## v1.0.0 - Initial Release

- Initial release of the Mobius Simulation Dashboard app.
- Added 3D machine simulation, spectrum analysis, AI Upload, equipment dashboard, reference library, PDF report export, and Excel export.
- Added optional Supabase integration for auth, history, and report persistence.
