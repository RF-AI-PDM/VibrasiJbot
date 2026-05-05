import legacyHtml from '../preview.html?raw';
import type {
  BearingSpec,
  EquipmentDataset,
  EquipmentRecord,
  FaultKey,
  FaultProfile,
  ReferenceCard,
} from './types';

const measurementLabels = ['1V', '1H', '1A', '2V', '2H', '2A', '3V', '3H', '3A', '4V', '4H', '4A', '5V', '5H', '5A', '6V', '6H', '6A'];

export { measurementLabels };

export const faultOrder: FaultKey[] = [
  'normal',
  'unbalance',
  'misalignment',
  'looseness',
  'bearing',
  'resonance',
  'cavitation',
  'electrical',
];

export const faultProfiles: Record<FaultKey, FaultProfile> = {
  normal: {
    key: 'normal',
    name: 'Normal Operation',
    icon: 'OK',
    severity: 'A',
    desc: 'Kondisi baseline. Tidak ada pola spektral abnormal yang berarti dan overall vibration masih di zona aman.',
    spectrum: [
      { o: 1, a: 0.24 },
      { o: 2, a: 0.08 },
      { o: 3, a: 0.03 },
    ],
    overall: 0.8,
    phase: 0,
    direction: 'radial',
    recommendations: ['Lanjutkan routine monitoring setiap 3 bulan', 'Trend level masih stabil dan acceptable'],
    mobiusRef: 'Baseline condition - all spectral components within normal limits',
  },
  unbalance: {
    key: 'unbalance',
    name: 'Unbalance',
    icon: '1X',
    severity: 'C',
    desc: '1X RPM dominan di arah radial. Amplitudo biasanya naik seiring RPM kuadrat dan phase antar bearing relatif stabil.',
    spectrum: [
      { o: 1, a: 4.5 },
      { o: 2, a: 0.3 },
      { o: 3, a: 0.1 },
    ],
    overall: 5.2,
    phase: 0.1,
    direction: 'radial',
    recommendations: [
      'Lakukan dynamic balancing on-site',
      'Cek material buildup pada impeller atau blade',
      'Inspect wear atau erosion pada rotor',
      'Bersihkan rotor bila ada kontaminasi',
    ],
    mobiusRef: 'Mobius D-6/D-7: 1X radial dominant, 90 deg phase relation, in-phase across machine',
  },
  misalignment: {
    key: 'misalignment',
    name: 'Misalignment',
    icon: '2X',
    severity: 'D',
    desc: '2X radial tinggi dengan 1X dan 3X ikut muncul. Axial vibration cenderung lebih tinggi dan phase coupling bisa 180 deg.',
    spectrum: [
      { o: 1, a: 2.8 },
      { o: 2, a: 4.2 },
      { o: 3, a: 2.1 },
      { o: 4, a: 0.8 },
    ],
    overall: 7.8,
    phase: Math.PI,
    direction: 'both',
    recommendations: [
      'Lakukan laser shaft alignment segera',
      'Cek coupling wear dan kondisi element',
      'Verifikasi soft foot sebelum alignment',
      'Re-check setelah 24 jam operasi',
    ],
    mobiusRef: 'Mobius D-13: 1X and 2X dominant, 180 deg across coupling, axial elevated',
  },
  looseness: {
    key: 'looseness',
    name: 'Mechanical Looseness',
    icon: 'LOO',
    severity: 'D',
    desc: 'Muncul harmonik banyak dari 1X dan kadang sub-harmonic 0.5X. Noise floor cenderung naik dan phase bisa tidak stabil.',
    spectrum: [
      { o: 0.5, a: 1.2 },
      { o: 1, a: 3.5 },
      { o: 2, a: 3.0 },
      { o: 3, a: 2.2 },
      { o: 4, a: 1.8 },
      { o: 5, a: 1.2 },
      { o: 6, a: 0.8 },
      { o: 7, a: 0.5 },
      { o: 8, a: 0.3 },
    ],
    overall: 9.5,
    phase: Math.PI * 0.65,
    direction: 'radial',
    recommendations: [
      'Kencangkan semua foundation bolt',
      'Cek cracked foundation atau grout',
      'Inspect bearing housing clearance',
      'Verifikasi struktur baseplate',
    ],
    mobiusRef: 'Mobius D-18/D-19: 1X harmonics, possible 0.5X sub-harmonic, unstable phase',
  },
  bearing: {
    key: 'bearing',
    name: 'Bearing Wear',
    icon: 'BRG',
    severity: 'C',
    desc: 'Ada non-synchronous peak pada BPFO, BPFI, FTF, dan BSF. Noise floor naik dan sideband di sekitar defect frequency bisa muncul.',
    spectrum: [
      { o: 1, a: 1.5 },
      { o: 3.2, a: 3.8, label: 'BPFO' },
      { o: 4.9, a: 2.8, label: 'BPFI' },
      { o: 0.4, a: 0.6, label: 'FTF' },
      { o: 6.4, a: 1.5, label: 'BSF' },
    ],
    overall: 6.2,
    phase: 0,
    direction: 'radial',
    recommendations: [
      'Monitor dengan enveloping atau demodulation',
      'Rencanakan bearing replacement dalam 2-4 minggu',
      'Cek lubrication condition dan interval',
      'Siapkan spare bearing untuk outage berikutnya',
    ],
    mobiusRef: 'Mobius D-26: Non-synchronous peaks at BPFO/BPFI/FTF/BSF with sidebands',
  },
  resonance: {
    key: 'resonance',
    name: 'Structural Resonance',
    icon: 'RES',
    severity: 'B',
    desc: 'Ada amplification hump pada natural frequency. Amplitudo berubah signifikan saat speed berubah dan biasanya dominan pada satu arah.',
    spectrum: [
      { o: 1, a: 1.2 },
      { o: 1.8, a: 5.5, label: 'Natural Freq' },
      { o: 2, a: 0.6 },
      { o: 3, a: 0.3 },
    ],
    overall: 4.8,
    phase: 0,
    direction: 'radial',
    recommendations: [
      'Identifikasi natural frequency via bump test',
      'Tambah stiffness untuk shift natural frequency',
      'Atau tambahkan damping pada struktur',
      'Hindari operasi dekat critical speed',
    ],
    mobiusRef: 'Mobius D-25: amplification hump, directional, speed-sensitive',
  },
  cavitation: {
    key: 'cavitation',
    name: 'Cavitation',
    icon: 'CAV',
    severity: 'C',
    desc: 'Random broadband high-frequency noise. Biasanya terdengar seperti gravel di pump dan bisa muncul hump pada high-frequency region.',
    spectrum: [
      { o: 1, a: 1.0 },
      { o: 6, a: 0.8, label: 'BPF' },
      { o: 12, a: 0.5 },
    ],
    overall: 5.5,
    phase: 0,
    direction: 'radial',
    recommendations: [
      'Cek suction pressure dan naikkan bila rendah',
      'Inspect impeller untuk erosion damage',
      'Verifikasi NPSH available vs required',
      'Cek obstruction pada suction line',
      'Turunkan pump speed bila memungkinkan',
    ],
    mobiusRef: 'Mobius D-31: random high-frequency noise, broadband hump, gravel sound',
  },
  electrical: {
    key: 'electrical',
    name: 'Electrical Fault',
    icon: 'ELEC',
    severity: 'B',
    desc: 'Vibration tinggi di 2x line frequency (100/120 Hz). Pole pass sideband bisa muncul di sekitar 1X dan 2LF.',
    spectrum: [
      { o: 1, a: 1.8 },
      { o: 2, a: 3.5, label: '2xLF' },
      { o: 3, a: 0.8 },
    ],
    overall: 4.2,
    phase: 0,
    direction: 'radial',
    recommendations: [
      'Lakukan motor current analysis (MCSA)',
      'Cek eccentric rotor atau uneven air gap',
      'Inspect cracked atau broken rotor bars',
      'Verifikasi stator winding insulation',
      'Cek loose connection atau phasing',
    ],
    mobiusRef: 'Mobius D-33/D-35/D-37: 2xLF dominant, pole pass sidebands, disappears when de-energized',
  },
};

