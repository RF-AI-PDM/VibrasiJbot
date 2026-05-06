export type TabKey = 'sim' | 'analysis' | 'ai' | 'equipment' | 'reference';

export type FaultKey =
  | 'normal'
  | 'unbalance'
  | 'misalignment'
  | 'looseness'
  | 'bearing'
  | 'resonance'
  | 'cavitation'
  | 'electrical';

export type SeverityZone = 'A' | 'B' | 'C' | 'D';
export type FaultDirection = 'radial' | 'axial' | 'both';
export type MeasurementDirection = FaultDirection | 'horizontal' | 'vertical';
export type EquipmentStatus = 'ALARM' | 'WARNING' | 'PREWARNING' | 'NORMAL' | 'STAND BY';
export type UserRoleName = 'technician' | 'supervisor' | 'admin';
export type AppMode = 'demo' | 'connected' | 'signed-out' | 'signed-in' | 'error';
export type MachineType = 'motor' | 'pump' | 'fan' | 'gearbox' | 'compressor' | 'turbine';
export type DrivenComponent = MachineType;
export type CouplingType = 'direct' | 'flexible' | 'belt' | 'gear' | 'unknown';
export type RpmSource = 'manual' | 'detected' | 'master';
export type BearingPosition = 'DE' | 'NDE' | 'Motor' | 'Fan' | 'Pulley' | 'Gearbox' | 'Compressor';
export type UploadDataType = 'Spectrum' | 'Waveform' | 'Envelope';
export type SimulationSpeed = 'freeze' | '0.25' | '0.5' | '1' | '2';
export type VibrationGain = 'low' | 'normal' | 'high';
export type ExtractionStatus = 'pending' | 'needs-calibration' | 'extracted' | 'failed';
export type ExtractionConfidence = 'low' | 'medium' | 'high';
export type ExtractionSource = 'local' | 'ai-assisted' | 'manual-corrected';

export interface SpectrumPeak {
  o: number;
  a: number;
  label?: string;
}

export interface FaultProfile {
  key: FaultKey;
  name: string;
  icon: string;
  severity: SeverityZone;
  desc: string;
  spectrum: SpectrumPeak[];
  overall: number;
  phase: number;
  direction: MeasurementDirection;
  recommendations: string[];
  mobiusRef: string;
}

export interface BearingSpec {
  d: number;
  D: number;
  n: number;
  a: number;
  BPFO: number;
  BPFI: number;
  FTF: number;
  BSF: number;
}

export interface EquipmentRecord {
  unit: string;
  no: number;
  equipment: string;
  group?: string | null;
  values: Array<number | null>;
  vibMax: number;
  status: EquipmentStatus;
}

export interface EquipmentDataset {
  key: string;
  label: string;
  monthLabel: string;
  source: string;
  data: EquipmentRecord[];
}

export interface ReferenceCard {
  title: string;
  faultKey?: FaultKey | 'bearing';
  ref: string;
  symptoms: string;
  solution: string;
}

export interface PeakInputRow {
  id: string;
  order: string;
  freq: string;
  amp: string;
}

export interface AnalysisResultItem {
  key: FaultKey;
  name: string;
  icon: string;
  score: number;
  confidence: number;
  evidence: string[];
  desc: string;
}

export interface FrequencyMarker {
  label: string;
  freq: number | null;
  source: string;
}

export interface PeakInsight {
  rank: number;
  frequency: number;
  amplitude: number;
  possibleSource: string;
}

export interface DiagnosisSummary {
  assetCondition: 'Normal' | 'Monitor' | 'Warning' | 'Critical';
  dominantFault: string;
  secondaryFault: string;
  notDominant: string[];
  confidence: number;
  evidence: string[];
  recommendedActions: string[];
  priorityScore: number;
  priorityLevel: string;
  pointDiagnoses?: PointDiagnosis[];
  trendWarning?: string | null;
  priorityBreakdown?: {
    severity: number;
    criticality: number;
    production: number;
    safety: number;
    trend: number;
  };
}

export interface PlotCalibration {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  plotLeft: number;
  plotTop: number;
  plotWidth: number;
  plotHeight: number;
}

export interface ExtractedPeak {
  id: string;
  label?: string;
  frequency: number;
  amplitude: number;
  pixelX?: number;
  pixelY?: number;
  confidence: number;
}

export interface AiProviderSettings {
  enabled: boolean;
  endpoint: string;
  apiKey: string;
  model: string;
  status: 'idle' | 'ready' | 'running' | 'error';
  message: string;
}

export interface AiExtractionEvidence {
  source: string;
  description: string;
  confidence: number;
}

