import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { faultOrder, faultProfiles, bearingDatabase, measurementLabels } from './data';
import type {
  AppConnectionState,
  AppState,
  AnalysisResultItem,
  BearingSpec,
  DiagnosisSummary,
  FaultKey,
  FrequencyMarker,
  FaultProfile,
  HistoryEntry,
  EquipmentStatus,
  ExtractedPeak,
  ExtractionConfidence,
  MachineContext,
  MeasurementDirection,
  PeakInsight,
  PeakInputRow,
  PlotCalibration,
  EquipmentRecord,
  UploadedAsset,
  UploadAnalysisResult,
  UserRoleName,
} from './types';

const STATE_KEY = 'mobius-vibration-state-v1';
const HISTORY_KEY = 'mobius-vibration-history-v1';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
export const SUPABASE_KEY = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  ''
).trim();

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }

  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
  }

  return supabaseClient;
}

export function defaultConnectionState(): AppConnectionState {
  return {
    mode: isSupabaseConfigured() ? 'connected' : 'demo',
    ready: false,
    configured: isSupabaseConfigured(),
    email: null,
    role: 'guest',
    message: isSupabaseConfigured() ? 'Supabase siap. Login untuk sync data dan histori.' : 'Demo mode. Tambahkan VITE_SUPABASE_URL dan key untuk aktifkan backend.',
  };
}

export function defaultPeakRows(): PeakInputRow[] {
  return [
    { id: cryptoId(), order: '1X', freq: '24.5', amp: '2.2' },
    { id: cryptoId(), order: '2X', freq: '49.0', amp: '0.7' },
    { id: cryptoId(), order: '3X', freq: '73.5', amp: '0.3' },
  ];
}

export function defaultMachineContext(): MachineContext {
  return {
    equipmentCode: 'EQ-PDM-001',
    equipmentName: 'Motor Pump Train',
    machineType: 'pump',
    drivenComponent: 'pump',
    driveType: 'flexible',
    rpm: 1470,
    rpmSource: 'manual',
    detectedRpm: 1470,
    masterRpm: 1470,
    load: 80,
    bearingModel: '6205',
    bearingPosition: 'DE',
    couplingType: 'flexible',
    bearingCount: 4,
    vaneCount: 6,
    gearTeeth: 0,
    measurementPoint: 'B1',
    direction: 'radial',
    dateTaken: new Date().toISOString().slice(0, 10),
    technician: '',
    criticality: 80,
    productionImpact: 75,
    safetyImpact: 50,
    sourceUploadName: 'Manual baseline',
    notes: 'Default context. Upload spectrum/waveform atau sesuaikan data mesin untuk diagnosis yang lebih tepat.',
    confidence: 60,
  };
}

export function defaultAppState(): AppState {
  const machineContext = defaultMachineContext();
  return {
    currentTab: 'sim',
    rpm: machineContext.rpm,
    load: machineContext.load,
    faultKey: 'normal',
    direction: 'radial',
    wireframe: false,
    simulationSpeed: '1',
    vibrationGain: 'normal',
    showOrbit: true,
    showSensors: true,
    showVectors: true,
    analysisRpm: 1470,
    analysisDirection: 'radial',
    peakRows: defaultPeakRows(),
    analysisResults: [],
    diagnosisSummary: null,
    uploadedAssets: [],
    uploadResult: null,
    machineContext,
    equipmentDatasetKey: '2026-01-01',
    equipmentUnitFilter: 'ALL',
    equipmentStatusFilter: 'ALL',
    equipmentSearch: '',
    history: loadHistory(),
    connection: defaultConnectionState(),
  };
}

export function loadPersistedAppState(base: AppState): AppState {
  const raw = readStorage(STATE_KEY);
  if (!raw) {
    return base;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return {
      ...base,
      ...parsed,
      connection: base.connection,
      history: base.history,
      peakRows: Array.isArray(parsed.peakRows) && parsed.peakRows.length ? parsed.peakRows : base.peakRows,
      machineContext: normalizeMachineContext(parsed.machineContext, base.machineContext),
      uploadedAssets: [],
      uploadResult: null,
      analysisResults: [],
      diagnosisSummary: null,
    };
  } catch {
    return base;
  }
}

export function persistAppState(state: AppState): void {
  const snapshot: Partial<AppState> = {
    currentTab: state.currentTab,
    rpm: state.rpm,
    load: state.load,
    faultKey: state.faultKey,
    direction: state.direction,
    wireframe: state.wireframe,
    simulationSpeed: state.simulationSpeed,
    vibrationGain: state.vibrationGain,
    showOrbit: state.showOrbit,
    showSensors: state.showSensors,
    showVectors: state.showVectors,
    analysisRpm: state.analysisRpm,
    analysisDirection: state.analysisDirection,
    peakRows: state.peakRows,
    diagnosisSummary: state.diagnosisSummary,
    equipmentDatasetKey: state.equipmentDatasetKey,
    equipmentUnitFilter: state.equipmentUnitFilter,
    equipmentStatusFilter: state.equipmentStatusFilter,
    equipmentSearch: state.equipmentSearch,
    machineContext: state.machineContext,
  };

  writeStorage(STATE_KEY, JSON.stringify(snapshot));
}

export function saveHistory(entries: HistoryEntry[]): void {
  writeStorage(HISTORY_KEY, JSON.stringify(entries.slice(0, 50)));
}