export const bearingDatabase: Record<string, BearingSpec> = {
  '6205': { d: 7.94, D: 38.5, n: 9, a: 0, BPFO: 3.58, BPFI: 5.42, FTF: 0.397, BSF: 2.36 },
  '6206': { d: 9.53, D: 46.4, n: 9, a: 0, BPFO: 3.57, BPFI: 5.43, FTF: 0.397, BSF: 2.39 },
  '6207': { d: 11.11, D: 54.3, n: 9, a: 0, BPFO: 3.58, BPFI: 5.42, FTF: 0.397, BSF: 2.41 },
  '6208': { d: 12.7, D: 60.3, n: 9, a: 0, BPFO: 3.57, BPFI: 5.43, FTF: 0.397, BSF: 2.39 },
  '6209': { d: 14.29, D: 66.3, n: 10, a: 0, BPFO: 3.57, BPFI: 6.43, FTF: 0.4, BSF: 2.41 },
  '6210': { d: 15.88, D: 72.3, n: 10, a: 0, BPFO: 3.57, BPFI: 6.43, FTF: 0.4, BSF: 2.41 },
  '6305': { d: 13.49, D: 51.6, n: 8, a: 0, BPFO: 3.57, BPFI: 5.43, FTF: 0.4, BSF: 2.36 },
  '6306': { d: 15.88, D: 59.5, n: 8, a: 0, BPFO: 3.57, BPFI: 5.43, FTF: 0.4, BSF: 2.36 },
  '6307': { d: 17.46, D: 67.5, n: 8, a: 0, BPFO: 3.57, BPFI: 5.43, FTF: 0.4, BSF: 2.36 },
  '6308': { d: 19.05, D: 75.4, n: 8, a: 0, BPFO: 3.57, BPFI: 5.43, FTF: 0.4, BSF: 2.36 },
  '6309': { d: 20.64, D: 83.3, n: 9, a: 0, BPFO: 3.58, BPFI: 5.42, FTF: 0.397, BSF: 2.41 },
  '6310': { d: 22.23, D: 91.3, n: 9, a: 0, BPFO: 3.58, BPFI: 5.42, FTF: 0.397, BSF: 2.41 },
  '6312': { d: 25.4, D: 107.3, n: 9, a: 0, BPFO: 3.58, BPFI: 5.42, FTF: 0.397, BSF: 2.41 },
  '22206': { d: 10, D: 45.5, n: 12, a: 15, BPFO: 3.24, BPFI: 4.95, FTF: 0.39, BSF: 2.15 },
  '22208': { d: 12.7, D: 55.5, n: 12, a: 15, BPFO: 3.24, BPFI: 4.95, FTF: 0.39, BSF: 2.15 },
  '22210': { d: 14.29, D: 65.5, n: 12, a: 15, BPFO: 3.24, BPFI: 4.95, FTF: 0.39, BSF: 2.15 },
  '22212': { d: 17.46, D: 80.5, n: 12, a: 15, BPFO: 3.24, BPFI: 4.95, FTF: 0.39, BSF: 2.15 },
};