export interface AiVisionRequest {
  model: string;
  context: MachineContext;
  uploads: Array<{
    id: UploadedAsset['id'];
    name: UploadedAsset['name'];
    type: UploadedAsset['type'];
    bearing: UploadedAsset['bearing'];
    direction: UploadedAsset['direction'];
    calibration?: PlotCalibration;
    localPeaks: ExtractedPeak[];
    imageDataUrl?: string;
  }>;
}

export interface AiVisionResult {
  provider: string;
  model: string;
  confidence: number;
  machineContext?: Partial<MachineContext>;
  assets: Array<{
    uploadId: UploadedAsset['id'];
    peaks: Array<Omit<ExtractedPeak, 'id'> & { id?: string }>;
    evidence: string[];
  }>;
  evidence: string[];
}

export interface ImageExtractionConfig {
  calibration: PlotCalibration;
  smoothing: number;
  threshold: number;
  maxPeaks: number;
}

export interface ImageExtractionResult {
  status: ExtractionStatus;
  confidence: number;
  confidenceLabel: ExtractionConfidence;
  peaks: ExtractedPeak[];
  tracePoints?: Array<{ x: number; y: number }>;
  message: string;
}

export interface PointDiagnosis {
  point: MachineContext['measurementPoint'] | string;
  direction: MeasurementDirection;
  faultName: string;
  confidence: number;
  evidence: string[];
}

export interface ReportPayload {
  equipment: EquipmentRecord | null;
  context: MachineContext;
  peaks: PeakInsight[];
  markers: FrequencyMarker[];
  diagnosis: DiagnosisSummary | null;
  uploads: UploadedAsset[];
}

export interface UploadedAsset {
  id: number;
  name: string;
  src: string;
  type: UploadDataType;
  bearing: '1' | '2' | '3' | '4';
  direction: MeasurementDirection;
  file?: File;
  extractionStatus?: ExtractionStatus;
  calibration?: PlotCalibration;
  extractedPeaks?: ExtractedPeak[];
  extractionConfidence?: number;
  extractionConfidenceLabel?: ExtractionConfidence;
  parseError?: string;
  tracePoints?: Array<{ x: number; y: number }>;
  extractionSource?: ExtractionSource;
  aiEvidence?: AiExtractionEvidence[];
}

export interface MachineContext {
  equipmentCode: string;
  equipmentName: string;
  machineType: MachineType;
  drivenComponent: DrivenComponent;
  driveType: CouplingType;
  rpm: number;
  rpmSource: RpmSource;
  detectedRpm: number | null;
  masterRpm: number | null;
  load: number;
  bearingModel: string;
  bearingPosition: BearingPosition;
  couplingType: CouplingType;
  bearingCount: number;
  vaneCount: number;
  gearTeeth: number;
  measurementPoint: 'B1' | 'B2' | 'B3' | 'B4';
  direction: MeasurementDirection;
  dateTaken: string;
  technician: string;
  criticality: number;
  productionImpact: number;
  safetyImpact: number;
  sourceUploadName: string;
  notes: string;
  confidence: number;
}

export interface UploadAnalysisResult {
  faultKey: FaultKey;
  confidence: number;
  evidence: Array<{ label: string; value: string; match: boolean }>;
  coverage: Array<{ bearing: '1' | '2' | '3' | '4'; count: number }>;
  machineContext: MachineContext;
  recommendedPeaks: PeakInputRow[];
}

export interface HistoryEntry {
  id: string;
  createdAt: string;
  source: 'spectrum' | 'ai';
  faultKey: FaultKey;
  faultName: string;
  confidence: number;
  rpm: number;
  direction: MeasurementDirection;
  evidence: string[];
}

export interface AppConnectionState {
  mode: AppMode;
  ready: boolean;
  configured: boolean;
  email: string | null;
  role: UserRoleName | 'guest';
  message: string;
}

export interface AppState {
  currentTab: TabKey;
  rpm: number;
  load: number;
  faultKey: FaultKey;
  direction: FaultDirection;
  wireframe: boolean;
  simulationSpeed: SimulationSpeed;
  vibrationGain: VibrationGain;
  showOrbit: boolean;
  showSensors: boolean;
  showVectors: boolean;
  analysisRpm: number;
  analysisDirection: FaultDirection;
  peakRows: PeakInputRow[];
  analysisResults: AnalysisResultItem[];
  diagnosisSummary: DiagnosisSummary | null;
  uploadedAssets: UploadedAsset[];
  uploadResult: UploadAnalysisResult | null;
  machineContext: MachineContext;
  equipmentDatasetKey: string;
  equipmentUnitFilter: string;
  equipmentStatusFilter: EquipmentStatus | 'ALL';
  equipmentSearch: string;
  uiDensity: 'compact' | 'normal' | 'large';
  uiTextCollapsed: boolean;
  history: HistoryEntry[];
  connection: AppConnectionState;
  aiProviderSettings: AiProviderSettings;
}