export function loadHistory(): HistoryEntry[] {
  const raw = readStorage(HISTORY_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as HistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function appendHistory(entry: HistoryEntry): HistoryEntry[] {
  const next = [entry, ...loadHistory()].slice(0, 50);
  saveHistory(next);
  return next;
}

export function updateAppConnection(state: AppState, connection: Partial<AppConnectionState>): AppState {
  return {
    ...state,
    connection: {
      ...state.connection,
      ...connection,
    },
  };
}

export function formatMmps(value: number, digits = 2): string {
  return `${value.toFixed(digits)} mm/s`;
}

export function formatHz(value: number, digits = 1): string {
  return `${value.toFixed(digits)} Hz`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeMachineContext(
  input: Partial<MachineContext> | null | undefined,
  fallback = defaultMachineContext(),
): MachineContext {
  const machineTypes = ['motor', 'pump', 'fan', 'gearbox', 'compressor', 'turbine'] as const;
  const couplingTypes = ['direct', 'flexible', 'belt', 'gear', 'unknown'] as const;
  const rpmSources = ['manual', 'detected', 'master'] as const;
  const bearingPositions = ['DE', 'NDE', 'Motor', 'Fan', 'Pulley', 'Gearbox', 'Compressor'] as const;
  const directions = ['horizontal', 'vertical', 'axial', 'radial', 'both'] as const;
  const direction = directions.includes(input?.direction as MachineContext['direction'])
    ? input?.direction as MachineContext['direction']
    : fallback.direction;
  const machineType = machineTypes.includes(input?.machineType as MachineContext['machineType'])
    ? input?.machineType as MachineContext['machineType']
    : fallback.machineType;
  const drivenComponent = machineTypes.includes(input?.drivenComponent as MachineContext['drivenComponent'])
    ? input?.drivenComponent as MachineContext['drivenComponent']
    : machineType;
  const measurementPoint = ['B1', 'B2', 'B3', 'B4'].includes(String(input?.measurementPoint))
    ? input?.measurementPoint as MachineContext['measurementPoint']
    : fallback.measurementPoint;

  return {
    equipmentCode: String(input?.equipmentCode || fallback.equipmentCode || 'EQ-PDM-001').slice(0, 40),
    equipmentName: String(input?.equipmentName || fallback.equipmentName).slice(0, 80),
    machineType,
    drivenComponent,
    driveType: couplingTypes.includes((input?.driveType ?? input?.couplingType) as MachineContext['driveType'])
      ? (input?.driveType ?? input?.couplingType) as MachineContext['driveType']
      : fallback.driveType,
    rpm: clamp(Number(input?.rpm ?? fallback.rpm), 300, 6000),
    rpmSource: rpmSources.includes(input?.rpmSource as MachineContext['rpmSource'])
      ? input?.rpmSource as MachineContext['rpmSource']
      : fallback.rpmSource,
    detectedRpm: input?.detectedRpm == null ? fallback.detectedRpm : clamp(Number(input.detectedRpm), 300, 6000),
    masterRpm: input?.masterRpm == null ? fallback.masterRpm : clamp(Number(input.masterRpm), 300, 6000),
    load: clamp(Number(input?.load ?? fallback.load), 0, 100),
    bearingModel: String(input?.bearingModel || fallback.bearingModel).slice(0, 32),
    bearingPosition: bearingPositions.includes(input?.bearingPosition as MachineContext['bearingPosition'])
      ? input?.bearingPosition as MachineContext['bearingPosition']
      : fallback.bearingPosition,
    couplingType: couplingTypes.includes(input?.couplingType as MachineContext['couplingType'])
      ? input?.couplingType as MachineContext['couplingType']
      : fallback.couplingType,
    bearingCount: Math.round(clamp(Number(input?.bearingCount ?? fallback.bearingCount), 1, 8)),
    vaneCount: Math.round(clamp(Number(input?.vaneCount ?? fallback.vaneCount), 2, 24)),
    gearTeeth: Math.round(clamp(Number(input?.gearTeeth ?? fallback.gearTeeth ?? 0), 0, 300)),
    measurementPoint,
    direction,
    dateTaken: String(input?.dateTaken || fallback.dateTaken || new Date().toISOString().slice(0, 10)),
    technician: String(input?.technician || fallback.technician || '').slice(0, 80),
    criticality: clamp(Number(input?.criticality ?? fallback.criticality ?? 70), 0, 100),
    productionImpact: clamp(Number(input?.productionImpact ?? fallback.productionImpact ?? 70), 0, 100),
    safetyImpact: clamp(Number(input?.safetyImpact ?? fallback.safetyImpact ?? 50), 0, 100),
    sourceUploadName: String(input?.sourceUploadName || fallback.sourceUploadName).slice(0, 120),
    notes: String(input?.notes || fallback.notes).slice(0, 220),
    confidence: clamp(Number(input?.confidence ?? fallback.confidence), 0, 100),
  };
}

export function normalizeBearingModel(input: string): string {
  return input.toUpperCase().trim().replace(/\s/g, '').replace(/SKF|FAG|NSK|NTN/g, '');
}

export function calcBearingFrequencies(modelInput: string, rpm: number): {
  model: string | null;
  spec: BearingSpec | null;
  values: { bpfo: number | null; bpfi: number | null; ftf: number | null; bsf: number | null };
  exact: boolean;
} {
  const model = normalizeBearingModel(modelInput);
  const rpmHz = rpm / 60;
  const spec = bearingDatabase[model] ?? null;

  if (spec) {
    return {
      model,
      spec,
      exact: true,
      values: {
        bpfo: spec.BPFO * rpmHz,
        bpfi: spec.BPFI * rpmHz,
        ftf: spec.FTF * rpmHz,
        bsf: spec.BSF * rpmHz,
      },
    };
  }

  const fallback = model.match(/(\d{2})(\d{2})/);
  if (!fallback) {
    return {
      model: model || null,
      spec: null,
      exact: false,
      values: { bpfo: null, bpfi: null, ftf: null, bsf: null },
    };
  }

  return {
    model,
    spec: null,
    exact: false,
    values: {
      bpfo: 3.57 * rpmHz,
      bpfi: 5.43 * rpmHz,
      ftf: 0.4 * rpmHz,
      bsf: 2.39 * rpmHz,
    },
  };
}

export function effectiveRpm(context: MachineContext): number {
  if (context.rpmSource === 'detected' && context.detectedRpm) {
    return context.detectedRpm;
  }
  if (context.rpmSource === 'master' && context.masterRpm) {
    return context.masterRpm;
  }
  return context.rpm;
}

export function detectRpmFromPeaks(peaks: Array<{ freq: number; amp: number }>, fallbackRpm: number): number {
  const valid = peaks
    .filter((peak) => Number.isFinite(peak.freq) && Number.isFinite(peak.amp) && peak.freq >= 5 && peak.freq <= 80)
    .sort((a, b) => b.amp - a.amp);
  return valid[0] ? Math.round(valid[0].freq * 60) : fallbackRpm;
}

export function frequencyMarkers(context: MachineContext): FrequencyMarker[] {
  const rpm = effectiveRpm(context);
  const oneX = rpm / 60;
  const bearing = calcBearingFrequencies(context.bearingModel, rpm);
  const markers: FrequencyMarker[] = [
    { label: '1X', freq: oneX, source: 'Running speed' },
    { label: '2X', freq: oneX * 2, source: '2x running speed' },
    { label: '3X', freq: oneX * 3, source: '3x running speed' },
    { label: '4X', freq: oneX * 4, source: '4x running speed' },
    { label: 'BPF', freq: context.vaneCount ? context.vaneCount * oneX : null, source: 'Blade pass frequency' },
    { label: 'GMF', freq: context.gearTeeth ? context.gearTeeth * oneX : null, source: 'Gear mesh frequency' },
    { label: 'BPFO', freq: bearing.values.bpfo, source: 'Bearing outer race' },
    { label: 'BPFI', freq: bearing.values.bpfi, source: 'Bearing inner race' },
    { label: 'BSF', freq: bearing.values.bsf, source: 'Ball spin frequency' },
    { label: 'FTF', freq: bearing.values.ftf, source: 'Fundamental train frequency' },
  ];

  return markers;
}

export function buildPeakInsights(
  peaks: Array<{ freq: number; amp: number; order: string | number }>,
  context: MachineContext,
): PeakInsight[] {
  const markers = frequencyMarkers(context).filter((marker) => marker.freq);
  return peaks
    .filter((peak) => Number.isFinite(peak.freq) && Number.isFinite(peak.amp))
    .sort((a, b) => b.amp - a.amp)
    .slice(0, 8)
    .map((peak, index) => {
      const match = markers.find((marker) => marker.freq && Math.abs(peak.freq - marker.freq) <= Math.max(2, marker.freq * 0.04));
      return {
        rank: index + 1,
        frequency: peak.freq,
        amplitude: peak.amp,
        possibleSource: match ? `${match.label} / ${match.source}` : 'Non-synchronous / review spectrum',
      };
    });
}

export function defaultPlotCalibration(type: UploadedAsset['type'] = 'Spectrum'): PlotCalibration {
  return {
    xMin: 0,
    xMax: type === 'Waveform' ? 1 : 1000,
    yMin: type === 'Waveform' ? -10 : 0,
    yMax: type === 'Waveform' ? 10 : 20,
    plotLeft: 8,
    plotTop: 8,
    plotWidth: 84,
    plotHeight: 76,
  };
}

export async function extractImageDataFromAsset(asset: UploadedAsset): Promise<UploadedAsset> {
  if (!asset.src.startsWith('data:image/')) {
    return {
      ...asset,
      extractionStatus: asset.extractedPeaks?.length ? 'extracted' : 'failed',
      parseError: asset.extractedPeaks?.length ? undefined : 'Unsupported image source. Re-upload the original image.',
    };
  }

  try {
    const calibration = normalizeCalibration(asset.calibration, asset.type);
    const result = await extractImagePeaksFromDataUrl(asset.src, asset.type, calibration);
    return {
      ...asset,
      calibration,
      extractionStatus: result.status,
      extractedPeaks: result.peaks,
      extractionConfidence: result.confidence,
      extractionConfidenceLabel: result.confidenceLabel,
      parseError: result.status === 'failed' ? result.message : undefined,
      tracePoints: result.tracePoints,
    };
  } catch (error) {
    return {
      ...asset,
      extractionStatus: 'failed',
      parseError: error instanceof Error ? error.message : 'Image extraction failed.',
    };
  }
}

export async function extractImagePeaksFromDataUrl(
  src: string,
  type: UploadedAsset['type'],
  calibration = defaultPlotCalibration(type),
): Promise<{
  status: 'needs-calibration' | 'extracted' | 'failed';
  confidence: number;
  confidenceLabel: ExtractionConfidence;
  peaks: ExtractedPeak[];
  tracePoints: Array<{ x: number; y: number }>;
  message: string;
}> {
  const image = await loadImage(src);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context || canvas.width < 120 || canvas.height < 80) {
    return {
      status: 'failed',
      confidence: 0,
      confidenceLabel: 'low',
      peaks: [],
      tracePoints: [],
      message: 'Image too small or canvas unavailable.',
    };
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const rect = calibrationRect(calibration, canvas.width, canvas.height);
  const imageData = context.getImageData(rect.left, rect.top, rect.width, rect.height);
  const columns = extractColumnSignals(imageData.data, rect.width, rect.height);
  const smoothed = smoothSeries(columns.map((column) => column.energy), 5);
  const tracePoints = columns
    .filter((column, index) => index % Math.max(1, Math.round(rect.width / 180)) === 0)
    .map((column, index) => ({
      x: calibration.xMin + (index / Math.max(1, columns.length - 1)) * (calibration.xMax - calibration.xMin),
      y: calibration.yMax - (column.y / Math.max(1, rect.height - 1)) * (calibration.yMax - calibration.yMin),
    }));

  const sortedEnergy = [...smoothed].sort((a, b) => a - b);
  const median = sortedEnergy[Math.floor(sortedEnergy.length * 0.5)] ?? 0;
  const high = sortedEnergy[Math.floor(sortedEnergy.length * 0.92)] ?? 0;
  const contrast = high - median;
  const minDistance = Math.max(8, Math.round(rect.width * 0.035));
  const threshold = median + Math.max(8, contrast * 0.45);
  const candidates: ExtractedPeak[] = [];

  for (let x = 2; x < smoothed.length - 2; x += 1) {
    const energy = smoothed[x];
    if (energy < threshold || energy < smoothed[x - 1] || energy < smoothed[x + 1]) {
      continue;
    }
    const tooClose = candidates.some((peak) => peak.pixelX != null && Math.abs(peak.pixelX - x) < minDistance);
    if (tooClose) {
      const existing = candidates.find((peak) => peak.pixelX != null && Math.abs(peak.pixelX - x) < minDistance);
      if (existing && energy > (existing.confidence / 100) * high) {
        existing.pixelX = x;
        existing.pixelY = columns[x].y;
        existing.frequency = mapXToFrequency(x, rect.width, calibration);
        existing.amplitude = mapYToAmplitude(columns[x].y, rect.height, calibration);
        existing.confidence = clamp((energy / Math.max(1, high)) * 100, 35, 96);
      }
      continue;
    }
    candidates.push({
      id: cryptoId(),
      label: type === 'Waveform' ? 'Trace excursion' : 'Image peak',
      frequency: mapXToFrequency(x, rect.width, calibration),
      amplitude: mapYToAmplitude(columns[x].y, rect.height, calibration),
      pixelX: x,
      pixelY: columns[x].y,
      confidence: clamp((energy / Math.max(1, high)) * 100, 35, 96),
    });
  }

  const peaks = candidates
    .filter((peak) => Number.isFinite(peak.frequency) && Number.isFinite(peak.amplitude))
    .sort((a, b) => b.amplitude - a.amplitude)
    .slice(0, type === 'Waveform' ? 5 : 12)
    .map((peak, index) => ({
      ...peak,
      label: type === 'Waveform' ? `W${index + 1}` : `P${index + 1}`,
      frequency: Number(peak.frequency.toFixed(2)),
      amplitude: Number(peak.amplitude.toFixed(2)),
    }));

  const density = columns.filter((column) => column.energy > threshold).length / Math.max(1, columns.length);
  const baseConfidence = clamp(contrast * 0.42 + peaks.length * 7 + density * 28, 8, type === 'Waveform' ? 72 : 94);
  const confidence = peaks.length ? Number(baseConfidence.toFixed(0)) : Math.min(30, Number(baseConfidence.toFixed(0)));
  const confidenceLabel = confidence >= 74 ? 'high' : confidence >= 48 ? 'medium' : 'low';
  const status = confidence >= 45 && peaks.length ? 'extracted' : 'needs-calibration';

  return {
    status,
    confidence,
    confidenceLabel,
    peaks,
    tracePoints,
    message: status === 'extracted'
      ? `${peaks.length} candidate peak(s) extracted from ${type.toLowerCase()} photo.`
      : 'Needs manual calibration: set plot region and axis range, then extract again.',
  };
}

export function mergeExtractedPeaksToRows(uploads: UploadedAsset[]): PeakInputRow[] {
  const rows = uploads
    .flatMap((asset) =>
      (asset.extractedPeaks ?? []).map((peak) => ({
        asset,
        peak,
      })),
    )
    .filter(({ peak }) => Number.isFinite(peak.frequency) && Number.isFinite(peak.amplitude))
    .sort((a, b) => b.peak.amplitude - a.peak.amplitude)
    .slice(0, 12)
    .map(({ asset, peak }, index) => ({
      id: cryptoId(),
      order: peak.label || `IMG${index + 1}`,
      freq: peak.frequency.toFixed(1),
      amp: peak.amplitude.toFixed(1),
      source: `${asset.name} B${asset.bearing}${String(asset.direction).slice(0, 1).toUpperCase()}`,
    }));

  return rows.map(({ source: _source, ...row }) => row);
}

export function parseTabularPeaks(text: string): ExtractedPeak[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/[,\t; ]+/).map(Number))
    .filter((values) => values.length >= 2 && Number.isFinite(values[0]) && Number.isFinite(values[1]))
    .slice(0, 60)
    .map(([frequency, amplitude], index) => ({
      id: cryptoId(),
      label: `CSV${index + 1}`,
      frequency,
      amplitude,
      confidence: 95,
    }));
}

export function extractionConfidencePenalty(uploads: UploadedAsset[]): number {
  const extracted = uploads.filter((asset) => asset.extractionStatus === 'extracted' && asset.extractedPeaks?.length);
  if (!uploads.length || !extracted.length) {
    return 24;
  }
  const average = extracted.reduce((sum, asset) => sum + (asset.extractionConfidence ?? 40), 0) / extracted.length;
  return Math.round(clamp(28 - average * 0.22, 0, 28));
}

function normalizeCalibration(calibration: PlotCalibration | undefined, type: UploadedAsset['type']): PlotCalibration {
  const fallback = defaultPlotCalibration(type);
  return {
    xMin: Number.isFinite(calibration?.xMin) ? Number(calibration?.xMin) : fallback.xMin,
    xMax: Number.isFinite(calibration?.xMax) ? Number(calibration?.xMax) : fallback.xMax,
    yMin: Number.isFinite(calibration?.yMin) ? Number(calibration?.yMin) : fallback.yMin,
    yMax: Number.isFinite(calibration?.yMax) ? Number(calibration?.yMax) : fallback.yMax,
    plotLeft: clamp(Number(calibration?.plotLeft ?? fallback.plotLeft), 0, 95),
    plotTop: clamp(Number(calibration?.plotTop ?? fallback.plotTop), 0, 95),
    plotWidth: clamp(Number(calibration?.plotWidth ?? fallback.plotWidth), 5, 100),
    plotHeight: clamp(Number(calibration?.plotHeight ?? fallback.plotHeight), 5, 100),
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Image could not be decoded.'));
    image.src = src;
  });
}

