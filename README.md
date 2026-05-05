# Mobius Vibration Simulator Pro

Mobius Vibration Simulator Pro is a Vite + TypeScript web app for vibration diagnostics, spectrum analysis, and machine-condition reporting. It combines a 3D machine simulator, FFT/signal visualizations, AI-assisted image triage, an equipment dashboard, and a reference library for common fault patterns.

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
- AI Upload workflow for spectrum/waveform image extraction
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

## What the App Does

### 3D Simulation

The simulation tab renders a stylized motor-pump train in 3D and animates motion based on RPM, load, fault profile, and direction.

### Spectrum Analysis

The analysis tab accepts peak rows, ranks likely faults, and produces a diagnosis summary with recommended actions and report output.

### AI Upload

The upload workflow can extract peaks from spectrum/waveform images, infer machine context from filenames and metadata, and apply the extracted results back into the analysis flow.

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

## License

No license file is currently included in this project.

