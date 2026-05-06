# Mobius Simulation Dashboard

Mobius Simulation Dashboard is a Vite + TypeScript web app for vibration diagnostics, spectrum analysis, and machine-condition reporting. It combines a 3D machine simulator, FFT/signal visualizations, AI-assisted image triage, an equipment dashboard, and a reference library for common fault patterns.

## Features

- 3D machine simulation for motor-pump style equipment
- Live waveform, FFT spectrum, phase, and orbit charts
- Fault profile controls for:
  - Normal operation
  - Unbalance
  - Misalignment
  - Mechanical looseness
  - Bearing wear
  - Structural resonance
  - Cavitation
  - Electrical fault
- Spectrum peak entry and diagnosis scoring
- Hybrid AI Upload workflow for spectrum/waveform image extraction, provider-neutral vision assist, and manual review
- Equipment dashboard with trend and alarm summaries
- Reference library mapped to Mobius fault guidance
- PDF report export
- Excel export of peak and marker data
- Optional Supabase auth, history, and report persistence

## Tech Stack

- Vite
- TypeScript
- Three.js
- Supabase JS
- jsPDF
- jspdf-autotable
- SheetJS (`xlsx`)

## Project Structure

- `index.html` - Vite entry HTML
- `src/main.ts` - App bootstrap
- `src/app.ts` - Main UI, state, rendering, and event handling
- `src/services.ts` - Analysis helpers, persistence, extraction, and Supabase integration
- `src/visuals.ts` - Three.js scene and canvas charts
- `src/data.ts` - Fault profiles, bearing data, reference cards, and equipment datasets
- `src/types.ts` - Shared TypeScript types
- `src/styles.css` - UI styling
- `supabase/` - Backend-related assets and database helpers, if used
- `dist/` - Production build output

## Requirements

- Node.js 18+ recommended
- npm

## Getting Started

```bash
npm install
npm run dev
```

Then open the local Vite URL shown in the terminal.

## Available Scripts

- `npm run dev` - Start the Vite development server
- `npm run build` - Build the production bundle
- `npm run preview` - Preview the production build locally

## Supabase Configuration

The app runs in demo mode if Supabase is not configured. To enable auth, cloud history, and report persistence, define:

```bash
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
```

`VITE_SUPABASE_ANON_KEY` is also accepted as a fallback if `VITE_SUPABASE_PUBLISHABLE_KEY` is not set.

When Supabase is enabled, the app expects these tables/features to exist based on the current code:

- `users`
- `analysis_results`
- `reports`

## Production AI Provider Proxy

The in-browser AI Provider settings are useful for local demos. For production or shared use, deploy the included Supabase Edge Function proxy so third-party provider keys stay server-side:

```bash
supabase secrets set AI_PROVIDER_ENDPOINT="https://provider.example.com/vision"
supabase secrets set AI_PROVIDER_API_KEY="provider-secret-key"
supabase secrets set AI_PROVIDER_MODEL="vision-default"
supabase functions deploy ai-vision-proxy
```

Then use the deployed function URL as the app's AI Provider endpoint:

```text
https://<project-ref>.functions.supabase.co/ai-vision-proxy
```

## What the App Does

### 3D Simulation

The simulation tab renders a stylized motor-pump train in 3D and animates motion based on RPM, load, fault profile, and direction.

### Spectrum Analysis

The analysis tab accepts peak rows, ranks likely faults, and produces a diagnosis summary with recommended actions and report output.

### AI Upload

The upload workflow can extract peaks from spectrum/waveform images, infer machine context from filenames and metadata, and apply the extracted results back into the analysis flow. In v1.1, AI assist can optionally call a user-configured provider endpoint from the browser; if the endpoint or key is missing or the request fails, the local extractor remains the fallback.

### Equipment Dashboard

This view uses embedded equipment datasets to present status, trend, and priority information.

### Reference Library

This section maps fault patterns to reference guidance and Mobius-style symptoms/solutions.

## Build Notes

The app uses lazy loading for heavier export and visualization libraries so the initial bundle stays smaller. Export/report features load their dependencies only when needed.

## Development Notes

- The app persists UI state and history in `localStorage`.
- If WebGL is unavailable, the 3D panel falls back to a simple message.
- If Supabase is not configured, the app stays functional in demo mode.

## Production Build

```bash
npm run build
```

The output will be written to `dist/`.

## Deployment

The app can be deployed in two modes:

- Demo mode: deploy without Supabase environment variables. Auth, cloud history, and remote report persistence stay disabled, while local analysis and exports remain available.
- Supabase mode: set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the hosting provider environment. `VITE_SUPABASE_ANON_KEY` is supported as a fallback.

Build command:

```bash
npm run build
```

Publish directory:

```bash
dist
```

## Smoke QA Checklist

- 3D Simulation: open the app, confirm the machine scene renders, and switch fault profiles.
- Spectrum Analysis: enter at least one valid peak and confirm diagnosis results update.
- AI Upload: upload a spectrum or waveform image and confirm extraction/result states are understandable.
- Equipment Dashboard: open the dashboard and confirm equipment rows, filters, and priority cards render.
- Exports: generate a PDF report and Excel export from a fresh browser session.
- Supabase fallback: run without env variables and confirm the app stays usable in demo mode.

## License

No license file is currently included in this project.