function calibrationRect(calibration: PlotCalibration, width: number, height: number): { left: number; top: number; width: number; height: number } {
  const left = Math.round((calibration.plotLeft / 100) * width);
  const top = Math.round((calibration.plotTop / 100) * height);
  const rectWidth = Math.max(16, Math.round((calibration.plotWidth / 100) * width));
  const rectHeight = Math.max(16, Math.round((calibration.plotHeight / 100) * height));
  return {
    left: clamp(left, 0, width - 2),
    top: clamp(top, 0, height - 2),
    width: Math.min(rectWidth, width - left),
    height: Math.min(rectHeight, height - top),
  };
}

function extractColumnSignals(data: Uint8ClampedArray, width: number, height: number): Array<{ y: number; energy: number }> {
  const columns: Array<{ y: number; energy: number }> = [];
  for (let x = 0; x < width; x += 1) {
    let bestY = Math.round(height * 0.5);
    let bestScore = 0;
    let columnEnergy = 0;
    for (let y = 0; y < height; y += 1) {
      const offset = (y * width + x) * 4;
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      const saturation = Math.max(red, green, blue) - Math.min(red, green, blue);
      const score = Math.max(0, 210 - luminance) + saturation * 0.5;
      columnEnergy += score > 42 ? score : 0;
      if (score > bestScore) {
        bestScore = score;
        bestY = y;
      }
    }
    columns.push({ y: bestY, energy: columnEnergy / Math.max(1, height) });
  }
  return columns;
}