function extractLiteralBlock(source: string, marker: string): string {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error(`Marker not found: ${marker}`);
  }

  const afterMarker = source.slice(markerIndex + marker.length);
  const firstCharIndex = afterMarker.search(/[\[{]/);
  if (firstCharIndex < 0) {
    throw new Error(`Literal start not found after marker: ${marker}`);
  }

  const openChar = afterMarker[firstCharIndex];
  const closeChar = openChar === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;
  let stringQuote = '';

  for (let i = firstCharIndex; i < afterMarker.length; i += 1) {
    const ch = afterMarker[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === stringQuote) {
        inString = false;
      }
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      inString = true;
      stringQuote = ch;
      continue;
    }

    if (ch === openChar) depth += 1;
    if (ch === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return afterMarker.slice(firstCharIndex, i + 1);
      }
    }
  }

  throw new Error(`Failed to parse literal block for ${marker}`);
}

function evaluateLiteral<T>(literal: string): T {
  return new Function(`return (${literal});`)() as T;
}

function sanitizeEquipmentRows(rows: EquipmentRecord[]): EquipmentRecord[] {
  return rows
    .map((row) => {
      const name = String(row.equipment ?? '').trim();
      if (!name || /^\d+$/.test(name)) {
        return null;
      }

      const values = Array.isArray(row.values)
        ? row.values.map((value) => (typeof value === 'number' && Number.isFinite(value) ? value : null))
        : [];

      const vibMax =
        typeof row.vibMax === 'number' && Number.isFinite(row.vibMax)
          ? row.vibMax
          : Math.max(0, ...values.map((value) => (typeof value === 'number' ? value : 0)));

      return {
        ...row,
        equipment: name,
        values,
        vibMax,
        group: row.group ?? null,
      } satisfies EquipmentRecord;
    })
    .filter((row): row is EquipmentRecord => Boolean(row));
}

