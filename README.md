# Mobius Vibration Simulator Pro

**Mobius Vibration Simulator Pro** adalah aplikasi web berbasis **Vite + TypeScript** untuk simulasi, analisis, dan pelaporan kondisi mesin berbasis data vibrasi. Aplikasi ini dirancang untuk membantu engineer, technician, reliability team, dan condition monitoring analyst dalam memahami pola kerusakan mesin melalui visualisasi 3D, waveform, FFT spectrum, orbit, phase, equipment dashboard, serta report diagnostik yang terstruktur.

Project ini menggabungkan konsep **Predictive Maintenance**, **Rotating Equipment Diagnostics**, dan **Machine Condition Monitoring** dalam satu platform interaktif yang ringan, modern, dan siap dikembangkan untuk kebutuhan industri.

---

## Key Capabilities

- **3D Machine Visualization**
  - Simulasi motor-pump train secara real-time.
  - Animasi shaft, coupling, rotor, dan impeller berdasarkan RPM.
  - Visual behavior berdasarkan fault profile seperti unbalance, misalignment, looseness, bearing wear, resonance, cavitation, dan electrical fault.

- **Vibration Signal Analysis**
  - Live waveform chart.
  - FFT spectrum visualization.
  - Orbit plot.
  - Phase indicator.
  - Peak marker entry.
  - Harmonic and frequency pattern interpretation.

- **Fault Diagnosis Engine**
  - Scoring diagnosis berdasarkan spectrum peak, amplitude, harmonic pattern, RPM, dan fault profile.
  - Probable fault ranking.
  - Diagnostic summary.
  - Recommended action berbasis praktik reliability engineering.

- **AI-Assisted Upload Workflow**
  - Upload image spectrum atau waveform.
  - Ekstraksi peak dan informasi visual dari gambar.
  - Interpretasi awal untuk membantu proses triage.
  - Integrasi hasil extraction ke analysis workflow.

- **Equipment Dashboard**
  - Asset condition overview.
  - Alarm summary.
  - Trend monitoring.
  - Critical asset priority.
  - Equipment dataset integration.
  - Asset detail view untuk analisis per mesin.

- **Engineering Reference Library**
  - Fault pattern reference.
  - Mobius-style vibration guidance.
  - Symptom, cause, frequency pattern, dan recommended solution.
  - Cocok sebagai learning center untuk vibration analysis.

- **Professional Report Export**
  - PDF report generation.
  - Excel export untuk peak data dan marker data.
  - Report format untuk dokumentasi maintenance, reliability review, dan technical recommendation.

- **Optional Cloud Integration**
  - Supabase authentication.
  - Cloud history.
  - Report persistence.
  - Multi-user and future enterprise-ready workflow.

---

## Core Fault Profiles

Aplikasi mendukung beberapa fault profile utama pada rotating equipment:

| Fault Profile | Typical Pattern |
|---|---|
| Normal Operation | Low vibration, stable waveform, clean spectrum |
| Unbalance | Dominant 1X radial vibration |
| Misalignment | 1X and 2X component, axial response, coupling stress |
| Mechanical Looseness | Multiple harmonics, unstable amplitude, impact-like response |
| Bearing Wear | High-frequency components, bearing defect indicators |
| Structural Resonance | High response near natural frequency |
| Cavitation | Broadband noise and unstable flow-related vibration |
| Electrical Fault | Electrical frequency component and modulation pattern |

---

## Technology Stack

Project ini menggunakan teknologi modern untuk menjaga performa, maintainability, dan scalability.

- **Vite** — fast frontend build tool
- **TypeScript** — type-safe application logic
- **Three.js** — 3D machine visualization
- **Supabase JS** — optional auth, database, and cloud persistence
- **jsPDF** — PDF report export
- **jspdf-autotable** — structured report tables
- **SheetJS / xlsx** — Excel export
- **Canvas API** — waveform, FFT, orbit, and phase chart rendering
- **localStorage** — demo-mode persistence

---

## Project Structure