function smoothSeries(values: number[], radius: number): number[] {
  return values.map((_, index) => {
    let total = 0;
    let count = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const value = values[index + offset];
      if (Number.isFinite(value)) {
        total += value;
        count += 1;
      }
    }
    return total / Math.max(1, count);
  });
}

function mapXToFrequency(x: number, width: number, calibration: PlotCalibration): number {
  const ratio = x / Math.max(1, width - 1);
  return calibration.xMin + ratio * (calibration.xMax - calibration.xMin);
}

function mapYToAmplitude(y: number, height: number, calibration: PlotCalibration): number {
  const ratio = y / Math.max(1, height - 1);
  return calibration.yMax - ratio * (calibration.yMax - calibration.yMin);
}

export function toOrder(value: string | number, freq: number, rpmHz: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
  if (Number.isFinite(parsed)) {
    return parsed;
  }

  if (Number.isFinite(freq) && rpmHz > 0) {
    return freq / rpmHz;
  }

  return Number.NaN;
}

function closeTo(value: number, target: number, tolerance = 0.3): boolean {
  return Math.abs(value - target) <= tolerance;
}

export function rankSpectrumPeaks(
  peaks: Array<{ freq: number; amp: number; order: string | number }>,
  rpm: number,
  direction: MeasurementDirection,
  context = defaultMachineContext(),
): AnalysisResultItem[] {
  const rpmHz = rpm / 60;
  const maxAmp = Math.max(...peaks.map((peak) => peak.amp), 0);
  const machineContext = normalizeMachineContext({ ...context, rpm });
  const bearingFrequencies = calcBearingFrequencies(machineContext.bearingModel, rpm);

  const results = faultOrder.map((key) => {
    const profile = faultProfiles[key];
    let score = 0;
    const evidence: string[] = [];

    const is1X = peaks.some((peak) => closeTo(toOrder(peak.order, peak.freq, rpmHz), 1) && peak.amp > maxAmp * 0.7);
    const is2X = peaks.some((peak) => closeTo(toOrder(peak.order, peak.freq, rpmHz), 2) && peak.amp > maxAmp * 0.5);
    const harmonics = peaks.filter((peak) => {
      const order = toOrder(peak.order, peak.freq, rpmHz);
      return Number.isFinite(order) && closeTo(order, Math.round(order), 0.2) && Math.round(order) > 1;
    }).length;
    const hasNonSync = peaks.some((peak) => {
      const order = toOrder(peak.order, peak.freq, rpmHz);
      return Number.isFinite(order) && Math.abs(order - Math.round(order)) > 0.3 && order > 1.5;
    });
    const hasBearingDefect = Object.values(bearingFrequencies.values).some((target) =>
      target
        ? peaks.some((peak) => Math.abs(peak.freq - target) <= Math.max(2, target * 0.04))
        : false,
    );
    const isFluidMachine = ['pump', 'fan', 'compressor', 'turbine'].includes(machineContext.drivenComponent);
    const bladePass = rpmHz * machineContext.vaneCount;
    const hasBladePass = peaks.some((peak) => Math.abs(peak.freq - bladePass) <= Math.max(3, bladePass * 0.05));

    switch (key) {
      case 'normal':
        if (maxAmp < 1 && peaks.length <= 2) {
          score += 3;
          evidence.push('Low amplitude and few peaks');
        }
        if (direction === 'radial') {
          score += 1;
        }
        break;
      case 'unbalance':
        if (is1X) {
          score += 3;
          evidence.push('1X dominant');
        }
        if (direction === 'radial') {
          score += 1;
          evidence.push('Radial measurement');
        }
        if (!is2X) {
          score += 1;
          evidence.push('Low 2X content');
        }
        break;
      case 'misalignment':
        if (is2X) {
          score += 3;
          evidence.push('2X significant');
        }
        if (direction === 'axial' || direction === 'both') {
          score += 2;
          evidence.push('Axial energy elevated');
        }
        if (peaks.some((peak) => closeTo(toOrder(peak.order, peak.freq, rpmHz), 3) && peak.amp > 1)) {
          score += 1;
          evidence.push('3X present');
        }
        if (machineContext.couplingType === 'flexible' || machineContext.couplingType === 'direct') {
          score += 1;
          evidence.push(`${machineContext.couplingType} coupling context`);
        }
        break;
      case 'looseness':
        if (harmonics >= 3) {
          score += 3;
          evidence.push('Multiple harmonics');
        }
        if (peaks.some((peak) => {
          const order = toOrder(peak.order, peak.freq, rpmHz);
          return Number.isFinite(order) && order >= 0.4 && order <= 0.6;
        })) {
          score += 2;
          evidence.push('Sub-harmonic detected');
        }
        break;
      case 'bearing':
        if (hasNonSync) {
          score += 3;
          evidence.push('Non-synchronous peaks');
        }
        if (hasBearingDefect) {
          score += 4;
          evidence.push(`Bearing defect frequency near ${machineContext.bearingModel || 'model'} calculation`);
        }
        if (peaks.some((peak) => peak.freq > 1000 || toOrder(peak.order, peak.freq, rpmHz) > 10)) {
          score += 1;
          evidence.push('High-frequency content');
        }
        break;
      case 'resonance':
        if (
          peaks.some((peak) => {
            const order = toOrder(peak.order, peak.freq, rpmHz);
            return Number.isFinite(order) && order > 1.2 && order < 3 && peak.amp > maxAmp * 0.8;
          })
        ) {
          score += 3;
          evidence.push('Amplification hump');
        }
        break;
      case 'cavitation':
        if (peaks.some((peak) => peak.freq > 1000)) {
          score += 2;
          evidence.push('Broadband high-frequency noise');
        }
        if (isFluidMachine && (hasBladePass || machineContext.load > 75)) {
          score += 3;
          evidence.push(`${machineContext.drivenComponent} context with blade-pass/load risk`);
        }
        break;
      case 'electrical':
        if (peaks.some((peak) => Math.abs(peak.freq - 100) < 5 || Math.abs(peak.freq - 120) < 5)) {
          score += 3;
          evidence.push('2x line frequency');
        }
        if (machineContext.machineType === 'motor') {
          score += 1;
          evidence.push('Motor electrical context');
        }
        break;
    }

    const confidence = Math.min(97, Math.max(35, 45 + score * 8 + (maxAmp > 2 ? 6 : 0)));

    return {
      key,
      name: profile.name,
      icon: profile.icon,
      score,
      confidence,
      evidence,
      desc: profile.desc,
    };
  });

  return results.sort((a, b) => b.score - a.score);
}