const legacyScript = legacyHtml.slice(legacyHtml.lastIndexOf('<script>') + '<script>'.length, legacyHtml.lastIndexOf('</script>'));

const equipmentDataJan2026 = sanitizeEquipmentRows(
  evaluateLiteral<EquipmentRecord[]>(extractLiteralBlock(legacyScript, 'const equipmentDataJan2026 =')),
);

const equipmentDataAug2025 = sanitizeEquipmentRows(
  evaluateLiteral<EquipmentRecord[]>(extractLiteralBlock(legacyScript, 'const equipmentDataAug2025 =')),
);

export const equipmentDatasets: Record<string, EquipmentDataset> = {
  '2026-01-01': {
    key: '2026-01-01',
    label: '01 Januari 2026',
    monthLabel: 'Januari 2026',
    source: 'Exsume Vibrasi Januari 2026.pdf',
    data: equipmentDataJan2026,
  },
  '2025-08-01': {
    key: '2025-08-01',
    label: '01 Agustus 2025',
    monthLabel: 'Agustus 2025',
    source: 'Equipment.pdf / data awal aplikasi',
    data: equipmentDataAug2025,
  },
};

export const referenceCards: ReferenceCard[] = [
  {
    title: 'Unbalance',
    faultKey: 'unbalance',
    ref: 'Mobius D-6/D-7',
    symptoms: '1X radial dominant, phase 90 deg +/- 30 deg, in-phase across machine',
    solution: 'Dynamic balancing dan cek buildup pada rotor',
  },
  {
    title: 'Misalignment',
    faultKey: 'misalignment',
    ref: 'Mobius D-13/D-14/D-15',
    symptoms: '1X and 2X prominent, 180 deg across coupling, axial elevated',
    solution: 'Laser alignment dan verifikasi soft foot',
  },
  {
    title: 'Looseness',
    faultKey: 'looseness',
    ref: 'Mobius D-18/D-19/D-20',
    symptoms: 'Multiple harmonics 1X-10X, possible 0.5X sub-harmonic',
    solution: 'Tighten bolt, cek foundation, dan housing clearance',
  },
  {
    title: 'Bearing Wear',
    faultKey: 'bearing',
    ref: 'Mobius D-26',
    symptoms: 'Non-synchronous peaks: BPFO, BPFI, FTF, BSF',
    solution: 'Enveloping, lubrication review, dan schedule replacement',
  },
  {
    title: 'Resonance',
    faultKey: 'resonance',
    ref: 'Mobius D-25',
    symptoms: 'Amplification hump, directional, speed-sensitive',
    solution: 'Ubah stiffness atau damping untuk shift natural frequency',
  },
  {
    title: 'Cavitation',
    faultKey: 'cavitation',
    ref: 'Mobius D-31',
    symptoms: 'Random high-frequency noise, gravel sound',
    solution: 'Cek suction pressure, NPSH, dan obstruction line',
  },
  {
    title: 'Electrical',
    faultKey: 'electrical',
    ref: 'Mobius D-33/D-35/D-37',
    symptoms: '2x line frequency, pole pass sidebands',
    solution: 'MCSA, cek rotor bars, dan stator winding',
  },
  {
    title: 'Bearing Frequency Guide',
    faultKey: 'bearing',
    ref: 'Calculator',
    symptoms: 'BPFO/BPFI/FTF/BSF tergantung model bearing',
    solution: 'Gunakan input bearing model untuk hitung frequency order',
  },
];