```text
.
├── index.html
├── src/
│   ├── main.ts          # Application bootstrap
│   ├── app.ts           # Main UI, state management, rendering, and event handling
│   ├── services.ts      # Analysis helpers, persistence, extraction, and Supabase integration
│   ├── visuals.ts       # Three.js scene and canvas-based signal visualization
│   ├── data.ts          # Fault profiles, bearing data, reference cards, and equipment datasets
│   ├── types.ts         # Shared TypeScript interfaces and types
│   └── styles.css       # Professional dashboard styling
├── supabase/            # Optional backend/database helpers
├── dist/                # Production build output
└── package.json
````

---

## Application Modules

### 1. 3D Simulator

Module ini menampilkan visualisasi mesin rotating equipment seperti motor-pump train. Motion model dapat dikembangkan agar mengikuti parameter engineering seperti:

```text
omega = RPM / 60 × 2π
```

Dengan pendekatan ini, rotasi shaft, coupling, motor rotor, dan impeller dapat dibuat lebih sinkron terhadap kecepatan aktual mesin.

Fault profile juga dapat memengaruhi visual behavior seperti:

* circular motion untuk unbalance
* coupling wobble untuk misalignment
* body/base jitter untuk looseness
* high-frequency vibration untuk bearing wear
* unstable flow response untuk cavitation

---

### 2. Spectrum Analysis

Module ini digunakan untuk input dan analisis peak vibration. User dapat memasukkan frequency, amplitude, dan marker untuk membantu diagnosis.

Output utama:

* probable fault diagnosis
* fault confidence score
* spectrum interpretation
* severity indication
* recommended maintenance action
* report-ready conclusion

---

### 3. AI Upload

AI Upload workflow membantu engineer melakukan triage cepat dari gambar spectrum atau waveform.

Fungsi utama:

* membaca gambar spectrum/waveform
* mengekstrak peak penting
* mendeteksi konteks dari filename atau metadata
* mengisi analysis form secara otomatis
* mempercepat proses review data vibrasi

---

### 4. Equipment Dashboard

Dashboard equipment memberikan ringkasan kondisi asset dan prioritas tindakan.

Fitur yang direkomendasikan:

* equipment health status
* alarm level
* latest vibration reading
* trend condition
* asset criticality
* probable fault
* recommended action
* inspection priority

---

### 5. Reference Library

Reference Library berfungsi sebagai pusat panduan analisis kerusakan mesin.

Isi library dapat mencakup:

* vibration symptom
* dominant frequency pattern
* likely root cause
* severity indicator
* inspection checklist
* corrective action
* Mobius-style diagnostic guidance

---

## Requirements

* Node.js 18 or newer
* npm

Recommended environment:

```text
Node.js 18+
npm 9+
Modern browser with WebGL support
```

---

## Getting Started

Clone project, install dependency, lalu jalankan development server.

```bash
npm install
npm run dev
```

Kemudian buka local URL yang muncul di terminal.

Contoh:

```text
http://localhost:5173
```

---

## Available Scripts

```bash
npm run dev
```

Menjalankan aplikasi dalam development mode.

```bash
npm run build
```

Membuat production build ke folder `dist`.

```bash
npm run preview
```

Menjalankan preview production build secara lokal.

---

## Supabase Configuration

Aplikasi tetap dapat berjalan dalam **demo mode** tanpa Supabase.

Untuk mengaktifkan authentication, cloud history, dan report persistence, tambahkan environment variable berikut:

```bash
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
```

Fallback key juga didukung:

```bash
VITE_SUPABASE_ANON_KEY=your_anon_key
```

Saat Supabase aktif, aplikasi membutuhkan table berikut:

```text
users
analysis_results
reports
```

---

## Operating Modes

### Demo Mode

Mode ini berjalan tanpa Supabase.

Fitur yang tetap aktif:

* 3D simulator
* spectrum analysis
* local history
* equipment dashboard
* reference library
* PDF export
* Excel export

Fitur yang nonaktif:

* authentication
* cloud history
* remote report persistence

---

### Supabase Mode

Mode ini digunakan untuk deployment yang membutuhkan backend.

Fitur tambahan:

* user authentication
* saved analysis history
* cloud report storage
* multi-session access
* future multi-user workflow

---

## Production Build

Untuk membuat build production:

```bash
npm run build
```

Output akan dibuat di:

```text
dist/
```

---

## Deployment

Aplikasi dapat dideploy ke hosting frontend modern seperti Vercel, Netlify, Cloudflare Pages, atau static hosting lain.

### Build Command

```bash
npm run build
```

### Publish Directory

```text
dist
```

### Environment Variables

Untuk deployment dengan Supabase:

```bash
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
```

Untuk deployment demo mode, environment variable Supabase dapat dikosongkan.

---

## Smoke QA Checklist

Gunakan checklist berikut sebelum release atau deployment.

### 3D Simulator

* Buka tab 3D Simulator.
* Pastikan scene motor-pump muncul.
* Ubah RPM dan pastikan rotasi berubah.
* Ganti fault profile dan pastikan visual response berubah.
* Pastikan WebGL fallback tampil jika browser tidak mendukung 3D.

### Spectrum Analysis

* Masukkan minimal satu peak valid.
* Pastikan diagnosis result muncul.
* Cek fault ranking dan confidence score.
* Pastikan recommended action tampil jelas.

### AI Upload

* Upload gambar spectrum atau waveform.
* Pastikan extraction status mudah dipahami.
* Pastikan hasil extraction dapat digunakan ke analysis flow.
* Pastikan error state tampil jika gambar tidak terbaca.

### Equipment Dashboard

* Buka dashboard equipment.
* Pastikan equipment rows tampil.
* Cek filter, priority card, alarm summary, dan trend indicator.
* Pastikan asset detail page dapat dibuka.

### Export

* Generate PDF report.
* Export Excel peak/marker data.
* Pastikan export tetap berjalan dari fresh browser session.

### Supabase Fallback

* Jalankan aplikasi tanpa Supabase environment variable.
* Pastikan aplikasi tetap usable dalam demo mode.
* Pastikan tidak ada crash saat auth atau cloud persistence nonaktif.

---

## Recommended Future Enhancements

Beberapa pengembangan lanjutan yang direkomendasikan:

* Automatic probable fault diagnosis berbasis rule engine yang lebih detail.
* Asset criticality scoring berdasarkan safety, production impact, downtime, dan repair cost.
* Historical vibration trend untuk tiap equipment.
* Bearing defect frequency calculator: BPFO, BPFI, BSF, dan FTF.
* Alarm threshold berbasis ISO 20816.
* Multi-spectrum upload untuk DE/NDE, horizontal/vertical/axial, dan bearing 1/2/3/4.
* Report template dengan logo perusahaan dan signature field.
* Maintenance recommendation workflow.
* Database schema untuk equipment, inspection route, analysis history, dan report archive.
* Role-based access untuk engineer, supervisor, dan admin.

---

## Engineering Objective

Tujuan utama project ini adalah menyediakan platform analisis vibrasi yang:

* mudah digunakan oleh technician,
* cukup detail untuk engineer,
* visual untuk training dan presentasi,
* ringan untuk browser,
* fleksibel untuk demo maupun deployment produksi,
* dan dapat dikembangkan menjadi sistem Predictive Maintenance yang lebih lengkap.

---

## License

No license file is currently included in this project.

Sebelum digunakan secara komersial atau dibagikan ke publik, disarankan menambahkan file license seperti:

```text
MIT License
Apache License 2.0
Proprietary / Internal Use Only
```

````

Kalau mau dibuat lebih **premium**, kamu bisa pakai tagline ini di bagian atas README:

```markdown
> Professional vibration diagnostics platform for rotating equipment analysis, 3D simulation, AI-assisted spectrum triage, and predictive maintenance reporting.
````

Atau versi Indonesia:

```markdown
> Platform engineering untuk analisis vibrasi rotating equipment, simulasi 3D, AI-assisted spectrum triage, dan laporan predictive maintenance profesional.
```