export function buildDiagnosisSummary(
  peaks: Array<{ freq: number; amp: number; order: string | number }>,
  results: AnalysisResultItem[],
  context: MachineContext,
): DiagnosisSummary {
  const rpm = effectiveRpm(context);
  const rpmHz = rpm / 60;
  const maxAmp = Math.max(...peaks.map((peak) => peak.amp), 0);
  const top = results[0];
  const secondary = results.find((item) => item.key !== top?.key && item.score > 0);
  const markers = frequencyMarkers(context);
  const oneX = peaks.find((peak) => closeTo(toOrder(peak.order, peak.freq, rpmHz), 1, 0.2));
  const twoX = peaks.find((peak) => closeTo(toOrder(peak.order, peak.freq, rpmHz), 2, 0.2));
  const threeX = peaks.find((peak) => closeTo(toOrder(peak.order, peak.freq, rpmHz), 3, 0.2));
  const bpf = markers.find((marker) => marker.label === 'BPF')?.freq ?? null;
  const hasBpf = bpf ? peaks.some((peak) => Math.abs(peak.freq - bpf) <= Math.max(2, bpf * 0.04) && peak.amp > maxAmp * 0.4) : false;
  const bearingMarkers = markers.filter((marker) => ['BPFO', 'BPFI', 'BSF', 'FTF'].includes(marker.label) && marker.freq);
  const hasBearing = bearingMarkers.some((marker) =>
    marker.freq ? peaks.some((peak) => Math.abs(peak.freq - marker.freq!) <= Math.max(2, marker.freq! * 0.04) && peak.amp > maxAmp * 0.35) : false,
  );
  const condition: DiagnosisSummary['assetCondition'] =
    maxAmp >= 10 || top?.confidence >= 86 ? 'Critical' :
      maxAmp >= 6 || top?.confidence >= 74 ? 'Warning' :
        maxAmp >= 3 ? 'Monitor' : 'Normal';
  const evidence: string[] = [];

  if (oneX && oneX.amp >= maxAmp * 0.65) {
    evidence.push(`1X dominant at ${oneX.freq.toFixed(1)} Hz (${oneX.amp.toFixed(1)} mm/s)`);
  }
  if (context.direction === 'axial' && oneX && oneX.amp >= 3) {
    evidence.push(`High 1X axial vibration at ${context.measurementPoint}`);
  }
  if (oneX && twoX && threeX) {
    evidence.push('1X, 2X, and 3X harmonics appear');
  }
  if (!hasBpf) {
    evidence.push('No dominant Blade Pass Frequency detected');
  }
  if (!hasBearing) {
    evidence.push('Bearing defect frequencies are not dominant');
  }
  if (context.driveType === 'belt' || context.bearingPosition === 'Pulley') {
    evidence.push('Belt/pulley drive context requires pulley alignment and tension check');
  }

  const notDominant = [
    hasBearing ? '' : 'Bearing Defect',
    hasBpf ? '' : 'Blade Pass Problem',
    top?.key === 'electrical' ? '' : 'Electrical Fault',
  ].filter(Boolean);
  const trendIncrease = condition === 'Critical' ? 90 : condition === 'Warning' ? 55 : condition === 'Monitor' ? 25 : 0;
  const priorityBreakdown = {
    severity: Math.round(severityScore(condition) * 0.35),
    criticality: Math.round(context.criticality * 0.25),
    production: Math.round(context.productionImpact * 0.2),
    safety: Math.round(context.safetyImpact * 0.1),
    trend: Math.round(trendIncrease * 0.1),
  };
  const priorityScore = Math.round(
    priorityBreakdown.severity +
      priorityBreakdown.criticality +
      priorityBreakdown.production +
      priorityBreakdown.safety +
      priorityBreakdown.trend,
  );

  return {
    assetCondition: condition,
    dominantFault: top ? top.name : 'Undetermined',
    secondaryFault: secondary ? secondary.name : 'No strong secondary fault',
    notDominant,
    confidence: top?.confidence ?? 35,
    evidence: evidence.length ? evidence : ['Insufficient peaks. Add spectrum peaks or upload mapped spectrum files.'],
    recommendedActions: recommendedActionsFor(top?.key ?? 'normal', context, rpm),
    priorityScore,
    priorityLevel: priorityScore >= 80 ? 'P1 - Critical' : priorityScore >= 60 ? 'P2 - High' : priorityScore >= 40 ? 'P3 - Monitor' : 'P4 - Routine',
    pointDiagnoses: [{
      point: context.measurementPoint,
      direction: context.direction,
      faultName: top ? top.name : 'Undetermined',
      confidence: top?.confidence ?? 35,
      evidence: top?.evidence?.length ? top.evidence : evidence.slice(0, 3),
    }],
    trendWarning: condition === 'Critical'
      ? 'Vibration trend proxy indicates urgent review. Compare against latest historical measurement.'
      : null,
    priorityBreakdown,
  };
}

function severityScore(condition: DiagnosisSummary['assetCondition']): number {
  switch (condition) {
    case 'Critical':
      return 100;
    case 'Warning':
      return 75;
    case 'Monitor':
      return 45;
    default:
      return 15;
  }
}

function recommendedActionsFor(faultKey: FaultKey, context: MachineContext, rpm: number): string[] {
  const actions = [
    `Verify RPM input, use ${rpm.toFixed(0)} RPM from ${context.rpmSource} source.`,
    'Retake vibration data after correction and compare trend.',
  ];
  if (faultKey === 'misalignment') {
    actions.splice(1, 0, 'Inspect motor and driven component alignment.', 'Check coupling condition, soft foot, and base strain.');
  }
  if (faultKey === 'looseness') {
    actions.splice(1, 0, 'Check bearing housing bolts, base looseness, and structural looseness.', 'Inspect pulley alignment and belt tension if belt drive is used.');
  }
  if (faultKey === 'unbalance') {
    actions.splice(1, 0, 'Inspect rotor/fan cleanliness, missing weight, and balance condition.');
  }
  if (faultKey === 'bearing') {
    actions.splice(1, 0, `Confirm bearing model ${context.bearingModel || '-'} and inspect lubrication/defect frequencies.`);
  }
  if (faultKey === 'cavitation') {
    actions.splice(1, 0, 'Check process flow, suction condition, impeller, and blade-pass symptoms.');
  }
  return actions;
}

export function inferUploadFault(
  uploads: UploadedAsset[],
  rpm: number,
  context = defaultMachineContext(),
): UploadAnalysisResult {
  const machineContext = inferMachineContextFromUploads(uploads, { ...context, rpm });
  const spectrumCount = uploads.filter((upload) => upload.type === 'Spectrum').length;
  const waveformCount = uploads.filter((upload) => upload.type === 'Waveform').length;
  const bearingSet = new Set(uploads.map((upload) => upload.bearing));
  const hasBearingWords = uploads.some((upload) => /bearing|brg|bpfo|bpfi|ftf|bsf/i.test(upload.name));
  const hasAxial = uploads.some((upload) => upload.direction === 'axial');
  const hasBladeOrFluidWords = uploads.some((upload) => /cav|gravel|impeller|vane|blade|flow|pump|fan|compress/i.test(upload.name));
  const hasMotorWords = uploads.some((upload) => /motor|elect|2lf|100hz|120hz|current|stator|rotor/i.test(upload.name));

  let faultKey: FaultKey = 'unbalance';
  if (bearingSet.size >= 3 || hasBearingWords) {
    faultKey = 'bearing';
  } else if (waveformCount > spectrumCount) {
    faultKey = 'looseness';
  } else if (spectrumCount >= 2 && hasAxial) {
    faultKey = 'misalignment';
  } else if (uploads.some((upload) => /reson/i.test(upload.name))) {
    faultKey = 'resonance';
  } else if (hasBladeOrFluidWords && ['pump', 'fan', 'compressor', 'turbine'].includes(machineContext.drivenComponent)) {
    faultKey = 'cavitation';
  } else if (hasMotorWords) {
    faultKey = 'electrical';
  }

  const confidence = Math.min(
    97,
    82 + uploads.length * 2 + bearingSet.size * 3 + (spectrumCount && waveformCount ? 4 : 0),
  );

  const evidence = [
    {
      label: 'Total File',
      value: `${uploads.length} file`,
      match: uploads.length > 1,
    },
    {
      label: 'Spectrum / Waveform',
      value: `${spectrumCount} / ${waveformCount}`,
      match: spectrumCount > 0 && waveformCount > 0,
    },
    {
      label: 'Bearing Coverage',
      value: Array.from(bearingSet)
        .sort()
        .map((bearing) => `B${bearing}`)
        .join(', '),
      match: bearingSet.size >= 2,
    },
    {
      label: 'Dominant RPM',
      value: `1X RPM (${(machineContext.rpm / 60).toFixed(1)} Hz)`,
      match: faultKey === 'unbalance',
    },
    {
      label: 'Bearing Terms',
      value: hasBearingWords ? 'BPFO/BPFI terms detected' : 'Calculated from bearing position',
      match: faultKey === 'bearing',
    },
    {
      label: 'Machine Context',
      value: `${machineContext.machineType} -> ${machineContext.drivenComponent}, ${machineContext.couplingType} coupling`,
      match: machineContext.confidence >= 70,
    },
    {
      label: 'Measurement Point',
      value: `${machineContext.measurementPoint} / ${machineContext.direction.toUpperCase()}`,
      match: hasAxial || bearingSet.size > 0,
    },
  ];

  return {
    faultKey,
    confidence,
    evidence,
    machineContext: {
      ...machineContext,
      confidence: Math.min(98, Math.max(machineContext.confidence, confidence - 8)),
      notes: `Context inferred from ${uploads.length} uploaded file(s). Review editable machine data before final diagnosis.`,
    },
    recommendedPeaks: recommendedPeakRowsForFault(faultKey, machineContext),
    coverage: ['1', '2', '3', '4'].map((bearing) => ({
      bearing: bearing as '1' | '2' | '3' | '4',
      count: uploads.filter((upload) => upload.bearing === bearing).length,
    })),
  };
}

export function recommendedPeakRowsForFault(faultKey: FaultKey, context: MachineContext): PeakInputRow[] {
  const rpmHz = context.rpm / 60;
  const bearing = calcBearingFrequencies(context.bearingModel, context.rpm);
  const bladePass = rpmHz * context.vaneCount;
  const rows: Array<{ order: string; freq: number; amp: number }> = [];

  switch (faultKey) {
    case 'unbalance':
      rows.push({ order: '1X', freq: rpmHz, amp: 3.2 }, { order: '2X', freq: rpmHz * 2, amp: 0.8 });
      break;
    case 'misalignment':
      rows.push({ order: '1X', freq: rpmHz, amp: 1.8 }, { order: '2X', freq: rpmHz * 2, amp: 2.6 }, { order: '3X', freq: rpmHz * 3, amp: 1.1 });
      break;
    case 'looseness':
      rows.push({ order: '0.5X', freq: rpmHz * 0.5, amp: 1.3 }, { order: '1X', freq: rpmHz, amp: 2.4 }, { order: '2X', freq: rpmHz * 2, amp: 1.7 }, { order: '3X', freq: rpmHz * 3, amp: 1.2 });
      break;
    case 'bearing':
      rows.push(
        { order: '1X', freq: rpmHz, amp: 0.8 },
        { order: 'BPFO', freq: bearing.values.bpfo ?? rpmHz * 3.57, amp: 2.1 },
        { order: 'BPFI', freq: bearing.values.bpfi ?? rpmHz * 5.43, amp: 1.8 },
      );
      break;
    case 'resonance':
      rows.push({ order: '1X', freq: rpmHz, amp: 1.2 }, { order: '2.4X', freq: rpmHz * 2.4, amp: 3.4 });
      break;
    case 'cavitation':
      rows.push({ order: 'BPF', freq: bladePass, amp: 2.4 }, { order: 'HF', freq: Math.max(1000, bladePass * 4), amp: 1.9 });
      break;
    case 'electrical':
      rows.push({ order: '1X', freq: rpmHz, amp: 1.0 }, { order: '2LF', freq: 100, amp: 2.2 }, { order: '2LF/60Hz', freq: 120, amp: 1.5 });
      break;
    default:
      rows.push({ order: '1X', freq: rpmHz, amp: 0.7 });
      break;
  }

  return rows.map((row) => ({
    id: cryptoId(),
    order: row.order,
    freq: row.freq.toFixed(1),
    amp: row.amp.toFixed(1),
  }));
}

function inferMachineContextFromUploads(uploads: UploadedAsset[], context: MachineContext): MachineContext {
  const names = uploads.map((upload) => upload.name.toLowerCase()).join(' ');
  const inferred = normalizeMachineContext(context);
  const machineMap: Array<[MachineContext['machineType'], RegExp]> = [
    ['compressor', /compress|blower/],
    ['gearbox', /gear|gbx|reducer/],
    ['turbine', /turbine/],
    ['fan', /\bfan\b|blower|idfan|fdfan/],
    ['pump', /pump|pmp|impeller|cav/],
    ['motor', /motor|mtr|elect|stator|rotor/],
  ];
  const matchedType = machineMap.find(([, pattern]) => pattern.test(names))?.[0];
  const dominantBearing = ['1', '2', '3', '4']
    .map((bearing) => ({ bearing, count: uploads.filter((upload) => upload.bearing === bearing).length }))
    .sort((a, b) => b.count - a.count)[0]?.bearing ?? '1';
  const dominantDirection = uploads.some((upload) => upload.direction === 'axial')
    ? 'axial'
    : uploads.some((upload) => upload.direction === 'both')
      ? 'both'
      : 'radial';
  const bearingModel = names.match(/\b(6[023]\d{2}|22\d{3}|23\d{3})\b/i)?.[1] ?? inferred.bearingModel;
  const rpmMatch = names.match(/(?:rpm|speed)[\s_-]*(\d{3,5})|(\d{3,5})[\s_-]*rpm/i);
  const detectedRpm = Number(rpmMatch?.[1] ?? rpmMatch?.[2]);
  const driveType = /belt|pulley/.test(names)
    ? 'belt'
    : /gear/.test(names)
      ? 'gear'
      : inferred.driveType;

  return normalizeMachineContext({
    ...inferred,
    equipmentName: inferEquipmentName(uploads, inferred.equipmentName),
    machineType: matchedType ?? inferred.machineType,
    drivenComponent: matchedType && matchedType !== 'motor' ? matchedType : inferred.drivenComponent,
    driveType,
    couplingType: driveType,
    detectedRpm: Number.isFinite(detectedRpm) ? detectedRpm : inferred.detectedRpm,
    rpm: inferred.rpmSource === 'detected' && Number.isFinite(detectedRpm) ? detectedRpm : inferred.rpm,
    bearingModel,
    bearingCount: Math.max(inferred.bearingCount, Number(dominantBearing)),
    vaneCount: inferVaneCount(names, inferred.vaneCount, matchedType ?? inferred.drivenComponent),
    measurementPoint: `B${dominantBearing}` as MachineContext['measurementPoint'],
    direction: dominantDirection,
    sourceUploadName: uploads[0]?.name ?? inferred.sourceUploadName,
    confidence: Math.min(96, inferred.confidence + uploads.length * 8 + (matchedType ? 12 : 0)),
  });
}

function inferEquipmentName(uploads: UploadedAsset[], fallback: string): string {
  const first = uploads[0]?.name;
  if (!first) {
    return fallback;
  }

  return first
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b(spectrum|waveform|photo|image|b[1-4]|bearing|radial|axial)\b/gi, '')
    .trim()
    .replace(/\s{2,}/g, ' ')
    .slice(0, 60) || fallback;
}

function inferVaneCount(names: string, fallback: number, machineType: MachineContext['machineType']): number {
  const explicit = names.match(/(?:vane|blade|impeller)[\s_-]*(\d{1,2})|(\d{1,2})[\s_-]*(?:vane|blade)/i);
  const value = Number(explicit?.[1] ?? explicit?.[2]);
  if (Number.isFinite(value) && value >= 2 && value <= 24) {
    return value;
  }

  const defaults: Record<MachineContext['machineType'], number> = {
    motor: 6,
    pump: 6,
    fan: 8,
    gearbox: 4,
    compressor: 7,
    turbine: 12,
  };
  return fallback || defaults[machineType];
}

export function highestPoint(row: EquipmentRecord): { label: string; value: number | null } {
  let best = { label: '-', value: -Infinity };
  row.values.forEach((value, index) => {
    if (typeof value === 'number' && value > best.value) {
      best = { label: measurementLabelAt(index), value };
    }
  });

  return best.value === -Infinity ? { label: '-', value: null } : best;
}

export function recommendationFor(row: EquipmentRecord): string {
  const point = highestPoint(row);

  if (row.status === 'ALARM') {
    return 'Segera lakukan detailed diagnosis: spectrum, time waveform, phase, dan corrective maintenance.';
  }

  if (row.status === 'WARNING') {
    return `Prioritaskan inspection dan ambil data spectrum/phase pada point ${point.label}.`;
  }

  if (row.status === 'PREWARNING') {
    return `Naikkan frequency monitoring dan lakukan trend analysis pada point ${point.label}.`;
  }

  if (row.status === 'STAND BY') {
    return 'Pastikan preservation dan test run sesuai schedule.';
  }

  return 'Lanjutkan routine condition monitoring.';
}

export function statusClass(status: EquipmentStatus): string {
  const map: Record<EquipmentStatus, string> = {
    ALARM: 'status-danger',
    WARNING: 'status-warning',
    PREWARNING: 'status-caution',
    NORMAL: 'status-normal',
    'STAND BY': 'status-muted',
  };

  return map[status];
}

export function severityClass(severity: string): string {
  switch (severity) {
    case 'A':
      return 'severity-a';
    case 'B':
      return 'severity-b';
    case 'C':
      return 'severity-c';
    case 'D':
      return 'severity-d';
    default:
      return 'severity-a';
  }
}

export function statusTone(status: EquipmentStatus): string {
  const map: Record<EquipmentStatus, string> = {
    ALARM: 'tone-danger',
    WARNING: 'tone-warning',
    PREWARNING: 'tone-caution',
    NORMAL: 'tone-normal',
    'STAND BY': 'tone-muted',
  };

  return map[status];
}

export function seedHistoryEntry(source: 'spectrum' | 'ai', faultKey: FaultKey, rpm: number, direction: MeasurementDirection, confidence: number, evidence: string[]): HistoryEntry {
  const profile = faultProfiles[faultKey];
  return {
    id: cryptoId(),
    createdAt: new Date().toISOString(),
    source,
    faultKey,
    faultName: profile.name,
    confidence,
    rpm,
    direction,
    evidence,
  };
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures in private mode or when storage is unavailable.
  }
}

function cryptoId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `id-${Math.random().toString(36).slice(2, 10)}`;
}

function measurementLabelAt(index: number): string {
  return measurementLabels[index] ?? '-';
}
