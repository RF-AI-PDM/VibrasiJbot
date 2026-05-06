import {
  faultOrder,
  faultProfiles,
  measurementLabels,
  referenceCards,
  equipmentDatasets,
} from './data';
import {
  appendHistory,
  buildDiagnosisSummary,
  buildAiProcessingSteps,
  buildPeakInsights,
  buildReportInsightsFromRows,
  buildReportPayloadFromRows,
  buildWorkbookRowsFromUploads,
  calcBearingFrequencies,
  defaultPlotCalibration,
  defaultAppState,
  detectRpmFromPeaks,
  effectiveRpm,
  extractImageDataFromAsset,
  fetchAuthConnectionState,
  frequencyMarkers,
  formatHz,
  formatMmps,
  getSupabaseClient,
  getSignedInUserId,
  guessBearing,
  guessDataType,
  guessDirection,
  highestPoint,
  isAiProviderReady,
  isSupabaseConfigured,
  loadPersistedAppState,
  mergeExtractedPeaksToRows,
  mergeAiVisionResultWithUploads,
  nonImagePreview,
  normalizeMachineContext,
  parsePeakInputRows,
  persistAppState,
  parseTabularPeaks,
  rankSpectrumPeaks,
  recommendationFor,
  requestAiVisionAnalysis,
  runAiUploadAnalysis,
  seedHistoryEntry,
  severityClass,
  signInWithPassword,
  signOutSession,
  statusClass,
  validateUploadFile,
} from './services';
import type {
  AppState,
  EquipmentRecord,
  FaultDirection,
  FaultKey,
  HistoryEntry,
  MachineContext,
  PeakInputRow,
  PlotCalibration,
  SimulationSpeed,
  UploadedAsset,
  VibrationGain,
} from './types';
import type { ChartController, ThreeController } from './visuals';

type JsPdfConstructor = typeof import('jspdf').default;
type AutoTableFn = typeof import('jspdf-autotable').default;
type XlsxModule = typeof import('xlsx');

let pdfToolsPromise: Promise<{
  jsPDF: JsPdfConstructor;
  autoTable: AutoTableFn;
}> | null = null;

let xlsxToolsPromise: Promise<XlsxModule> | null = null;

async function loadPdfTools(): Promise<{
  jsPDF: JsPdfConstructor;
  autoTable: AutoTableFn;
}> {
  if (!pdfToolsPromise) {
    pdfToolsPromise = Promise.all([import('jspdf'), import('jspdf-autotable')]).then(([jsPDFModule, autoTableModule]) => ({
      jsPDF: jsPDFModule.default,
      autoTable: autoTableModule.default,
    }));
  }

  return pdfToolsPromise;
}

async function loadXlsxTools(): Promise<XlsxModule> {
  if (!xlsxToolsPromise) {
    xlsxToolsPromise = import('xlsx');
  }

  return xlsxToolsPromise;
}

interface AppControllers {
  three: ThreeController;
  charts: ChartController;
}

const tabs: Array<{ key: AppState['currentTab']; label: string; hint: string }> = [
  { key: 'sim', label: '3D Simulation', hint: 'Machine, waveform, orbit' },
  { key: 'analysis', label: 'Spectrum Analysis', hint: 'Peak scoring and diagnosis' },
  { key: 'ai', label: 'AI Upload', hint: 'Image triage and classification' },
  { key: 'equipment', label: 'Equipment Dashboard', hint: 'Trend and alarm summary' },
  { key: 'reference', label: 'Reference Library', hint: 'Mobius mapping and notes' },
];

const initialState = loadPersistedAppState(defaultAppState());
let state = initialState;
let controllers: AppControllers | null = null;
let authBootstrapped = false;
let pendingUploadPreset: Partial<UploadedAsset> | null = null;
let visualsLoadPromise: Promise<void> | null = null;
let toastTimer = 0;
const MAX_UPLOAD_COUNT = 12;

function qs<T extends Element>(selector: string, scope: ParentNode = document): T | null {
  return scope.querySelector(selector) as T | null;
}

function qsa<T extends Element>(selector: string, scope: ParentNode = document): T[] {
  return Array.from(scope.querySelectorAll(selector)) as T[];
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateTime(value: string): string {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function faultLabel(key: FaultKey): string {
  return faultProfiles[key].name;
}

function tabLabel(key: AppState['currentTab']): string {
  return tabs.find((tab) => tab.key === key)?.label ?? key;
}

function createPeakRow(order = '1X', freq = '', amp = ''): PeakInputRow {
  const id = cryptoId();
  return { id, order, freq, amp };
}

function cryptoId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `id-${Math.random().toString(36).slice(2, 10)}`;
}

function renderFaultButtons(activeKey: FaultKey): string {
  return faultOrder
    .map((key) => {
      const profile = faultProfiles[key];
      const active = key === activeKey ? 'is-active' : '';
      return `
        <button type="button" class="fault-btn ${active}" data-action="set-fault" data-fault="${key}">
          <span class="fault-btn__code">${escapeHtml(profile.icon)}</span>
          <span class="fault-btn__label">${escapeHtml(profile.name)}</span>
        </button>
      `;
    })
    .join('');
}

function renderDirectionButtons(activeDirection: FaultDirection): string {
  const options: Array<{ key: FaultDirection; label: string }> = [
    { key: 'radial', label: 'Radial' },
    { key: 'axial', label: 'Axial' },
    { key: 'both', label: 'Both' },
  ];

  return options
    .map((option) => {
      const active = option.key === activeDirection ? 'is-active' : '';
      return `
        <button type="button" class="direction-btn ${active}" data-action="set-direction" data-direction="${option.key}">
          ${escapeHtml(option.label)}
        </button>
      `;
    })
    .join('');
}

function renderMachineLayoutButtons(context: MachineContext): string {
  const currentLayout = context.machineType === 'motor' && context.drivenComponent === 'motor'
    ? 'motor'
    : context.drivenComponent;
  const options: Array<{ key: MachineContext['machineType']; label: string; hint: string }> = [
    { key: 'motor', label: 'Motor Only', hint: 'Rotor, stator, shaft' },
    { key: 'pump', label: 'Motor + Pump', hint: 'Direct train' },
    { key: 'fan', label: 'Motor + Fan', hint: 'Blower train' },
  ];

  return options
    .map((option) => {
      const active = option.key === currentLayout ? 'is-active' : '';
      return `
        <button type="button" class="layout-btn ${active}" data-action="set-machine-layout" data-layout="${option.key}">
          <span>${escapeHtml(option.label)}</span>
          <small>${escapeHtml(option.hint)}</small>
        </button>
      `;
    })
    .join('');
}

function renderHistoryCards(history: HistoryEntry[], limit = 5): string {
  if (!history.length) {
    return `
      <div class="empty-state">
        <div class="empty-state__title">Belum ada riwayat</div>
        <div class="empty-state__text">Hasil analisis spectrum dan AI akan muncul di sini setelah dijalankan.</div>
      </div>
    `;
  }

  return history
    .slice(0, limit)
    .map((entry) => {
      const tone = statusToneForFault(entry.faultKey);
      return `
        <div class="history-card">
          <div class="history-card__top">
            <div>
              <div class="history-card__fault">${escapeHtml(entry.faultName)}</div>
              <div class="history-card__meta">${escapeHtml(entry.source.toUpperCase())} | ${escapeHtml(formatDateTime(entry.createdAt))}</div>
            </div>
            <div class="history-card__badge ${tone}">${entry.confidence.toFixed(0)}%</div>
          </div>
          <div class="history-card__bottom">
            <span>${escapeHtml(entry.rpm.toFixed(0))} RPM</span>
            <span>${escapeHtml(String(entry.direction).toUpperCase())}</span>
          </div>
        </div>
      `;
    })
    .join('');
}

function statusToneForFault(key: FaultKey): string {
  const severity = faultProfiles[key].severity;
  return severityClass(severity);
}

async function ensureVisualControllers(): Promise<void> {
  if (controllers) {
    return;
  }

  if (!visualsLoadPromise) {
    visualsLoadPromise = (async () => {
      const { mountChartPack, mountThreeScene } = await import('./visuals');
      const threeContainer = qs<HTMLElement>('#canvas3d') ?? document.createElement('div');
      const waveCanvas = qs<HTMLCanvasElement>('#waveCanvas') ?? document.createElement('canvas');
      const fftCanvas = qs<HTMLCanvasElement>('#fftCanvas') ?? document.createElement('canvas');
      const phaseCanvas = qs<HTMLCanvasElement>('#phaseCanvas') ?? document.createElement('canvas');
      const orbitCanvas = qs<HTMLCanvasElement>('#orbitCanvas') ?? document.createElement('canvas');

      controllers = {
        three: mountThreeScene(threeContainer, () => state),
        charts: mountChartPack({ waveCanvas, fftCanvas, phaseCanvas, orbitCanvas }, () => state),
      };
    })();
  }

  await visualsLoadPromise;
}

function renderBearingPanel(rpm: number, bearingModel: string): string {
  const result = calcBearingFrequencies(bearingModel, rpm);
  const hint = result.exact
    ? `Exact match for ${escapeHtml(result.model ?? '')}`
    : result.model
      ? `Fallback estimate for ${escapeHtml(result.model)}`
      : 'Masukkan model bearing untuk menghitung defect frequency.';

  return `
    <div class="bearing-panel">
      <div class="bearing-panel__hint">${hint}</div>
      <div class="bearing-grid">
        <div class="bearing-chip">
          <span>BPFO</span>
          <strong id="bpfoVal">${result.values.bpfo ? formatHz(result.values.bpfo) : '-'}</strong>
        </div>
        <div class="bearing-chip">
          <span>BPFI</span>
          <strong id="bpfiVal">${result.values.bpfi ? formatHz(result.values.bpfi) : '-'}</strong>
        </div>
        <div class="bearing-chip">
          <span>FTF</span>
          <strong id="ftfVal">${result.values.ftf ? formatHz(result.values.ftf, 2) : '-'}</strong>
        </div>
        <div class="bearing-chip">
          <span>BSF</span>
          <strong id="bsfVal">${result.values.bsf ? formatHz(result.values.bsf, 1) : '-'}</strong>
        </div>
      </div>
    </div>
  `;
}

function renderFeatureNav(activeTab: AppState['currentTab']): string {
  return `
    <nav class="feature-nav panel" id="tabBar">
      ${tabs
        .map((tab) => {
          const active = tab.key === activeTab ? 'is-active' : '';
          return `
            <button type="button" class="tab-btn ${active}" data-action="switch-tab" data-tab="${tab.key}">
              <span class="tab-btn__icon" aria-hidden="true">${renderFeatureIcon(tab.key)}</span>
              <span class="tab-btn__copy">
                <span class="tab-btn__label">${escapeHtml(tab.label)}</span>
                <small>${escapeHtml(tab.hint)}</small>
              </span>
            </button>
          `;
        })
        .join('')}
    </nav>
  `;
}

function renderFeatureIcon(key: AppState['currentTab']): string {
  const common = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"';
  const paths: Record<AppState['currentTab'], string> = {
    sim: '<path d="M12 3 4.5 7.2v8.6L12 20l7.5-4.2V7.2L12 3Z"/><path d="M12 8v8"/><path d="m4.8 7.4 7.2 4.1 7.2-4.1"/>',
    analysis: '<path d="M4 18h16"/><path d="M5 15l3-6 3 4 3-8 5 10"/>',
    ai: '<path d="M8 3v3"/><path d="M16 3v3"/><rect x="5" y="6" width="14" height="12" rx="3"/><path d="M9 11h.01"/><path d="M15 11h.01"/><path d="M9 15h6"/>',
    equipment: '<path d="M4 19V8l8-4 8 4v11"/><path d="M8 19v-6h8v6"/><path d="M9 9h.01"/><path d="M15 9h.01"/>',
    reference: '<path d="M6 4h9a3 3 0 0 1 3 3v13H8a2 2 0 0 1-2-2V4Z"/><path d="M9 8h5"/><path d="M9 12h6"/><path d="M9 16h4"/>',
  };
  return `<svg ${common} aria-hidden="true">${paths[key]}</svg>`;
}

function renderSimulationStats(state: AppState): string {
  const profile = faultProfiles[state.faultKey];
  return `
    <div class="panel stat-strip sim-side-stats">
      <div class="stat">
        <span>RPM</span>
        <strong id="rpmDisplaySide">${state.rpm}</strong>
      </div>
      <div class="stat">
        <span>LOAD</span>
        <strong id="loadDisplaySide">${state.load}%</strong>
      </div>
      <div class="stat">
        <span>OVERALL</span>
        <strong id="overallDisplaySide">${formatMmps(profile.overall)}</strong>
      </div>
      <div class="stat">
        <span>ZONE</span>
        <strong id="zoneDisplaySide">ZONE ${profile.severity}</strong>
      </div>
    </div>
  `;
}

function renderControlDeck(state: AppState): string {
  return `
    <div class="panel control-card">
      <div class="panel-title">Control Deck</div>
      <div class="view-card__subtitle">Atur RPM, load, dan fault profile untuk melihat respons motor industri yang lebih realistis.</div>
      <label class="field">
        <span>RPM</span>
        <input id="rpmSlider" type="range" min="300" max="3600" value="${state.rpm}" />
        <div class="field__foot"><strong id="rpmVal">${state.rpm}</strong> RPM</div>
      </label>
      <label class="field">
        <span>Load</span>
        <input id="loadSlider" type="range" min="0" max="100" value="${state.load}" />
        <div class="field__foot"><strong id="loadVal">${state.load}</strong>%</div>
      </label>
      <div class="field">
        <span>Direction</span>
        <div class="direction-grid" id="directionGrid">
          ${renderDirectionButtons(state.direction)}
        </div>
      </div>
      <div class="field">
        <span>Machine Layout</span>
        <div class="machine-layout-grid" id="machineLayoutGrid">
          ${renderMachineLayoutButtons(state.machineContext)}
        </div>
      </div>
      <div class="field">
        <span>Fault Profile</span>
        <div class="fault-grid" id="faultGrid">
          ${renderFaultButtons(state.faultKey)}
        </div>
      </div>
      <label class="field">
        <span>Bearing Model</span>
        <input
          id="bearingModel"
          type="text"
          placeholder="e.g. 6205, SKF 6305"
          value="${escapeHtml(state.machineContext.bearingModel)}"
        />
      </label>
      ${renderBearingPanel(state.rpm, state.machineContext.bearingModel)}
    </div>
  `;
}

function renderSimulationSidePanel(state: AppState): string {
  return `
    <aside class="sim-side">
      ${renderSimulationStats(state)}
      ${renderControlDeck(state)}
      <div class="panel diagnosis-card">
        <div class="panel-title">Diagnosis</div>
        <div id="diagPanel"></div>
        <div class="recommendations" id="recommendations"></div>
      </div>
      <div class="panel history-card">
        <div class="panel-title">Recent History</div>
        <div id="historyList" class="history-list">${renderHistoryCards(state.history)}</div>
      </div>
    </aside>
  `;
}

function renderSidebar(state: AppState): string {
  const connectionChip = state.connection.mode === 'signed-in'
    ? 'CONNECTED'
    : state.connection.mode === 'demo'
      ? 'DEMO MODE'
      : state.connection.mode === 'connected'
        ? 'READY'
        : state.connection.mode.toUpperCase();
  const roleChip = state.connection.role.toUpperCase();

  return `
    <section class="sidebar-stack">
      <div class="brand-card panel">
        <div class="brand-card__top">
          <div class="brand-mark">M</div>
          <div>
            <div class="brand-name">Mobius Simulation</div>
            <div class="brand-sub">CBM Jeranjang diagnostic</div>
          </div>
        </div>
        <div class="chip-row">
          <span id="connectionChip" class="chip chip--accent">${escapeHtml(connectionChip)}</span>
          <span id="roleChip" class="chip chip--muted">${escapeHtml(roleChip)}</span>
          <span id="statusTextSide" class="chip chip--success">${escapeHtml(simStatusLabel(state.faultKey))}</span>
        </div>
        <div class="brand-note" id="authMessage">${escapeHtml(state.connection.message)}</div>
      </div>

      ${renderFeatureNav(state.currentTab)}

      <div class="panel auth-card">
        <div class="panel-title">Supabase</div>
        <div class="auth-card__text">
          RLS-enabled backend, auth, storage, dan histori analisis.
        </div>
        <div class="auth-form">
          <input id="authEmail" type="email" placeholder="Email" autocomplete="email" />
          <input id="authPassword" type="password" placeholder="Password" autocomplete="current-password" />
          <div class="auth-form__actions">
            <button type="button" class="primary-btn" data-action="auth-signin" id="authSubmit">Sign In</button>
            <button type="button" class="ghost-btn" data-action="auth-signout" id="authSignOut">Sign Out</button>
          </div>
        </div>
      </div>
    </section>
  `;
}

function simStatusLabel(faultKey: FaultKey): string {
  const severity = faultProfiles[faultKey].severity;
  switch (severity) {
    case 'A':
      return 'SYSTEM NORMAL';
    case 'B':
      return 'MONITOR';
    case 'C':
      return 'WARNING';
    case 'D':
      return 'ALARM';
    default:
      return 'SYSTEM NORMAL';
  }
}

function renderTopBar(state: AppState): string {
  const densityLabel = state.uiDensity === 'compact' ? 'Compact' : state.uiDensity === 'large' ? 'Large' : 'Normal';
  return `
    <header class="topbar panel">
      <div class="topbar__brand">
        <div class="topbar__title">Mobius Simulation Dashboard</div>
        <div class="topbar__subtitle">CBM Jeranjang diagnostic cockpit for engineering workflows</div>
      </div>
      <div class="topbar__stats">
        <div class="topbar__stat">
          <span>Connection</span>
          <strong id="connectionChipTop">${escapeHtml(state.connection.mode === 'demo' ? 'DEMO' : state.connection.mode.toUpperCase())}</strong>
        </div>
        <div class="topbar__stat">
          <span>Role</span>
          <strong id="roleChipTop">${escapeHtml(state.connection.role.toUpperCase())}</strong>
        </div>
        <div class="topbar__stat">
          <span>Status</span>
          <strong id="statusTextTop">${escapeHtml(simStatusLabel(state.faultKey))}</strong>
        </div>
      </div>
      <div class="topbar__actions">
        <button type="button" class="ghost-btn" data-action="toggle-ui-density">Size ${densityLabel}</button>
        <button type="button" class="ghost-btn" data-action="toggle-ui-text">${state.uiTextCollapsed ? 'Show Text' : 'Hide Text'}</button>
        <button type="button" class="ghost-btn" data-action="reset-camera">Reset View</button>
        <button type="button" class="ghost-btn" data-action="toggle-wireframe">Wireframe</button>
      </div>
    </header>
  `;
}

function renderSimView(state: AppState): string {
  const profile = faultProfiles[state.faultKey];
  const peaks = profile.spectrum;
  const peakByOrder = (order: number): number => {
    const peak = peaks.find((item) => Math.abs(item.o - order) < 0.1);
    return peak?.a ?? 0.01;
  };

  return `
    <section id="simView" class="view ${state.currentTab === 'sim' ? '' : 'is-hidden'}">
      <div class="sim-layout">
        ${renderSimulationSidePanel(state)}
      <div class="sim-stage">
          <article class="panel machine-card">
          <div class="panel-label">3D Machine Visualization</div>
          <div class="view-card__subtitle">Visual 3D menampilkan motor train, shaft, coupling, sensor, dan komponen driven sebagai referensi teknisi.</div>
          <div id="canvas3d" class="canvas-shell canvas-shell--three"></div>
          <div class="canvas-overlay canvas-overlay--left">
            <button type="button" class="ghost-btn ghost-btn--small" data-action="reset-camera">Reset View</button>
            <button type="button" class="ghost-btn ghost-btn--small" data-action="toggle-wireframe">Wireframe</button>
          </div>
          <div class="sim-control-dock">
            <label>
              <span>Simulation Speed</span>
              <select data-sim-control="simulationSpeed">
                <option value="freeze" ${state.simulationSpeed === 'freeze' ? 'selected' : ''}>Freeze</option>
                <option value="0.25" ${state.simulationSpeed === '0.25' ? 'selected' : ''}>0.25x</option>
                <option value="0.5" ${state.simulationSpeed === '0.5' ? 'selected' : ''}>0.5x</option>
                <option value="1" ${state.simulationSpeed === '1' ? 'selected' : ''}>1x</option>
                <option value="2" ${state.simulationSpeed === '2' ? 'selected' : ''}>2x</option>
              </select>
            </label>
            <label>
              <span>Vibration Gain</span>
              <select data-sim-control="vibrationGain">
                <option value="low" ${state.vibrationGain === 'low' ? 'selected' : ''}>Low</option>
                <option value="normal" ${state.vibrationGain === 'normal' ? 'selected' : ''}>Normal</option>
                <option value="high" ${state.vibrationGain === 'high' ? 'selected' : ''}>High</option>
              </select>
            </label>
            <button type="button" class="sim-toggle ${state.showOrbit ? 'is-active' : ''}" data-action="toggle-sim-flag" data-sim-flag="showOrbit">Orbit</button>
            <button type="button" class="sim-toggle ${state.showSensors ? 'is-active' : ''}" data-action="toggle-sim-flag" data-sim-flag="showSensors">Sensors</button>
            <button type="button" class="sim-toggle ${state.showVectors ? 'is-active' : ''}" data-action="toggle-sim-flag" data-sim-flag="showVectors">Vectors</button>
          </div>
          <div class="canvas-overlay canvas-overlay--right">
            <div class="indicator-row"><span class="indicator indicator--red"></span> Axial</div>
            <div class="indicator-row"><span class="indicator indicator--green"></span> Radial</div>
            <div class="indicator-row"><span class="indicator indicator--yellow"></span> Tangential</div>
          </div>
          <div class="sim-live-overlay">
            <div><span>RPM</span><strong id="simLiveRpm">${state.rpm}</strong></div>
            <div><span>1X</span><strong id="simLive1x">${formatHz(state.rpm / 60)}</strong></div>
            <div><span>Point</span><strong id="simLivePoint">${escapeHtml(state.machineContext.measurementPoint)}</strong></div>
            <div><span>Fault</span><strong id="simLiveFault">${escapeHtml(faultProfiles[state.faultKey].name)}</strong></div>
          </div>
          <div class="machine-meta-grid">
            <div><span>Asset</span><strong id="machineMetaName">${escapeHtml(state.machineContext.equipmentName)}</strong></div>
            <div><span>Type</span><strong id="machineMetaType">${escapeHtml(state.machineContext.machineType)} -> ${escapeHtml(state.machineContext.drivenComponent)}</strong></div>
            <div><span>Point</span><strong id="machineMetaPoint">${escapeHtml(state.machineContext.measurementPoint)} / ${escapeHtml(state.machineContext.direction.toUpperCase())}</strong></div>
            <div><span>Upload Source</span><strong id="machineMetaSource">${escapeHtml(state.machineContext.sourceUploadName)}</strong></div>
          </div>
          </article>

          <div class="chart-grid">
            <article class="panel chart-card">
              <div class="panel-label panel-label--cyan">Time Waveform</div>
              <canvas id="waveCanvas" class="chart-canvas"></canvas>
            </article>
            <article class="panel chart-card">
              <div class="panel-label panel-label--purple">FFT Spectrum (Orders)</div>
              <canvas id="fftCanvas" class="chart-canvas"></canvas>
            </article>
            <article class="panel chart-card">
              <div class="panel-label panel-label--orange">Phase Diagram</div>
              <canvas id="phaseCanvas" class="chart-canvas"></canvas>
            </article>
            <article class="panel chart-card">
              <div class="panel-label panel-label--green">Shaft Orbit</div>
              <canvas id="orbitCanvas" class="chart-canvas"></canvas>
            </article>
          </div>

          <article class="panel summary-card">
            <div class="summary-card__top">
              <div>
                <div class="panel-title">Diagnostic Summary</div>
                <div class="summary-card__subtitle">Live fault interpretation from the active machine profile.</div>
              </div>
              <div class="summary-pill severity-${profile.severity.toLowerCase()}" id="statusTextSim">${escapeHtml(simStatusLabel(state.faultKey))}</div>
            </div>
            <div class="info-grid">
              <div class="info-card">
                <span>Speed</span>
                <strong id="infoRpm">${state.rpm} RPM</strong>
              </div>
              <div class="info-card">
                <span>1X Freq</span>
                <strong id="info1X">${formatHz(state.rpm / 60)}</strong>
              </div>
              <div class="info-card">
                <span>BPF</span>
                <strong id="infoBPF">${formatHz((state.rpm / 60) * 6, 0)}</strong>
              </div>
            </div>
            <div class="peak-grid">
              <div class="peak-card"><span>1X</span><strong id="peak1X">${formatMmps(peakByOrder(1))}</strong></div>
              <div class="peak-card"><span>2X</span><strong id="peak2X">${formatMmps(peakByOrder(2))}</strong></div>
              <div class="peak-card"><span>3X</span><strong id="peak3X">${formatMmps(peakByOrder(3))}</strong></div>
              <div class="peak-card"><span>4X</span><strong id="peak4X">${formatMmps(peakByOrder(4))}</strong></div>
              <div class="peak-card peak-card--highlight"><span>Max</span><strong id="peakMax">${formatMmps(Math.max(...peaks.map((p) => p.a)))}</strong></div>
            </div>
          </article>
        </div>
      </div>
    </section>
  `;
}

function renderAnalysisRows(rows: PeakInputRow[]): string {
  return rows
    .map(
      (row, index) => `
        <div class="peak-row" data-peak-id="${row.id}">
          <div class="peak-row__index">${index + 1}</div>
          <input class="peak-input" data-peak-field="order" data-peak-id="${row.id}" value="${escapeHtml(row.order)}" placeholder="1X" />
          <input class="peak-input" data-peak-field="freq" data-peak-id="${row.id}" value="${escapeHtml(row.freq)}" placeholder="Hz" />
          <input class="peak-input" data-peak-field="amp" data-peak-id="${row.id}" value="${escapeHtml(row.amp)}" placeholder="mm/s" />
          <button type="button" class="icon-btn" data-action="remove-peak" data-peak-id="${row.id}">Remove</button>
        </div>
      `,
    )
    .join('');
}

function renderAnalysisResults(items: ReturnType<typeof rankSpectrumPeaks>): string {
  if (!items.length) {
    return `
      <div class="empty-state">
        <div class="empty-state__title">Belum ada hasil</div>
        <div class="empty-state__text">Klik Analyze Spectrum untuk melihat ranking fault yang paling mungkin.</div>
      </div>
    `;
  }

  return items
    .slice(0, 4)
    .map((item, index) => {
      const width = Math.max(18, item.confidence);
      const accent = index === 0 ? 'var(--accent)' : 'var(--accent-2)';
      return `
        <article class="result-card ${index === 0 ? 'result-card--top' : ''}">
          <div class="result-card__head">
            <div class="result-card__title">
              <span class="fault-pill">${escapeHtml(item.icon)}</span>
              <span>${escapeHtml(item.name)}</span>
            </div>
            <div class="result-card__score">${item.confidence.toFixed(0)}%</div>
          </div>
          <div class="progress-bar">
            <div class="progress-bar__fill" style="width:${width}%;background:${accent}"></div>
          </div>
          <div class="result-card__text">${escapeHtml(item.desc)}</div>
          <div class="chip-row">
            ${item.evidence.map((entry) => `<span class="chip chip--success">${escapeHtml(entry)}</span>`).join('')}
          </div>
        </article>
      `;
    })
    .join('');
}

function renderAnalysisHistory(history: HistoryEntry[]): string {
  const spectrumHistory = history.filter((entry) => entry.source === 'spectrum');
  return renderHistoryCards(spectrumHistory, 8);
}

function renderFrequencyMarkerPanel(context: MachineContext): string {
  return `
    <div class="marker-grid">
      ${frequencyMarkers(context).map((marker) => `
        <div class="marker-chip ${marker.freq ? '' : 'is-muted'}">
          <span>${escapeHtml(marker.label)}</span>
          <strong>${marker.freq ? formatHz(marker.freq, marker.freq > 100 ? 0 : 1) : '-'}</strong>
          <small>${escapeHtml(marker.source)}</small>
        </div>
      `).join('')}
    </div>
  `;
}

function currentPeakValues(): Array<{ order: string; freq: number; amp: number }> {
  return parsePeakInputRows(state.peakRows);
}

function currentPeakValuesFromRows(rows: PeakInputRow[]): Array<{ order: string; freq: number; amp: number }> {
  return parsePeakInputRows(rows);
}

function renderPeakInsightTable(context: MachineContext): string {
  const insights = buildPeakInsights(currentPeakValues(), context);
  if (!insights.length) {
    return `<div class="empty-state"><div class="empty-state__title">Peak table kosong</div><div class="empty-state__text">Masukkan peak atau apply hasil upload untuk melihat sumber frekuensi.</div></div>`;
  }

  return `
    <div class="table-shell table-shell--compact">
      <table class="data-table data-table--compact">
        <thead><tr><th>Rank</th><th>Frequency</th><th>Amplitude</th><th>Possible Source</th></tr></thead>
        <tbody>
          ${insights.map((row) => `
            <tr>
              <td>${row.rank}</td>
              <td class="cell-mono">${row.frequency.toFixed(1)} Hz</td>
              <td class="cell-mono">${row.amplitude.toFixed(1)} mm/s</td>
              <td>${escapeHtml(row.possibleSource)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function priorityBreakdownRows(summary: NonNullable<AppState['diagnosisSummary']>): Array<{ label: string; value: number; hint: string }> {
  const breakdown = summary.priorityBreakdown;
  if (!breakdown) {
    return [];
  }

  return [
    { label: 'Severity', value: breakdown.severity, hint: 'Asset condition weight 35%' },
    { label: 'Criticality', value: breakdown.criticality, hint: 'Machine criticality weight 25%' },
    { label: 'Production', value: breakdown.production, hint: 'Production impact weight 20%' },
    { label: 'Safety', value: breakdown.safety, hint: 'Safety impact weight 10%' },
    { label: 'Trend', value: breakdown.trend, hint: 'Trend proxy weight 10%' },
  ];
}

function renderDiagnosisSummaryPanel(): string {
  const summary = state.diagnosisSummary;
  if (!summary) {
    return `<div class="empty-state"><div class="empty-state__title">Belum ada diagnosis bertingkat</div><div class="empty-state__text">Klik Analyze Spectrum untuk menghasilkan probable fault, secondary fault, evidence, priority, dan action.</div></div>`;
  }
  const priorityRows = priorityBreakdownRows(summary);

  return `
    <div class="diagnosis-summary-grid">
      <div class="diagnosis-summary-card"><span>Asset Condition</span><strong>${escapeHtml(summary.assetCondition)}</strong></div>
      <div class="diagnosis-summary-card"><span>Dominant Fault</span><strong>${escapeHtml(summary.dominantFault)}</strong></div>
      <div class="diagnosis-summary-card"><span>Secondary Fault</span><strong>${escapeHtml(summary.secondaryFault)}</strong></div>
      <div class="diagnosis-summary-card"><span>Confidence</span><strong>${summary.confidence.toFixed(0)}%</strong></div>
      <div class="diagnosis-summary-card"><span>Priority Score</span><strong>${summary.priorityScore} / 100</strong><small>${escapeHtml(summary.priorityLevel)}</small></div>
    </div>
    <div class="split-grid">
      <div>
        <div class="panel-label">Evidence</div>
        <div class="recommendations">${summary.evidence.map((item) => `<div class="recommendation-row"><span class="recommendation-row__icon">i</span><span>${escapeHtml(item)}</span></div>`).join('')}</div>
      </div>
      <div>
        <div class="panel-label panel-label--green">Recommended Action</div>
        <div class="recommendations">${summary.recommendedActions.map((item, index) => `<div class="recommendation-row"><span class="recommendation-row__icon">${index + 1}</span><span>${escapeHtml(item)}</span></div>`).join('')}</div>
      </div>
    </div>
    ${priorityRows.length ? `
      <div class="priority-breakdown-shell">
        <div class="panel-label panel-label--cyan">Priority Breakdown</div>
        <div class="priority-breakdown-grid">
          ${priorityRows.map((item) => `
            <div class="priority-breakdown-card">
              <span>${escapeHtml(item.label)}</span>
              <strong>${item.value}</strong>
              <small>${escapeHtml(item.hint)}</small>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
    <div class="chip-row">
      ${summary.notDominant.map((item) => `<span class="chip chip--muted">Not dominant: ${escapeHtml(item)}</span>`).join('')}
    </div>
  `;
}

function renderTrendPanel(): string {
  const point = `${state.machineContext.measurementPoint}${state.machineContext.direction === 'axial' ? 'A' : state.machineContext.direction === 'vertical' ? 'V' : 'H'}`;
  const latest = Math.max(...currentPeakValues().map((peak) => peak.amp), faultProfiles[state.faultKey].overall);
  const previous = Math.max(0.8, latest * 0.53);
  const increase = previous ? ((latest - previous) / previous) * 100 : 0;
  return `
    <div class="trend-grid">
      <div class="trend-card"><span>Previous</span><strong>${previous.toFixed(1)} mm/s</strong><small>${escapeHtml(point)} | ${escapeHtml(state.machineContext.dateTaken)}</small></div>
      <div class="trend-card"><span>Latest</span><strong>${latest.toFixed(1)} mm/s</strong><small>${escapeHtml(point)} | Current run</small></div>
      <div class="trend-card ${increase > 50 ? 'is-critical' : ''}"><span>Trend Increase</span><strong>${increase.toFixed(0)}%</strong><small>${increase > 50 ? 'Recommended action: Immediate inspection.' : 'Continue monitoring.'}</small></div>
    </div>
  `;
}

function renderMachineContextFields(context: MachineContext): string {
  const machineOptions: Array<{ value: MachineContext['machineType']; label: string }> = [
    { value: 'pump', label: 'Pump Train' },
    { value: 'motor', label: 'Motor Only' },
    { value: 'fan', label: 'Fan / Blower' },
    { value: 'gearbox', label: 'Gearbox' },
    { value: 'compressor', label: 'Compressor' },
    { value: 'turbine', label: 'Turbine' },
  ];
  const driveOptions: Array<{ value: MachineContext['driveType']; label: string }> = [
    { value: 'direct', label: 'Direct Coupling' },
    { value: 'belt', label: 'Belt Pulley' },
    { value: 'gear', label: 'Gear Drive' },
    { value: 'flexible', label: 'Flexible Coupling' },
    { value: 'unknown', label: 'Unknown' },
  ];
  const directionOptions: Array<{ value: MachineContext['direction']; label: string }> = [
    { value: 'horizontal', label: 'Horizontal' },
    { value: 'vertical', label: 'Vertical' },
    { value: 'axial', label: 'Axial' },
  ];
  const rpmMismatch = context.detectedRpm && Math.abs(context.detectedRpm - context.rpm) > 10;

  return `
    ${rpmMismatch ? `
      <div class="rpm-warning">
        <strong>RPM mismatch detected</strong>
        <span>Spectrum RPM = ${context.detectedRpm?.toFixed(0)} | Input RPM = ${context.rpm.toFixed(0)}</span>
        <button type="button" class="primary-btn ghost-btn--small" data-action="use-detected-rpm">Use ${context.detectedRpm?.toFixed(0)}</button>
        <button type="button" class="ghost-btn ghost-btn--small" data-action="keep-manual-rpm">Keep Manual</button>
      </div>
    ` : ''}
    <div class="context-section">
      <div class="context-section__title">Equipment Info</div>
      <div class="context-grid">
        <label class="field"><span>Equipment Code</span><input data-context-field="equipmentCode" value="${escapeHtml(context.equipmentCode)}" placeholder="FAN-101A" /></label>
        <label class="field"><span>Equipment Name</span><input data-context-field="equipmentName" value="${escapeHtml(context.equipmentName)}" placeholder="Motor Fan Train" /></label>
        <label class="field"><span>Machine Type</span><select data-context-field="machineType">${machineOptions.map((option) => `<option value="${option.value}" ${context.machineType === option.value ? 'selected' : ''}>${option.label}</option>`).join('')}</select></label>
      </div>
    </div>
    <div class="context-section">
      <div class="context-section__title">Operating Condition</div>
      <div class="context-grid">
        <label class="field"><span>RPM Source</span><select data-context-field="rpmSource"><option value="manual" ${context.rpmSource === 'manual' ? 'selected' : ''}>Manual Input</option><option value="detected" ${context.rpmSource === 'detected' ? 'selected' : ''}>Detected from Spectrum</option><option value="master" ${context.rpmSource === 'master' ? 'selected' : ''}>Equipment Master Data</option></select></label>
        <label class="field"><span>RPM Actual</span><input type="number" min="300" max="6000" data-context-field="rpm" value="${context.rpm.toFixed(0)}" /></label>
        <label class="field"><span>Detected RPM</span><input type="number" min="300" max="6000" data-context-field="detectedRpm" value="${context.detectedRpm?.toFixed(0) ?? ''}" /></label>
        <label class="field"><span>Master RPM</span><input type="number" min="300" max="6000" data-context-field="masterRpm" value="${context.masterRpm?.toFixed(0) ?? ''}" /></label>
        <label class="field"><span>Load %</span><input type="number" min="0" max="100" data-context-field="load" value="${context.load.toFixed(0)}" /></label>
        <label class="field"><span>Date Taken</span><input type="date" data-context-field="dateTaken" value="${escapeHtml(context.dateTaken)}" /></label>
      </div>
    </div>
    <div class="context-section">
      <div class="context-section__title">Bearing & Drive Data</div>
      <div class="context-grid">
        <label class="field"><span>Drive Type</span><select data-context-field="driveType">${driveOptions.map((option) => `<option value="${option.value}" ${context.driveType === option.value ? 'selected' : ''}>${option.label}</option>`).join('')}</select></label>
        <label class="field"><span>Driven Component</span><select data-context-field="drivenComponent">${machineOptions.map((option) => `<option value="${option.value}" ${context.drivenComponent === option.value ? 'selected' : ''}>${option.label}</option>`).join('')}</select></label>
        <label class="field"><span>Bearing Model</span><input data-context-field="bearingModel" value="${escapeHtml(context.bearingModel)}" placeholder="6205 / 6310 / NU312" /></label>
        <label class="field"><span>Bearing Position</span><select data-context-field="bearingPosition">${(['DE', 'NDE', 'Motor', 'Fan', 'Pulley', 'Gearbox', 'Compressor'] as const).map((position) => `<option value="${position}" ${context.bearingPosition === position ? 'selected' : ''}>${position}</option>`).join('')}</select></label>
        <label class="field"><span>Blade Count</span><input type="number" min="2" max="24" data-context-field="vaneCount" value="${context.vaneCount}" /></label>
        <label class="field"><span>Gear Teeth</span><input type="number" min="0" max="300" data-context-field="gearTeeth" value="${context.gearTeeth}" /></label>
      </div>
    </div>
    <div class="context-section">
      <div class="context-section__title">Measurement Setup</div>
      <div class="context-grid">
        <label class="field"><span>Measurement Point</span><select data-context-field="measurementPoint">${(['B1', 'B2', 'B3', 'B4'] as const).map((point) => `<option value="${point}" ${context.measurementPoint === point ? 'selected' : ''}>${point}</option>`).join('')}</select></label>
        <label class="field"><span>Direction</span><select data-context-field="direction">${directionOptions.map((option) => `<option value="${option.value}" ${context.direction === option.value ? 'selected' : ''}>${option.label}</option>`).join('')}</select></label>
        <label class="field"><span>Technician</span><input data-context-field="technician" value="${escapeHtml(context.technician)}" placeholder="Nama teknisi" /></label>
      </div>
    </div>
    <div class="context-section">
      <div class="context-section__title">Diagnosis Settings</div>
      <div class="context-grid">
        <label class="field"><span>Criticality %</span><input type="number" min="0" max="100" data-context-field="criticality" value="${context.criticality.toFixed(0)}" /></label>
        <label class="field"><span>Production Impact %</span><input type="number" min="0" max="100" data-context-field="productionImpact" value="${context.productionImpact.toFixed(0)}" /></label>
        <label class="field"><span>Safety Impact %</span><input type="number" min="0" max="100" data-context-field="safetyImpact" value="${context.safetyImpact.toFixed(0)}" /></label>
        <label class="field field--wide"><span>Notes</span><input data-context-field="notes" value="${escapeHtml(context.notes)}" placeholder="Operating condition, sensor placement, process symptom..." /></label>
      </div>
    </div>
  `;
}

function renderAnalysisView(state: AppState): string {
  return `
    <section id="analysisView" class="view ${state.currentTab === 'analysis' ? '' : 'is-hidden'}">
      <div class="panel view-card">
        <div class="panel-title">Spectrum Analysis</div>
        <div class="view-card__subtitle">Masukkan peak frequency dan amplitude. Ranking fault akan dihitung dari signature spektral.</div>
        <div class="analysis-toolbar">
          <label class="field field--inline">
            <span>RPM</span>
            <input id="analysisRpm" type="number" value="${state.analysisRpm}" min="300" max="3600" />
          </label>
          <label class="field field--inline">
            <span>Direction</span>
            <select id="analysisDir">
              <option value="radial" ${state.analysisDirection === 'radial' ? 'selected' : ''}>Radial</option>
              <option value="axial" ${state.analysisDirection === 'axial' ? 'selected' : ''}>Axial</option>
              <option value="both" ${state.analysisDirection === 'both' ? 'selected' : ''}>Both</option>
            </select>
          </label>
          <button type="button" class="ghost-btn" data-action="add-peak">Add Peak</button>
          <button type="button" class="primary-btn" data-action="analyze-spectrum">Analyze Spectrum</button>
          <button type="button" class="ghost-btn" data-action="reset-analysis">Reset</button>
        </div>
        <div class="peak-list" id="peakList">${renderAnalysisRows(state.peakRows)}</div>
      </div>

      <div class="panel view-card">
        <div class="panel-title">Machine Data for Diagnosis</div>
        <div class="view-card__subtitle">Data ini ikut mempengaruhi scoring fault, bearing frequency, blade-pass, dan gerakan 3D simulation.</div>
        ${renderMachineContextFields(state.machineContext)}
      </div>

      <div class="panel view-card">
        <div class="panel-title">Analysis Ranking</div>
        <div class="view-card__subtitle">Hasil akan tersimpan ke histori lokal dan, jika login, disinkronkan ke Supabase.</div>
        <div id="analysisResults" class="analysis-results ${state.analysisResults.length ? '' : 'is-hidden'}">
          <div id="resultsList">${renderAnalysisResults(state.analysisResults)}</div>
        </div>
      </div>

      <div class="panel view-card">
        <div class="panel-title">Frequency Analysis</div>
        <div class="view-card__subtitle">Marker otomatis untuk 1X, harmonics, blade pass, gear mesh, dan bearing fault frequency.</div>
        ${renderFrequencyMarkerPanel(state.machineContext)}
        <div class="zoom-strip">
          <span>Low frequency 0-100 Hz</span>
          <span>Mid frequency 100-500 Hz</span>
          <span>High frequency 500-1000 Hz</span>
        </div>
      </div>

      <div class="panel view-card">
        <div class="panel-title">Peak Detection Table</div>
        <div class="view-card__subtitle">Peak tertinggi diurutkan otomatis dan dipetakan ke possible source.</div>
        ${renderPeakInsightTable(state.machineContext)}
      </div>

      <div class="panel view-card">
        <div class="panel-title">Fault Diagnosis</div>
        <div class="view-card__subtitle">Rule-based diagnosis bertingkat untuk maintenance action.</div>
        ${renderDiagnosisSummaryPanel()}
      </div>

      <div class="panel view-card">
        <div class="panel-title">Trend Monitoring</div>
        <div class="view-card__subtitle">Trend awal dari histori lokal/current run agar kenaikan cepat langsung terlihat.</div>
        ${renderTrendPanel()}
      </div>

      <div class="panel view-card">
        <div class="panel-title">Report</div>
        <div class="view-card__subtitle">Generate report ringkas berisi equipment, measurement, peak table, frequency analysis, diagnosis, dan recommended action.</div>
        <div class="action-row">
          <button type="button" class="primary-btn" data-action="generate-report">Generate Report</button>
          <button type="button" class="ghost-btn" data-action="export-csv">Export Excel</button>
        </div>
      </div>

      <div class="panel view-card">
        <div class="panel-title">Analysis History</div>
        <div class="view-card__subtitle">Latest spectrum runs from this browser and synced backend sessions.</div>
        <div id="analysisHistoryList" class="history-list">${renderAnalysisHistory(state.history)}</div>
      </div>
    </section>
  `;
}

function renderUploadSummary(assets: UploadedAsset[]): string {
  const bearings = ['1', '2', '3', '4'] as const;
  return bearings
    .map((bearing) => {
      const items = assets.filter((asset) => asset.bearing === bearing);
      const spectrum = items.filter((asset) => asset.type === 'Spectrum').length;
      const waveform = items.filter((asset) => asset.type === 'Waveform').length;
      return `
        <div class="summary-chip">
          <span>Bearing ${bearing}</span>
          <strong>${items.length}</strong>
          <small>${spectrum} Spectrum / ${waveform} Waveform</small>
        </div>
      `;
    })
    .join('');
}

function extractionSourceLabel(asset: UploadedAsset): string {
  if (asset.extractionSource === 'ai-assisted') return 'AI Assisted';
  if (asset.extractionSource === 'manual-corrected') return 'Manual Corrected';
  return 'Local';
}

function renderAiProviderSettings(state: AppState): string {
  const settings = state.aiProviderSettings;
  const ready = isAiProviderReady(settings);
  const status = ready ? 'ready' : settings.enabled ? 'error' : 'idle';
  const statusText = ready ? 'Ready' : settings.enabled ? 'Need endpoint/key' : 'Local only';

  return `
    <div class="panel view-card ai-provider-panel">
      <div class="provider-head">
        <div>
          <div class="panel-title">AI Provider Settings</div>
          <div class="view-card__subtitle">Provider-neutral demo mode. Endpoint harus menerima JSON vision request dan mengembalikan JSON peaks/evidence.</div>
        </div>
        <span class="provider-status provider-status--${status}">${escapeHtml(statusText)}</span>
      </div>
      <label class="provider-toggle">
        <input type="checkbox" data-ai-provider-field="enabled" ${settings.enabled ? 'checked' : ''} />
        <span>Enable AI assist for uploaded images</span>
      </label>
      <div class="provider-grid">
        <label class="mini-field">
          <span>Endpoint</span>
          <input type="text" placeholder="https://example.com/vision" value="${escapeHtml(settings.endpoint)}" data-ai-provider-field="endpoint" />
        </label>
        <label class="mini-field">
          <span>API Key</span>
          <input type="password" placeholder="Stored locally in this browser" value="${escapeHtml(settings.apiKey)}" data-ai-provider-field="apiKey" autocomplete="off" />
        </label>
        <label class="mini-field">
          <span>Model</span>
          <input type="text" placeholder="vision-default" value="${escapeHtml(settings.model)}" data-ai-provider-field="model" />
        </label>
      </div>
      <div class="provider-note">${escapeHtml(settings.message)}</div>
    </div>
  `;
}

function renderUploadCards(assets: UploadedAsset[]): string {
  if (!assets.length) {
    return `
      <div class="empty-state">
        <div class="empty-state__title">Belum ada upload</div>
        <div class="empty-state__text">Drop foto spectrum/waveform/envelope ke area upload. CSV/TXT tetap bisa dipakai sebagai fallback.</div>
      </div>
    `;
  }

  return assets
    .map(
      (asset) => {
        const calibration = asset.calibration ?? defaultPlotCalibration(asset.type);
        const status = asset.extractionStatus ?? 'pending';
        const confidence = asset.extractionConfidence ?? 0;
        const peaks = asset.extractedPeaks ?? [];
        const sourceLabel = extractionSourceLabel(asset);
        const statusText = status === 'needs-calibration'
          ? 'Needs calibration'
          : status === 'extracted'
            ? 'Extracted'
            : status === 'failed'
              ? 'Failed'
              : 'Pending';
        return `
        <article class="upload-card">
          <div class="upload-card__media">
            <img src="${asset.src}" alt="${escapeHtml(asset.name)}" />
            <button type="button" class="icon-btn icon-btn--danger" data-action="remove-upload" data-upload-id="${asset.id}">Remove</button>
          </div>
          <div class="upload-card__body">
            <div class="upload-card__head">
              <div>
                <div class="upload-card__name">${escapeHtml(asset.name)}</div>
                <div class="upload-card__meta">${escapeHtml(asset.type)} | Bearing ${asset.bearing} | ${escapeHtml(String(asset.direction).toUpperCase())}</div>
              </div>
              <div class="badge-stack">
                <span class="source-badge source-badge--${asset.extractionSource ?? 'local'}">${escapeHtml(sourceLabel)}</span>
                <span class="extraction-badge extraction-badge--${status}">${escapeHtml(statusText)} ${confidence ? `${confidence.toFixed(0)}%` : ''}</span>
              </div>
            </div>
            <div class="upload-card__grid">
              <select data-action="update-upload" data-upload-id="${asset.id}" data-upload-field="type">
                <option value="Spectrum" ${asset.type === 'Spectrum' ? 'selected' : ''}>Spectrum</option>
                <option value="Waveform" ${asset.type === 'Waveform' ? 'selected' : ''}>Waveform</option>
                <option value="Envelope" ${asset.type === 'Envelope' ? 'selected' : ''}>Envelope</option>
              </select>
              <select data-action="update-upload" data-upload-id="${asset.id}" data-upload-field="bearing">
                <option value="1" ${asset.bearing === '1' ? 'selected' : ''}>Bearing 1</option>
                <option value="2" ${asset.bearing === '2' ? 'selected' : ''}>Bearing 2</option>
                <option value="3" ${asset.bearing === '3' ? 'selected' : ''}>Bearing 3</option>
                <option value="4" ${asset.bearing === '4' ? 'selected' : ''}>Bearing 4</option>
              </select>
              <select data-action="update-upload" data-upload-id="${asset.id}" data-upload-field="direction">
                <option value="radial" ${asset.direction === 'radial' ? 'selected' : ''}>Radial</option>
                <option value="horizontal" ${asset.direction === 'horizontal' ? 'selected' : ''}>Horizontal</option>
                <option value="vertical" ${asset.direction === 'vertical' ? 'selected' : ''}>Vertical</option>
                <option value="axial" ${asset.direction === 'axial' ? 'selected' : ''}>Axial</option>
              </select>
            </div>
            <div class="extraction-panel">
              <div class="extraction-panel__top">
                <div>
                  <strong>Photo extraction</strong>
                  <small>${escapeHtml(asset.parseError ?? (status === 'extracted' ? `${peaks.length} extracted peak(s) ready for diagnosis.` : 'Set axis range if auto detection needs correction.'))}</small>
                </div>
                <button type="button" class="ghost-btn ghost-btn--small" data-action="extract-upload" data-upload-id="${asset.id}">Extract Photo</button>
              </div>
              ${asset.aiEvidence?.length ? `<div class="ai-evidence-list">${asset.aiEvidence.slice(0, 3).map((item) => `<span>${escapeHtml(item.description)} (${item.confidence.toFixed(0)}%)</span>`).join('')}</div>` : ''}
              <div class="calibration-grid">
                ${renderCalibrationInput(asset.id, 'xMin', 'X Min', calibration.xMin)}
                ${renderCalibrationInput(asset.id, 'xMax', asset.type === 'Waveform' ? 'Time Max' : 'Freq Max', calibration.xMax)}
                ${renderCalibrationInput(asset.id, 'yMin', 'Y Min', calibration.yMin)}
                ${renderCalibrationInput(asset.id, 'yMax', asset.type === 'Waveform' ? 'Amp Max' : 'Vel Max', calibration.yMax)}
                ${renderCalibrationInput(asset.id, 'plotLeft', 'Plot Left %', calibration.plotLeft)}
                ${renderCalibrationInput(asset.id, 'plotTop', 'Plot Top %', calibration.plotTop)}
                ${renderCalibrationInput(asset.id, 'plotWidth', 'Plot Width %', calibration.plotWidth)}
                ${renderCalibrationInput(asset.id, 'plotHeight', 'Plot Height %', calibration.plotHeight)}
              </div>
              ${renderExtractedPeaks(asset)}
            </div>
          </div>
        </article>
      `;
      },
    )
    .join('');
}

function renderCalibrationInput(uploadId: number, field: keyof PlotCalibration, label: string, value: number): string {
  return `
    <label class="mini-field">
      <span>${escapeHtml(label)}</span>
      <input
        type="number"
        step="0.1"
        value="${Number(value).toFixed(1)}"
        data-extraction-field="${field}"
        data-upload-id="${uploadId}"
      />
    </label>
  `;
}

function renderExtractedPeaks(asset: UploadedAsset): string {
  const peaks = asset.extractedPeaks ?? [];
  if (!peaks.length) {
    return `
      <div class="empty-state empty-state--compact">
        <div class="empty-state__text">Belum ada peak hasil ekstraksi. Klik Extract Photo atau import CSV/TXT.</div>
      </div>
    `;
  }

  return `
    <div class="table-shell table-shell--compact extracted-table">
      <table class="data-table data-table--compact">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Freq / Time</th>
            <th>Amplitude</th>
            <th>Confidence</th>
          </tr>
        </thead>
        <tbody>
          ${peaks.slice(0, 8).map((peak, index) => `
            <tr>
              <td class="cell-mono">${index + 1}</td>
              <td>
                <input class="mini-input" type="number" step="0.1" value="${peak.frequency.toFixed(1)}" data-extracted-peak-field="frequency" data-upload-id="${asset.id}" data-peak-id="${peak.id}" />
              </td>
              <td>
                <input class="mini-input" type="number" step="0.1" value="${peak.amplitude.toFixed(1)}" data-extracted-peak-field="amplitude" data-upload-id="${asset.id}" data-peak-id="${peak.id}" />
              </td>
              <td class="cell-mono">${peak.confidence.toFixed(0)}%</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderUploadSlots(): string {
  const slots: Array<{ label: string; bearing: UploadedAsset['bearing']; direction: UploadedAsset['direction']; type: UploadedAsset['type'] }> = [
    { label: 'Upload Spectrum Bearing 1 H', bearing: '1', direction: 'horizontal', type: 'Spectrum' },
    { label: 'Upload Spectrum Bearing 1 V', bearing: '1', direction: 'vertical', type: 'Spectrum' },
    { label: 'Upload Spectrum Bearing 1 A', bearing: '1', direction: 'axial', type: 'Spectrum' },
    { label: 'Upload Spectrum Bearing 2 H', bearing: '2', direction: 'horizontal', type: 'Spectrum' },
    { label: 'Upload Spectrum Bearing 2 V', bearing: '2', direction: 'vertical', type: 'Spectrum' },
    { label: 'Upload Spectrum Bearing 2 A', bearing: '2', direction: 'axial', type: 'Spectrum' },
    { label: 'Upload Waveform', bearing: '1', direction: 'vertical', type: 'Waveform' },
    { label: 'Upload Envelope', bearing: '1', direction: 'vertical', type: 'Envelope' },
  ];

  return `
    <div class="upload-slot-grid">
      ${slots.map((slot) => `
        <button
          type="button"
          class="upload-slot"
          data-action="open-file-picker"
          data-upload-bearing="${slot.bearing}"
          data-upload-direction="${slot.direction}"
          data-upload-type="${slot.type}"
        >
          <span>+</span>${escapeHtml(slot.label)}
        </button>
      `).join('')}
    </div>
  `;
}

function renderUploadView(state: AppState): string {
  const hasAssets = state.uploadedAssets.length > 0;
  const result = state.uploadResult;

  return `
    <section id="aiView" class="view ${state.currentTab === 'ai' ? '' : 'is-hidden'}">
      ${renderAiProviderSettings(state)}

      <div class="panel view-card">
        <div class="panel-title">Photo-First Spectrum/Waveform Analysis</div>
        <div class="view-card__subtitle">Upload foto spectrum, waveform, atau envelope. Aplikasi akan ekstrak trace/peak dari gambar, lalu kamu bisa koreksi axis dan peak sebelum diagnosis.</div>
        <div id="uploadZone" class="upload-zone ${hasAssets ? 'is-hidden' : ''}" data-action="open-file-picker">
          <div class="upload-zone__icon">+</div>
          <div class="upload-zone__title">Click to upload spectrum/waveform photo</div>
          <div class="upload-zone__text">Image adalah jalur utama. CSV/TXT tetap didukung untuk import cepat jika data numerik tersedia.</div>
          <input id="photoInput" type="file" accept=".png,.jpg,.jpeg,.webp,.gif,.csv,.txt" multiple hidden />
        </div>
        ${renderUploadSlots()}
      </div>

      <div id="photoPreview" class="panel view-card ${hasAssets ? '' : 'is-hidden'}">
        <div class="panel-title">Upload Summary</div>
        <div class="summary-grid" id="uploadSummary">${renderUploadSummary(state.uploadedAssets)}</div>
        <div class="upload-grid" id="previewGrid">${renderUploadCards(state.uploadedAssets)}</div>
        <div class="action-row">
          <button type="button" class="primary-btn" data-action="extract-all" id="extractAllBtn">Extract All Photos</button>
          <button type="button" class="primary-btn" data-action="start-ai" id="startAIAnalysisBtn">Run Diagnosis From Extracted Data</button>
          <button type="button" class="ghost-btn" data-action="apply-extracted-peaks">Apply Extracted Peaks</button>
          <button type="button" class="ghost-btn" data-action="reset-ai" id="resetAIBtn">Reset AI</button>
          <button type="button" class="ghost-btn" data-action="apply-ai" id="applyAIResultBtn" ${result ? '' : 'disabled'}>Apply Result</button>
        </div>
      </div>

      <div class="panel view-card">
        <div class="panel-title">Machine Context</div>
        <div class="view-card__subtitle">Data ini menentukan marker 1X/BPF/bearing dan perilaku 3D. Koreksi RPM, bearing, point, direction, dan load sebelum final diagnosis.</div>
        ${renderMachineContextFields(result?.machineContext ?? state.machineContext)}
      </div>

      <div id="aiResult" class="panel view-card ${result ? '' : 'is-hidden'}">
        <div id="aiScanProgress" class="${result ? 'is-hidden' : ''}">
          <div class="panel-title">Processing Image Data</div>
          <div class="scan-box">
            <div class="scan-box__text" id="modalScanText">Processing image data...</div>
            <div class="scan-bar">
              <div id="modalProgress" class="scan-bar__fill" style="width:0%"></div>
            </div>
          </div>
        </div>
        <div id="aiResultContent" class="${result ? '' : 'is-hidden'}">
          <div class="ai-result-head">
            <div>
              <div class="panel-title">AI Result</div>
              <div class="view-card__subtitle">Diagnosis dihitung dari peak hasil ekstraksi foto/CSV, dengan confidence turun jika foto butuh kalibrasi.</div>
            </div>
            <div class="ai-confidence" id="aiConfidence">${result ? `${result.confidence.toFixed(0)}%` : '0%'}</div>
          </div>
          <div class="ai-fault">
            <div class="ai-fault__name" id="aiFaultName">${result ? faultLabel(result.faultKey) : '-'}</div>
            <div class="ai-fault__desc" id="aiFaultDesc">${result ? escapeHtml(faultProfiles[result.faultKey].desc) : '-'}</div>
          </div>
          <div id="aiEvidence" class="ai-evidence">
            ${result ? result.evidence.map((item) => renderEvidenceRow(item.label, item.value, item.match)).join('') : ''}
          </div>
          <div id="bearingCoverage" class="coverage-grid">
            ${result ? result.coverage.map((item) => renderCoverageCard(item.bearing, item.count)).join('') : ''}
          </div>
        </div>
      </div>

      <div id="aiModal" class="modal is-hidden">
        <div class="modal-card">
          <div class="modal-card__title">AI scan in progress</div>
          <div class="modal-card__subtitle" id="modalScanTextModal">Processing image data...</div>
          <div class="scan-bar">
            <div id="modalProgressModal" class="scan-bar__fill" style="width:0%"></div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderEvidenceRow(label: string, value: string, match: boolean): string {
  return `
    <div class="evidence-row ${match ? 'is-match' : ''}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderCoverageCard(bearing: '1' | '2' | '3' | '4', count: number): string {
  const active = count > 0 ? 'is-active' : '';
  return `
    <div class="coverage-card ${active}">
      <span>Bearing ${bearing}</span>
      <strong>${count}</strong>
    </div>
  `;
}

function equipmentPayload(row: EquipmentRecord): string {
  return encodeURIComponent(JSON.stringify({
    equipment: row.equipment,
    unit: row.unit,
    status: row.status,
    vibMax: row.vibMax,
  }));
}

function renderEquipmentCards(rows: EquipmentRecord[]): string {
  const counts = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});

  const items: Array<[string, number, string]> = [
    ['ALARM', counts.ALARM ?? 0, 'tone-danger'],
    ['WARNING', counts.WARNING ?? 0, 'tone-warning'],
    ['PREWARNING', counts.PREWARNING ?? 0, 'tone-caution'],
    ['NORMAL', counts.NORMAL ?? 0, 'tone-normal'],
    ['STAND BY', counts['STAND BY'] ?? 0, 'tone-muted'],
  ];

  return items
    .map(
      ([label, count, tone]) => `
        <div class="summary-chip ${tone}">
          <span>${label}</span>
          <strong>${count}</strong>
        </div>
      `,
    )
    .join('');
}

function renderEquipmentPriority(rows: EquipmentRecord[]): string {
  const priority = rows
    .filter((row) => row.status === 'ALARM' || row.status === 'WARNING')
    .sort((a, b) => b.vibMax - a.vibMax)
    .slice(0, 5);

  if (!priority.length) {
    return `<div class="empty-state"><div class="empty-state__title">Tidak ada alarm</div><div class="empty-state__text">Filter saat ini tidak memiliki equipment WARNING/ALARM.</div></div>`;
  }

  return priority
    .map(
      (row, index) => `
        <div class="priority-card">
          <div class="priority-card__top">
            <strong>${index + 1}. ${escapeHtml(row.equipment)}</strong>
            <span class="priority-card__value ${row.status === 'ALARM' ? 'tone-danger' : 'tone-warning'}">${row.vibMax.toFixed(2)}</span>
          </div>
          <div class="priority-card__meta">${escapeHtml(row.unit)} | ${escapeHtml(row.status)}</div>
          <div class="priority-card__actions">
            <button type="button" class="ghost-btn ghost-btn--small eq-action-btn" data-action="focus-equipment-sim" data-eq="${equipmentPayload(row)}">Set ke 3D</button>
          </div>
        </div>
      `,
    )
    .join('');
}

function renderEquipmentTable(rows: EquipmentRecord[]): string {
  if (!rows.length) {
    return `
      <tr>
        <td colspan="8" class="table-empty">Tidak ada data untuk tanggal/filter ini.</td>
      </tr>
    `;
  }

  return rows
    .slice()
    .sort((a, b) => b.vibMax - a.vibMax)
    .map((row) => {
      const hp = highestPoint(row);
      return `
        <tr>
          <td>
            <button type="button" class="ghost-btn ghost-btn--small eq-action-btn" data-action="focus-equipment-sim" data-eq="${equipmentPayload(row)}">Pilih</button>
          </td>
          <td>${escapeHtml(row.unit)}</td>
          <td class="cell-strong">${escapeHtml(row.equipment)}</td>
          <td>${escapeHtml(row.group ?? '-')}</td>
          <td class="cell-right">${row.vibMax.toFixed(2)} mm/s</td>
          <td><span class="status-badge ${statusClass(row.status)}">${escapeHtml(row.status)}</span></td>
          <td class="cell-mono">${escapeHtml(hp.label)}${hp.value !== null ? ` = ${hp.value.toFixed(2)}` : ''}</td>
          <td>${escapeHtml(recommendationFor(row))}</td>
        </tr>
      `;
    })
    .join('');
}

function renderEquipmentChart(rows: EquipmentRecord[], canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }

  const parent = canvas.parentElement;
  if (!parent) {
    return;
  }

  const width = parent.clientWidth;
  const height = 190;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const top = rows
    .filter((row) => Number.isFinite(row.vibMax))
    .sort((a, b) => b.vibMax - a.vibMax)
    .slice(0, 8);

  if (!top.length) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px "IBM Plex Mono"';
    ctx.fillText('No data for current filter.', 12, 28);
    return;
  }

  const max = Math.max(...top.map((row) => row.vibMax), 1);
  const barHeight = 14;
  const gap = 6;
  ctx.font = '11px "Space Grotesk"';

  top.forEach((row, index) => {
    const y = index * (barHeight + gap) + 8;
    const label = row.equipment.length > 24 ? `${row.equipment.slice(0, 24)}...` : row.equipment;
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'left';
    ctx.fillText(label, 0, y + 10);
    const barX = 150;
    const barW = (width - 210) * (row.vibMax / max);
    ctx.fillStyle =
      row.status === 'ALARM'
        ? '#ef4444'
        : row.status === 'WARNING'
          ? '#f97316'
          : row.status === 'PREWARNING'
            ? '#eab308'
            : '#10b981';
    ctx.fillRect(barX, y, barW, barHeight);
    ctx.fillStyle = '#e2e8f0';
    ctx.textAlign = 'right';
    ctx.fillText(row.vibMax.toFixed(2), width - 4, y + 10);
  });
}

function renderEquipmentView(state: AppState): string {
  const dataset = equipmentDatasets[state.equipmentDatasetKey] ?? equipmentDatasets['2026-01-01'];
  const rows = filteredEquipmentRows(state);
  return `
    <section id="equipmentView" class="view ${state.currentTab === 'equipment' ? '' : 'is-hidden'}">
      <div class="panel view-card">
        <div class="panel-title">Equipment Dashboard</div>
        <div class="view-card__subtitle">Trending data, priority equipment, dan ringkasan status untuk setiap dataset yang tersedia.</div>
        <div class="dataset-toolbar">
          <select id="eqDateDay"></select>
          <select id="eqDateMonth"></select>
          <select id="eqDateYear"></select>
        </div>
        <div class="dataset-card">
          <div class="dataset-card__title" id="eqActiveDataset">${escapeHtml(dataset.label)} | ${dataset.data.length} equipment</div>
          <div class="dataset-card__text" id="eqDatasetSource">Sumber: ${escapeHtml(dataset.source)}</div>
          <div class="dataset-card__stats">
            <div class="dataset-card__metric">
              <span>Filtered</span>
              <strong id="eqTotal">${rows.length}</strong>
            </div>
            <div class="dataset-card__metric">
              <span>Dataset Key</span>
              <strong>${escapeHtml(state.equipmentDatasetKey)}</strong>
            </div>
          </div>
          <div class="dataset-card__desc" id="eqDatasetDesc">Pilih tanggal, bulan, dan tahun untuk menampilkan dataset vibration equipment yang tersedia.</div>
        </div>
      </div>

      <div class="panel view-card">
        <div class="panel-title">Filters & Overview</div>
        <div class="filter-bar">
          <select id="eqUnitFilter"></select>
          <select id="eqStatusFilter">
            <option value="ALL" ${state.equipmentStatusFilter === 'ALL' ? 'selected' : ''}>All Status</option>
            <option value="ALARM" ${state.equipmentStatusFilter === 'ALARM' ? 'selected' : ''}>ALARM</option>
            <option value="WARNING" ${state.equipmentStatusFilter === 'WARNING' ? 'selected' : ''}>WARNING</option>
            <option value="PREWARNING" ${state.equipmentStatusFilter === 'PREWARNING' ? 'selected' : ''}>PREWARNING</option>
            <option value="NORMAL" ${state.equipmentStatusFilter === 'NORMAL' ? 'selected' : ''}>NORMAL</option>
            <option value="STAND BY" ${state.equipmentStatusFilter === 'STAND BY' ? 'selected' : ''}>STAND BY</option>
          </select>
          <input id="eqSearch" type="search" placeholder="Cari equipment, contoh: CWP, Fan, Pump" value="${escapeHtml(state.equipmentSearch)}" />
        </div>
        <div class="summary-grid" id="eqCards">${renderEquipmentCards(rows)}</div>
      </div>

      <div class="panel view-card">
        <div class="panel-title">Trend Chart</div>
        <div class="equipment-layout">
          <div class="chart-shell">
            <canvas id="eqBarCanvas" height="190"></canvas>
          </div>
          <div class="priority-shell" id="eqPriority">${renderEquipmentPriority(rows)}</div>
        </div>
      </div>

      <div class="panel view-card">
        <div class="panel-title">Equipment Table</div>
        <div class="view-card__subtitle">Klik tombol <strong>Pilih</strong> atau <strong>Set ke 3D</strong> untuk mengirim equipment ke tab 3D Simulation.</div>
        <div class="table-shell">
          <table class="data-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Unit</th>
                <th>Equipment</th>
                <th>Group</th>
                <th>Vib Max</th>
                <th>Status</th>
                <th>Highest Point</th>
                <th>Recommendation</th>
              </tr>
            </thead>
            <tbody id="eqTable">${renderEquipmentTable(rows)}</tbody>
          </table>
        </div>
      </div>
    </section>
  `;
}

function filteredEquipmentRows(state: AppState): EquipmentRecord[] {
  const dataset = equipmentDatasets[state.equipmentDatasetKey] ?? equipmentDatasets['2026-01-01'];
  const query = state.equipmentSearch.trim().toLowerCase();

  return dataset.data.filter((row) => {
    const unitOk = state.equipmentUnitFilter === 'ALL' || row.unit === state.equipmentUnitFilter;
    const statusOk = state.equipmentStatusFilter === 'ALL' || row.status === state.equipmentStatusFilter;
    const text = `${row.equipment} ${row.unit} ${row.group ?? ''}`.toLowerCase();
    const queryOk = !query || text.includes(query);
    return unitOk && statusOk && queryOk;
  });
}

function renderReferenceView(): string {
  const models = Object.keys(equipmentDatasets)
    .map((key) => equipmentDatasets[key].source)
    .slice(0, 2);

  return `
    <section id="referenceView" class="view ${state.currentTab === 'reference' ? '' : 'is-hidden'}">
      <div class="panel view-card">
        <div class="panel-title">Reference Library</div>
        <div class="view-card__subtitle">Quick mapping dari fault signature ke Mobius reference dan corrective action.</div>
        <div class="reference-strip">
          ${models.map((source) => `<span class="chip chip--muted">${escapeHtml(source)}</span>`).join('')}
          <span class="chip chip--accent">${Object.keys(equipmentDatasets).length} datasets</span>
        </div>
      </div>
      <div class="reference-grid" id="refGrid">
        ${referenceCards
          .map(
            (card) => `
              <article class="reference-card panel">
                <div class="reference-card__head">
                  <div>
                    <div class="reference-card__title">${escapeHtml(card.title)}</div>
                    <div class="reference-card__ref">${escapeHtml(card.ref)}</div>
                  </div>
                  <div class="fault-pill">${escapeHtml(card.faultKey ?? 'REF')}</div>
                </div>
                <div class="reference-card__section">
                  <span>Symptoms</span>
                  <p>${escapeHtml(card.symptoms)}</p>
                </div>
                <div class="reference-card__section">
                  <span>Solution</span>
                  <p class="text-success">${escapeHtml(card.solution)}</p>
                </div>
              </article>
            `,
          )
          .join('')}
      </div>
    </section>
  `;
}

function renderShell(state: AppState): string {
  const densityClass = `app-shell--density-${state.uiDensity}`;
  const textClass = state.uiTextCollapsed ? 'app-shell--text-collapsed' : '';
  return `
    <div class="app-shell ${densityClass} ${textClass}">
      <aside class="sidebar" id="sidebarContent">
        ${renderSidebar(state)}
      </aside>
      <main class="main">
        ${renderTopBar(state)}
        <div class="main-stack">
          ${renderSimView(state)}
          ${renderAnalysisView(state)}
          ${renderUploadView(state)}
          ${renderEquipmentView(state)}
          ${renderReferenceView()}
        </div>
      </main>
      <div id="appToast" class="toast" role="status" aria-live="polite"></div>
    </div>
  `;
}

function showToast(message: string, tone: 'info' | 'warning' | 'error' = 'warning'): void {
  const toast = qs<HTMLElement>('#appToast');
  if (!toast) {
    return;
  }

  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className = `toast toast--${tone} is-visible`;
  toastTimer = window.setTimeout(() => {
    toast.classList.remove('is-visible');
  }, 4200);
}

function inferMachineTypeFromEquipmentName(name: string): MachineContext['machineType'] {
  const value = name.toLowerCase();
  if (/pump|cwp|pmp|impeller/.test(value)) return 'pump';
  if (/fan|blower|idf|fdf/.test(value)) return 'fan';
  if (/compress/.test(value)) return 'compressor';
  if (/gear|gbx|reducer/.test(value)) return 'gearbox';
  if (/turbine/.test(value)) return 'turbine';
  return 'motor';
}

function decodeEquipmentPayload(raw: string | undefined): { equipment: string; unit: string; status: string; vibMax: number } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as { equipment?: string; unit?: string; status?: string; vibMax?: number };
    if (!parsed.equipment || !parsed.unit) {
      return null;
    }
    return {
      equipment: String(parsed.equipment),
      unit: String(parsed.unit),
      status: String(parsed.status ?? ''),
      vibMax: Number(parsed.vibMax ?? 0),
    };
  } catch {
    return null;
  }
}

function focusEquipmentToSimulation(payload: string | undefined): void {
  const equipment = decodeEquipmentPayload(payload);
  if (!equipment) {
    return;
  }

  const machineType = inferMachineTypeFromEquipmentName(equipment.equipment);
  const mappedFault: FaultKey =
    equipment.status === 'ALARM' ? 'bearing'
      : equipment.status === 'WARNING' || equipment.status === 'PREWARNING' ? 'misalignment'
        : 'normal';

  state.machineContext = {
    ...state.machineContext,
    equipmentCode: `${equipment.unit}-${equipment.equipment.slice(0, 12).replace(/\s+/g, '-')}`.toUpperCase(),
    equipmentName: equipment.equipment,
    machineType,
    drivenComponent: machineType,
    sourceUploadName: `Equipment Dashboard (${equipment.status})`,
    notes: `Dipilih dari Equipment Dashboard | Status: ${equipment.status} | Vib Max: ${equipment.vibMax.toFixed(2)} mm/s`,
  };
  state.faultKey = mappedFault;
  state.currentTab = 'sim';
  persistAppState(state);
  renderAllSections();
  void ensureVisualControllers().then(() => {
    controllers?.three.resize();
    controllers?.three.resetCamera();
    controllers?.charts.resize();
  });
  showToast(`${equipment.equipment} diterapkan ke 3D Simulation.`, 'info');
}

function syncSidebar(): void {
  const rpmDisplay = qs<HTMLElement>('#rpmDisplaySide');
  const loadDisplay = qs<HTMLElement>('#loadDisplaySide');
  const overallDisplay = qs<HTMLElement>('#overallDisplaySide');
  const zoneDisplay = qs<HTMLElement>('#zoneDisplaySide');
  const statusText = qs<HTMLElement>('#statusTextSide');
  const statusTextTop = qs<HTMLElement>('#statusTextTop');
  const connectionChip = qs<HTMLElement>('#connectionChip');
  const connectionChipTop = qs<HTMLElement>('#connectionChipTop');
  const roleChip = qs<HTMLElement>('#roleChip');
  const roleChipTop = qs<HTMLElement>('#roleChipTop');
  const authMessage = qs<HTMLElement>('#authMessage');
  const rpmVal = qs<HTMLElement>('#rpmVal');
  const loadVal = qs<HTMLElement>('#loadVal');
  const bearingPanel = qs<HTMLElement>('.bearing-panel');
  const historyList = qs<HTMLElement>('#historyList');
  const authSignOut = qs<HTMLButtonElement>('#authSignOut');
  const authSubmit = qs<HTMLButtonElement>('#authSubmit');
  const authEmail = qs<HTMLInputElement>('#authEmail');
  const authPassword = qs<HTMLInputElement>('#authPassword');

  const profile = faultProfiles[state.faultKey];
  if (rpmDisplay) rpmDisplay.textContent = `${state.rpm}`;
  if (loadDisplay) loadDisplay.textContent = `${state.load}%`;
  if (overallDisplay) overallDisplay.textContent = formatMmps(profile.overall);
  if (zoneDisplay) zoneDisplay.textContent = `ZONE ${profile.severity}`;
  if (statusText) statusText.textContent = simStatusLabel(state.faultKey);
  if (statusTextTop) statusTextTop.textContent = simStatusLabel(state.faultKey);
  if (connectionChip) connectionChip.textContent = state.connection.mode === 'demo' ? 'DEMO MODE' : state.connection.mode.toUpperCase();
  if (connectionChipTop) connectionChipTop.textContent = state.connection.mode === 'demo' ? 'DEMO' : state.connection.mode.toUpperCase();
  if (roleChip) roleChip.textContent = state.connection.role.toUpperCase();
  if (roleChipTop) roleChipTop.textContent = state.connection.role.toUpperCase();
  if (authMessage) authMessage.textContent = state.connection.message;
  if (rpmVal) rpmVal.textContent = `${state.rpm}`;
  if (loadVal) loadVal.textContent = `${state.load}`;
  if (historyList) historyList.innerHTML = renderHistoryCards(state.history);

  if (authSignOut) {
    authSignOut.classList.toggle('is-hidden', state.connection.mode !== 'signed-in');
  }
  if (authSubmit) {
    authSubmit.textContent = state.connection.mode === 'signed-in' ? 'Signed In' : 'Sign In';
  }
  if (authEmail) {
    authEmail.disabled = !state.connection.configured;
  }
  if (authPassword) {
    authPassword.disabled = !state.connection.configured;
  }

  if (bearingPanel) {
    bearingPanel.outerHTML = renderBearingPanel(state.rpm, (qs<HTMLInputElement>('#bearingModel')?.value ?? '').trim());
  }
}

function syncSimView(): void {
  const profile = faultProfiles[state.faultKey];
  const diagPanel = qs<HTMLElement>('#diagPanel');
  const recommendations = qs<HTMLElement>('#recommendations');
  const infoRpm = qs<HTMLElement>('#infoRpm');
  const info1X = qs<HTMLElement>('#info1X');
  const infoBPF = qs<HTMLElement>('#infoBPF');
  const peak1X = qs<HTMLElement>('#peak1X');
  const peak2X = qs<HTMLElement>('#peak2X');
  const peak3X = qs<HTMLElement>('#peak3X');
  const peak4X = qs<HTMLElement>('#peak4X');
  const peakMax = qs<HTMLElement>('#peakMax');
  const statusText = qs<HTMLElement>('#statusTextSim');
  const statusTextTop = qs<HTMLElement>('#statusTextTop');
  const overallDisplay = qs<HTMLElement>('#overallDisplaySim');
  const zoneDisplay = qs<HTMLElement>('#zoneDisplaySim');
  const machineMetaName = qs<HTMLElement>('#machineMetaName');
  const machineMetaType = qs<HTMLElement>('#machineMetaType');
  const machineMetaPoint = qs<HTMLElement>('#machineMetaPoint');
  const machineMetaSource = qs<HTMLElement>('#machineMetaSource');
  const simLiveRpm = qs<HTMLElement>('#simLiveRpm');
  const simLive1x = qs<HTMLElement>('#simLive1x');
  const simLivePoint = qs<HTMLElement>('#simLivePoint');
  const simLiveFault = qs<HTMLElement>('#simLiveFault');

  if (diagPanel) {
    diagPanel.innerHTML = `
      <div class="diagnosis-box severity-${profile.severity.toLowerCase()}">
        <div class="diagnosis-box__head">
          <span class="fault-pill">${escapeHtml(profile.icon)}</span>
          <div>
            <div class="diagnosis-box__title">${escapeHtml(profile.name)}</div>
            <div class="diagnosis-box__meta">${escapeHtml(profile.mobiusRef)}</div>
          </div>
        </div>
        <div class="diagnosis-box__text">${escapeHtml(profile.desc)}</div>
      </div>
    `;
  }

  if (recommendations) {
    recommendations.innerHTML = profile.recommendations
      .map(
        (item) => `
          <div class="recommendation-row">
            <span class="recommendation-row__icon">${profile.severity === 'D' ? '!' : profile.severity === 'C' ? '~' : 'v'}</span>
            <span>${escapeHtml(item)}</span>
          </div>
        `,
      )
      .join('');
  }

  if (infoRpm) infoRpm.textContent = `${state.rpm} RPM`;
  if (info1X) info1X.textContent = formatHz(state.rpm / 60);
  if (infoBPF) infoBPF.textContent = `${Math.round((state.rpm / 60) * state.machineContext.vaneCount)} Hz (${state.machineContext.vaneCount} vanes)`;
  if (peak1X) peak1X.textContent = formatMmps(profile.spectrum.find((p) => Math.abs(p.o - 1) < 0.1)?.a ?? 0.01);
  if (peak2X) peak2X.textContent = formatMmps(profile.spectrum.find((p) => Math.abs(p.o - 2) < 0.1)?.a ?? 0.01);
  if (peak3X) peak3X.textContent = formatMmps(profile.spectrum.find((p) => Math.abs(p.o - 3) < 0.1)?.a ?? 0.01);
  if (peak4X) peak4X.textContent = formatMmps(profile.spectrum.find((p) => Math.abs(p.o - 4) < 0.1)?.a ?? 0.01);
  if (peakMax) peakMax.textContent = formatMmps(Math.max(...profile.spectrum.map((item) => item.a)));
  if (statusText) statusText.textContent = simStatusLabel(state.faultKey);
  if (statusTextTop) statusTextTop.textContent = simStatusLabel(state.faultKey);
  if (overallDisplay) overallDisplay.textContent = formatMmps(profile.overall);
  if (zoneDisplay) zoneDisplay.textContent = `ZONE ${profile.severity}`;
  if (machineMetaName) machineMetaName.textContent = state.machineContext.equipmentName;
  if (machineMetaType) machineMetaType.textContent = `${state.machineContext.machineType} -> ${state.machineContext.drivenComponent}`;
  if (machineMetaPoint) machineMetaPoint.textContent = `${state.machineContext.measurementPoint} / ${state.machineContext.direction.toUpperCase()}`;
  if (machineMetaSource) machineMetaSource.textContent = state.machineContext.sourceUploadName;
  if (simLiveRpm) simLiveRpm.textContent = `${state.rpm}`;
  if (simLive1x) simLive1x.textContent = formatHz(state.rpm / 60);
  if (simLivePoint) simLivePoint.textContent = state.machineContext.measurementPoint;
  if (simLiveFault) simLiveFault.textContent = profile.name;
}

function renderPeakList(): void {
  const peakList = qs<HTMLElement>('#peakList');
  if (peakList) {
    peakList.innerHTML = renderAnalysisRows(state.peakRows);
  }
}

function renderAnalysisResultsPanel(): void {
  const resultsList = qs<HTMLElement>('#resultsList');
  const analysisResults = qs<HTMLElement>('#analysisResults');
  if (resultsList) {
    resultsList.innerHTML = renderAnalysisResults(state.analysisResults);
  }
  if (analysisResults) {
    analysisResults.classList.toggle('is-hidden', !state.analysisResults.length);
  }
  const analysisHistoryList = qs<HTMLElement>('#analysisHistoryList');
  if (analysisHistoryList) {
    analysisHistoryList.innerHTML = renderAnalysisHistory(state.history);
  }
}

function renderUploadPanel(): void {
  const view = qs<HTMLElement>('#aiView');
  if (!view) return;
  view.outerHTML = renderUploadView(state);
}

function renderAnalysisPanel(): void {
  const view = qs<HTMLElement>('#analysisView');
  if (!view) return;
  view.outerHTML = renderAnalysisView(state);
}

function renderEquipmentPanel(): void {
  const view = qs<HTMLElement>('#equipmentView');
  if (!view) return;
  view.outerHTML = renderEquipmentView(state);
  populateEquipmentSelectors();
  syncEquipmentChart();
}

function renderReferencePanel(): void {
  const view = qs<HTMLElement>('#referenceView');
  if (!view) return;
  view.outerHTML = renderReferenceView();
}

function syncEquipmentChart(): void {
  const canvas = qs<HTMLCanvasElement>('#eqBarCanvas');
  if (!canvas) return;
  const rows = filteredEquipmentRows(state);
  renderEquipmentChart(rows, canvas);
}

function populateEquipmentSelectors(): void {
  const daySelect = qs<HTMLSelectElement>('#eqDateDay');
  const monthSelect = qs<HTMLSelectElement>('#eqDateMonth');
  const yearSelect = qs<HTMLSelectElement>('#eqDateYear');
  const unitSelect = qs<HTMLSelectElement>('#eqUnitFilter');

  if (!daySelect || !monthSelect || !yearSelect || !unitSelect) {
    return;
  }

  const keys = Object.keys(equipmentDatasets).sort().reverse();
  const parsed = keys.map((key) => parseDatasetKey(key));
  const days = [...new Set(parsed.map((item) => String(item.day).padStart(2, '0')))].sort((a, b) => Number(a) - Number(b));
  const months = [...new Set(parsed.map((item) => String(item.month).padStart(2, '0')))].sort((a, b) => Number(a) - Number(b));
  const years = [...new Set(parsed.map((item) => String(item.year)))].sort((a, b) => Number(b) - Number(a));

  daySelect.innerHTML = days.map((value) => `<option value="${value}">${value}</option>`).join('');
  monthSelect.innerHTML = months
    .map((value) => `<option value="${value}">${monthName(Number(value))}</option>`)
    .join('');
  yearSelect.innerHTML = years.map((value) => `<option value="${value}">${value}</option>`).join('');

  const active = parseDatasetKey(state.equipmentDatasetKey);
  daySelect.value = String(active.day).padStart(2, '0');
  monthSelect.value = String(active.month).padStart(2, '0');
  yearSelect.value = String(active.year);

  const dataset = equipmentDatasets[state.equipmentDatasetKey] ?? equipmentDatasets['2026-01-01'];
  const units = ['ALL', ...Array.from(new Set(dataset.data.map((row) => row.unit))).filter(Boolean)];
  unitSelect.innerHTML = units
    .map((value) => `<option value="${escapeHtml(value)}" ${value === state.equipmentUnitFilter ? 'selected' : ''}>${escapeHtml(value === 'ALL' ? 'Semua Unit' : value)}</option>`)
    .join('');
}

function monthName(month: number): string {
  const names = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  return names[month - 1] ?? String(month);
}

function parseDatasetKey(key: string): { year: number; month: number; day: number } {
  const [year, month, day] = key.split('-').map(Number);
  return {
    year: year || 2026,
    month: month || 1,
    day: day || 1,
  };
}

function getSelectedDatasetKey(): string {
  const day = qs<HTMLSelectElement>('#eqDateDay')?.value ?? '01';
  const month = qs<HTMLSelectElement>('#eqDateMonth')?.value ?? '01';
  const year = qs<HTMLSelectElement>('#eqDateYear')?.value ?? '2026';
  return `${year}-${month}-${day}`;
}

function syncEquipmentInfo(): void {
  const dataset = equipmentDatasets[state.equipmentDatasetKey] ?? equipmentDatasets['2026-01-01'];
  const desc = qs<HTMLElement>('#eqDatasetDesc');
  const active = qs<HTMLElement>('#eqActiveDataset');
  const source = qs<HTMLElement>('#eqDatasetSource');
  const total = qs<HTMLElement>('#eqTotal');
  const unitSelect = qs<HTMLSelectElement>('#eqUnitFilter');

  if (desc) {
    desc.textContent = `Data vibration velocity ${dataset.monthLabel}. Pilih tanggal, bulan, dan tahun untuk mengganti data yang tampil.`;
  }
  if (active) {
    active.textContent = `${dataset.label} | ${dataset.data.length} equipment`;
  }
  if (source) {
    source.textContent = `Sumber: ${dataset.source}`;
  }
  if (total) {
    total.textContent = `${filteredEquipmentRows(state).length}`;
  }
  if (unitSelect) {
    const units = ['ALL', ...Array.from(new Set(dataset.data.map((row) => row.unit))).filter(Boolean)];
    unitSelect.innerHTML = units
      .map((value) => `<option value="${escapeHtml(value)}" ${value === state.equipmentUnitFilter ? 'selected' : ''}>${escapeHtml(value === 'ALL' ? 'Semua Unit' : value)}</option>`)
      .join('');
  }
}

function syncEquipmentView(): void {
  const rows = filteredEquipmentRows(state);
  const cards = qs<HTMLElement>('#eqCards');
  const priority = qs<HTMLElement>('#eqPriority');
  const table = qs<HTMLElement>('#eqTable');
  const total = qs<HTMLElement>('#eqTotal');
  if (cards) cards.innerHTML = renderEquipmentCards(rows);
  if (priority) priority.innerHTML = renderEquipmentPriority(rows);
  if (table) table.innerHTML = renderEquipmentTable(rows);
  if (total) total.textContent = `${rows.length}`;
  syncEquipmentInfo();
  syncEquipmentChart();
}

function syncUploadView(): void {
  const view = qs<HTMLElement>('#aiView');
  if (!view) return;
  view.outerHTML = renderUploadView(state);
}

function syncTabVisibility(): void {
  const tabButtons = qsa<HTMLButtonElement>('[data-action="switch-tab"]');
  tabButtons.forEach((button) => {
    const active = button.dataset.tab === state.currentTab;
    button.classList.toggle('is-active', active);
  });

  const views = ['simView', 'analysisView', 'aiView', 'equipmentView', 'referenceView'] as const;
  views.forEach((id) => {
    const element = qs<HTMLElement>(`#${id}`);
    if (!element) return;
    const tab = id.replace('View', '') as AppState['currentTab'];
    element.classList.toggle('is-hidden', tab !== state.currentTab);
  });
}

function syncShellPresentation(): void {
  const shell = qs<HTMLElement>('.app-shell');
  if (shell) {
    shell.classList.remove('app-shell--density-compact', 'app-shell--density-normal', 'app-shell--density-large', 'app-shell--text-collapsed');
    shell.classList.add(`app-shell--density-${state.uiDensity}`);
    if (state.uiTextCollapsed) {
      shell.classList.add('app-shell--text-collapsed');
    }
  }

  const densityButton = qs<HTMLButtonElement>('[data-action="toggle-ui-density"]');
  const textButton = qs<HTMLButtonElement>('[data-action="toggle-ui-text"]');
  if (densityButton) {
    const label = state.uiDensity === 'compact' ? 'Compact' : state.uiDensity === 'large' ? 'Large' : 'Normal';
    densityButton.textContent = `Size ${label}`;
  }
  if (textButton) {
    textButton.textContent = state.uiTextCollapsed ? 'Show Text' : 'Hide Text';
  }
}

function renderAllSections(): void {
  syncShellPresentation();
  syncSidebar();
  syncSimView();
  renderAnalysisResultsPanel();
  syncEquipmentView();
  syncTabVisibility();
}

function setState(patch: Partial<AppState>): void {
  state = {
    ...state,
    ...patch,
  };
  persistAppState(state);
  renderAllSections();
}

function updatePeakRowField(rowId: string, field: keyof PeakInputRow, value: string): void {
  state.peakRows = state.peakRows.map((row) => (row.id === rowId ? { ...row, [field]: value } : row));
  persistAppState(state);
}

function addPeakRow(): void {
  state.peakRows = [...state.peakRows, createPeakRow()];
  persistAppState(state);
  renderAnalysisPanel();
}

function removePeakRow(rowId: string): void {
  state.peakRows = state.peakRows.filter((row) => row.id !== rowId);
  if (!state.peakRows.length) {
    state.peakRows = [createPeakRow('1X', '24.5', '2.2')];
  }
  persistAppState(state);
  renderAnalysisPanel();
}

function resetAnalysisRows(): void {
  state.peakRows = [createPeakRow('1X', '24.5', '2.2'), createPeakRow('2X', '49.0', '0.7'), createPeakRow('3X', '73.5', '0.3')];
  state.analysisResults = [];
  persistAppState(state);
  renderAnalysisPanel();
}

function analyzeSpectrum(): void {
  const peaks = state.peakRows
    .map((row) => ({
      order: row.order,
      freq: Number.parseFloat(row.freq),
      amp: Number.parseFloat(row.amp),
    }))
    .filter((peak) => Number.isFinite(peak.freq) && Number.isFinite(peak.amp));

  if (!peaks.length) {
    showToast('Masukkan minimal satu peak untuk menjalankan analisis spectrum.', 'warning');
    return;
  }

  const detectedRpm = detectRpmFromPeaks(peaks, state.analysisRpm);
  state.machineContext = {
    ...state.machineContext,
    detectedRpm,
  };
  if (state.machineContext.rpmSource === 'detected') {
    state.machineContext.rpm = detectedRpm;
    state.analysisRpm = detectedRpm;
    state.rpm = detectedRpm;
  }

  const results = rankSpectrumPeaks(peaks, state.analysisRpm, state.analysisDirection, state.machineContext);
  state.analysisResults = results;
  state.diagnosisSummary = buildDiagnosisSummary(peaks, results, state.machineContext);
  persistAppState(state);
  renderAnalysisPanel();

  const best = results[0];
  if (!best) {
    return;
  }

  const historyEntry = seedHistoryEntry('spectrum', best.key, state.analysisRpm, state.analysisDirection, best.confidence, best.evidence);
  state.history = appendHistory(historyEntry);
  renderAllSections();
  persistAnalysisRemote(historyEntry, peaks).catch(() => undefined);
}

async function persistAnalysisRemote(entry: HistoryEntry, peaks: Array<{ order: string; freq: number; amp: number }>): Promise<void> {
  const client = getSupabaseClient();
  if (!client || !isSupabaseConfigured()) {
    return;
  }

  const userId = await getSignedInUserId(client);
  if (!userId) {
    return;
  }

  await client.from('analysis_results').insert({
    measurement_set_id: null,
    fault_key: entry.faultKey,
    confidence: entry.confidence,
    evidence: entry.evidence,
    peaks,
    source: entry.source,
    asset_condition: state.diagnosisSummary?.assetCondition ?? null,
    dominant_fault: state.diagnosisSummary?.dominantFault ?? null,
    secondary_fault: state.diagnosisSummary?.secondaryFault ?? null,
    priority_score: state.diagnosisSummary?.priorityScore ?? null,
    recommended_actions: state.diagnosisSummary?.recommendedActions ?? [],
    point_diagnoses: state.diagnosisSummary?.pointDiagnoses ?? [],
    priority_breakdown: state.diagnosisSummary?.priorityBreakdown ?? {},
    created_by: userId,
  });
}

function renderAIStateModal(visible: boolean): void {
  const modal = qs<HTMLElement>('#aiModal');
  const progress = qs<HTMLElement>('#modalProgressModal');
  const text = qs<HTMLElement>('#modalScanTextModal');
  if (!modal || !progress || !text) {
    return;
  }

  modal.classList.toggle('is-hidden', !visible);
  if (visible) {
    progress.style.width = '0%';
    text.textContent = 'Processing image data...';
  }
}

async function syncUploadsToSupabase(assets: UploadedAsset[]): Promise<void> {
  const client = getSupabaseClient();
  if (!client || !state.connection.configured) {
    return;
  }

  const userId = await getSignedInUserId(client);
  if (!userId) {
    return;
  }

  for (const asset of assets) {
    if (!(asset.file instanceof File)) {
      continue;
    }

    if (validateUploadFile(asset.file)) {
      continue;
    }

    const safeName = asset.name.replace(/[^\w.-]+/g, '_');
    const objectPath = `${userId}/${cryptoId()}-${safeName}`;
    const uploadResult = await client.storage
      .from('vibration-assets')
      .upload(objectPath, asset.file, {
        upsert: true,
        contentType: asset.file.type || 'application/octet-stream',
      });

    if (uploadResult.error) {
      continue;
    }

    await client.from('uploads').insert({
      measurement_set_id: null,
      bucket_id: 'vibration-assets',
      object_path: objectPath,
      file_name: asset.name,
      mime_type: asset.file.type || null,
      asset_type: asset.type,
      bearing: asset.bearing,
      direction: asset.direction,
      extraction_status: asset.extractionStatus ?? 'pending',
      calibration: asset.calibration ?? null,
      extracted_peaks: asset.extractedPeaks ?? [],
      extraction_confidence: asset.extractionConfidence ?? null,
      trace_points: asset.tracePoints ?? [],
      parse_error: asset.parseError ?? null,
      created_by: userId,
    });
  }
}

function addUploads(fileList: FileList | null): void {
  const candidates = Array.from(fileList ?? []);
  if (!candidates.length) {
    return;
  }

  const remainingSlots = MAX_UPLOAD_COUNT - state.uploadedAssets.length;
  if (remainingSlots <= 0) {
    showToast(`Maksimal ${MAX_UPLOAD_COUNT} file upload per sesi. Hapus beberapa file dulu.`, 'warning');
    return;
  }

  const validFiles: File[] = [];
  const rejectedFiles: string[] = [];
  for (const file of candidates) {
    const error = validateUploadFile(file);
    if (error) {
      rejectedFiles.push(`${file.name}: ${error}`);
      continue;
    }
    validFiles.push(file);
  }

  const files = validFiles.slice(0, remainingSlots);
  if (rejectedFiles.length) {
    const suffix = rejectedFiles.length > 1 ? ` (+${rejectedFiles.length - 1} file lain)` : '';
    showToast(`${rejectedFiles[0]}${suffix}`, 'warning');
  }
  if (validFiles.length > remainingSlots) {
    showToast(`Hanya ${remainingSlots} file yang ditambahkan. Batas upload adalah ${MAX_UPLOAD_COUNT} file.`, 'warning');
  }
  if (!files.length) {
    return;
  }

  files.forEach((file) => {
    const reader = new FileReader();
    reader.onerror = () => {
      showToast(`Gagal membaca file ${file.name}.`, 'error');
    };
    reader.onload = (event) => {
      const isImage = file.type.startsWith('image/');
      const src = isImage ? String(event.target?.result ?? '') : nonImagePreview(file.name);
      const type = pendingUploadPreset?.type ?? guessDataType(file.name);
      const extractedPeaks = isImage ? [] : parseTabularPeaks(String(event.target?.result ?? ''));
      state.uploadedAssets.push({
        id: Number(cryptoId().replace(/\D/g, '').slice(0, 12)) || Date.now(),
        name: file.name.trim().slice(0, 120) || 'uploaded-file',
        src,
        type,
        bearing: pendingUploadPreset?.bearing ?? guessBearing(file.name),
        direction: pendingUploadPreset?.direction ?? guessDirection(file.name),
        file,
        calibration: defaultPlotCalibration(type),
        extractionStatus: isImage ? 'pending' : extractedPeaks.length ? 'extracted' : 'failed',
        extractedPeaks,
        extractionConfidence: isImage ? 0 : extractedPeaks.length ? 95 : 0,
        extractionConfidenceLabel: isImage ? 'low' : extractedPeaks.length ? 'high' : 'low',
        extractionSource: 'local',
        parseError: isImage || extractedPeaks.length ? undefined : 'CSV/TXT tidak memiliki dua kolom numerik frequency/time dan amplitude.',
      } as UploadedAsset & { file: File });
      persistAppState(state);
      renderUploadPanel();
    };
    if (file.type.startsWith('image/')) {
      reader.readAsDataURL(file);
    } else {
      reader.readAsText(file);
    }
  });
  pendingUploadPreset = null;
}

function updateUploadAsset(id: number, field: keyof UploadedAsset, value: string): void {
  state.uploadedAssets = state.uploadedAssets.map((asset) =>
    asset.id === id
      ? ({
          ...asset,
          [field]: value,
          calibration: field === 'type' ? defaultPlotCalibration(value as UploadedAsset['type']) : asset.calibration,
          extractionStatus: field === 'type' && asset.src.startsWith('data:image/') ? 'pending' : asset.extractionStatus,
          extractionSource: 'local',
        } as UploadedAsset)
      : asset,
  );
  persistAppState(state);
  renderUploadPanel();
}

function updateExtractionCalibration(target: HTMLElement): void {
  const id = Number(target.dataset.uploadId);
  const field = target.dataset.extractionField as keyof PlotCalibration | undefined;
  if (!Number.isFinite(id) || !field) {
    return;
  }

  const value = Number((target as HTMLInputElement).value);
  state.uploadedAssets = state.uploadedAssets.map((asset) => {
    if (asset.id !== id) return asset;
    const calibration = { ...(asset.calibration ?? defaultPlotCalibration(asset.type)), [field]: value };
    return {
          ...asset,
          calibration,
          extractionStatus: asset.src.startsWith('data:image/') ? 'pending' : asset.extractionStatus,
          extractionSource: 'local',
        };
  });
  persistAppState(state);
}

function updateExtractedPeak(target: HTMLElement): void {
  const uploadId = Number(target.dataset.uploadId);
  const peakId = target.dataset.peakId;
  const field = target.dataset.extractedPeakField as 'frequency' | 'amplitude' | undefined;
  const value = Number((target as HTMLInputElement).value);
  if (!Number.isFinite(uploadId) || !peakId || !field || !Number.isFinite(value)) {
    return;
  }

  state.uploadedAssets = state.uploadedAssets.map((asset) =>
    asset.id === uploadId
      ? {
          ...asset,
          extractedPeaks: (asset.extractedPeaks ?? []).map((peak) =>
            peak.id === peakId ? { ...peak, [field]: value, confidence: Math.max(peak.confidence, 55) } : peak,
          ),
          extractionStatus: 'extracted',
          extractionSource: 'manual-corrected',
        }
      : asset,
  );
  persistAppState(state);
  renderUploadPanel();
}

async function extractUpload(uploadId: number, render = true): Promise<void> {
  const asset = state.uploadedAssets.find((item) => item.id === uploadId);
  if (!asset) {
    return;
  }

  state.uploadedAssets = state.uploadedAssets.map((item) =>
    item.id === uploadId ? { ...item, extractionStatus: 'pending', parseError: undefined } : item,
  );
  if (render) {
    renderUploadPanel();
  }
  const extracted = await extractImageDataFromAsset(asset);
  state.uploadedAssets = state.uploadedAssets.map((item) => (item.id === uploadId ? { ...extracted, extractionSource: 'local' } : item));
  persistAppState(state);
  if (render) {
    renderUploadPanel();
  }
}

async function extractAllUploads(render = true): Promise<void> {
  const imageIds = state.uploadedAssets
    .filter((asset) => asset.src.startsWith('data:image/') && asset.extractionStatus !== 'extracted')
    .map((asset) => asset.id);
  for (const uploadId of imageIds) {
    // Sequential extraction avoids locking the browser tab on large image batches.
    // eslint-disable-next-line no-await-in-loop
    await extractUpload(uploadId, false);
  }
  persistAppState(state);
  if (render) {
    renderUploadPanel();
  }
}

function applyExtractedPeaks(): void {
  const rows = mergeExtractedPeaksToRows(state.uploadedAssets);
  if (!rows.length) {
    showToast('Belum ada peak hasil ekstraksi. Klik Extract Photo atau koreksi kalibrasi dulu.', 'warning');
    return;
  }

  state.peakRows = rows;
  state.analysisRpm = effectiveRpm(state.machineContext);
  state.analysisDirection = mapMeasurementDirection(state.machineContext.direction);
  state.analysisResults = rankSpectrumPeaks(currentPeakValuesFromRows(rows), state.analysisRpm, state.analysisDirection, state.machineContext);
  state.diagnosisSummary = buildDiagnosisSummary(currentPeakValuesFromRows(rows), state.analysisResults, state.machineContext);
  persistAppState(state);
  renderAllSections();
}

function removeUpload(id: number): void {
  state.uploadedAssets = state.uploadedAssets.filter((asset) => asset.id !== id);
  state.uploadResult = null;
  persistAppState(state);
  renderUploadPanel();
}

function resetUploads(): void {
  state.uploadedAssets = [];
  state.uploadResult = null;
  persistAppState(state);
  renderUploadPanel();
}

async function generateReport(): Promise<void> {
  const summary = state.diagnosisSummary;
  const insights = buildReportInsightsFromRows(state.peakRows, state.machineContext);
  const markers = insights.markers;
  const peaks = insights.peaks;
  const priorityRows = summary ? priorityBreakdownRows(summary) : [];
  const { jsPDF, autoTable } = await loadPdfTools();
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 40;
  doc.setFillColor(6, 18, 30);
  doc.rect(0, 0, 595, 92, 'F');
  doc.setTextColor(232, 255, 251);
  doc.setFontSize(18);
  doc.text('Mobius Simulation PDM Report', margin, 42);
  doc.setFontSize(10);
  doc.setTextColor(177, 205, 214);
  doc.text(`${state.machineContext.equipmentCode} | ${state.machineContext.equipmentName}`, margin, 62);
  doc.text(`Generated ${new Date().toLocaleString('id-ID')}`, margin, 78);

  autoTable(doc, {
    startY: 118,
    head: [['Equipment Information', 'Value']],
    body: [
      ['Equipment Code', state.machineContext.equipmentCode],
      ['Equipment Name', state.machineContext.equipmentName],
      ['Machine Type', `${state.machineContext.machineType} -> ${state.machineContext.drivenComponent}`],
      ['Drive Type', state.machineContext.driveType],
      ['RPM Source / Actual', `${state.machineContext.rpmSource} / ${effectiveRpm(state.machineContext).toFixed(0)} RPM`],
      ['Bearing / Position', `${state.machineContext.bearingModel} / ${state.machineContext.bearingPosition}`],
      ['Point / Direction', `${state.machineContext.measurementPoint} / ${state.machineContext.direction}`],
      ['Load / Date / Technician', `${state.machineContext.load}% / ${state.machineContext.dateTaken} / ${state.machineContext.technician || '-'}`],
    ],
    styles: { fontSize: 8, cellPadding: 6 },
    headStyles: { fillColor: [16, 56, 70], textColor: [232, 255, 251] },
  });

  let y = (doc as typeof doc & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 250;
  const firstImage = state.uploadedAssets.find((asset) => asset.src.startsWith('data:image/'));
  if (firstImage) {
    y += 20;
    doc.setTextColor(8, 28, 36);
    doc.setFontSize(12);
    doc.text('Original Spectrum/Waveform Photo', margin, y);
    try {
      doc.addImage(firstImage.src, firstImage.src.includes('image/png') ? 'PNG' : 'JPEG', margin, y + 10, 210, 128);
      y += 154;
    } catch {
      y += 18;
      doc.setFontSize(8);
      doc.text('Image could not be embedded in PDF, but remains in upload history.', margin, y);
    }
  }

  autoTable(doc, {
    startY: y + 18,
    head: [['Marker', 'Frequency', 'Source']],
    body: markers.map((marker) => [marker.label, marker.freq ? `${marker.freq.toFixed(1)} Hz` : '-', marker.source]),
    styles: { fontSize: 8, cellPadding: 5 },
    headStyles: { fillColor: [34, 94, 99] },
  });

  autoTable(doc, {
    head: [['Rank', 'Frequency', 'Amplitude', 'Possible Source']],
    body: peaks.map((peak) => [
      String(peak.rank),
      `${peak.frequency.toFixed(1)} Hz`,
      `${peak.amplitude.toFixed(1)} mm/s`,
      peak.possibleSource,
    ]),
    styles: { fontSize: 8, cellPadding: 5 },
    headStyles: { fillColor: [34, 94, 99] },
  });

  autoTable(doc, {
    head: [['Diagnosis', 'Result']],
    body: [
      ['Asset Condition', summary?.assetCondition ?? '-'],
      ['Dominant Fault', summary?.dominantFault ?? '-'],
      ['Secondary Fault', summary?.secondaryFault ?? '-'],
      ['Confidence', summary ? `${summary.confidence.toFixed(0)}%` : '-'],
      ['Priority', summary ? `${summary.priorityScore}/100 ${summary.priorityLevel}` : '-'],
      ['Priority Breakdown', priorityRows.length ? priorityRows.map((item) => `${item.label}: ${item.value} (${item.hint})`).join('\n') : '-'],
      ['Evidence', (summary?.evidence ?? ['Run analysis first.']).join('\n')],
      ['Recommended Action', (summary?.recommendedActions ?? ['Run analysis first.']).map((item, index) => `${index + 1}. ${item}`).join('\n')],
      ['Analyst Notes', state.machineContext.notes],
    ],
    styles: { fontSize: 8, cellPadding: 6, valign: 'top' },
    headStyles: { fillColor: [16, 56, 70] },
  });

  const fileName = `mobius-report-${state.machineContext.equipmentCode || 'asset'}.pdf`;
  doc.save(fileName);
  persistReportRemote(fileName, 'pdf').catch(() => undefined);
}

async function persistReportRemote(fileName: string, reportType: 'pdf' | 'excel' | 'csv'): Promise<void> {
  const client = getSupabaseClient();
  if (!client || !isSupabaseConfigured()) {
    return;
  }
  const userId = await getSignedInUserId(client);
  if (!userId) {
    return;
  }
  await client.from('reports').insert({
    report_type: reportType,
    file_name: fileName,
    payload: buildReportPayloadFromRows(state.peakRows, state.machineContext, state.diagnosisSummary, state.uploadedAssets),
    created_by: userId,
  });
}

async function exportCsv(): Promise<void> {
  const XLSX = await loadXlsxTools();
  const workbook = XLSX.utils.book_new();
  const { peakRows, markerRows, uploadRows } = buildWorkbookRowsFromUploads(state.peakRows, state.machineContext, state.uploadedAssets);
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(peakRows), 'Peak Table');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(markerRows), 'Markers');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(uploadRows), 'Extracted Uploads');
  const fileName = `mobius-peaks-${state.machineContext.equipmentCode || 'asset'}.xlsx`;
  XLSX.writeFile(workbook, fileName);
  persistReportRemote(fileName, 'excel').catch(() => undefined);
}

function downloadText(fileName: string, text: string, type: string): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function startAIAnalysis(): Promise<void> {
  if (!state.uploadedAssets.length) {
    showToast('Upload minimal satu image spectrum atau waveform terlebih dahulu.', 'warning');
    return;
  }

  renderAIStateModal(true);
  const providerReady = isAiProviderReady(state.aiProviderSettings);
  const steps = providerReady
    ? [...buildAiProcessingSteps(state.uploadedAssets.length), 'Calling configured AI vision provider...', 'Merging AI and local extraction...']
    : buildAiProcessingSteps(state.uploadedAssets.length);

  const modalProgress = qs<HTMLElement>('#modalProgressModal');
  const modalText = qs<HTMLElement>('#modalScanTextModal');
  if (!modalProgress || !modalText) {
    return;
  }

  try {
    await extractAllUploads(false);
    await syncUploadsToSupabase(state.uploadedAssets).catch(() => undefined);

    for (let index = 0; index < steps.length; index += 1) {
      modalText.textContent = steps[index];
      modalProgress.style.width = `${((index + 1) / steps.length) * 100}%`;
      // eslint-disable-next-line no-await-in-loop
      await wait(220);
    }

    let aiMerge = mergeAiVisionResultWithUploads(state.uploadedAssets, null);
    let contextForAnalysis = state.machineContext;
    if (providerReady) {
      try {
        state.aiProviderSettings = {
          ...state.aiProviderSettings,
          status: 'running',
          message: 'Calling configured AI vision provider...',
        };
        persistAppState(state);
        const aiResult = await requestAiVisionAnalysis(state.aiProviderSettings, state.uploadedAssets, state.machineContext);
        aiMerge = mergeAiVisionResultWithUploads(state.uploadedAssets, aiResult);
        contextForAnalysis = aiResult.machineContext
          ? normalizeMachineContext({ ...state.machineContext, ...aiResult.machineContext }, state.machineContext)
          : state.machineContext;
        state.aiProviderSettings = {
          ...state.aiProviderSettings,
          status: 'ready',
          message: `AI assist completed with ${aiResult.provider}. Review peaks before final report.`,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'AI provider failed.';
        state.aiProviderSettings = {
          ...state.aiProviderSettings,
          status: 'error',
          message: `${message} Local extraction was used instead.`,
        };
        showToast('AI provider gagal. Diagnosis memakai ekstraksi lokal.', 'warning');
      }
    } else if (state.aiProviderSettings.enabled) {
      state.aiProviderSettings = {
        ...state.aiProviderSettings,
        status: 'error',
        message: 'Isi endpoint dan API key untuk mengaktifkan AI assist. Local extraction was used.',
      };
      showToast('AI provider belum lengkap. Diagnosis memakai ekstraksi lokal.', 'warning');
    }

    state.uploadedAssets = aiMerge.uploads;
    const { finalResult, analysisRows, analysisPeaks, extractedResults, penalty, lowConfidenceUploads } = runAiUploadAnalysis(
      state.uploadedAssets,
      state.rpm,
      contextForAnalysis,
    );
    const totalPenalty = penalty + aiMerge.confidencePenalty;
    state.uploadResult = {
      ...finalResult,
      confidence: Math.max(20, finalResult.confidence - aiMerge.confidencePenalty),
      evidence: [...finalResult.evidence, ...aiMerge.evidence],
    };
    state.machineContext = state.uploadResult.machineContext;
    state.rpm = state.uploadResult.machineContext.rpm;
    state.load = state.uploadResult.machineContext.load;
    state.direction = mapMeasurementDirection(state.uploadResult.machineContext.direction);
    state.analysisRpm = state.uploadResult.machineContext.rpm;
    state.analysisDirection = mapMeasurementDirection(state.uploadResult.machineContext.direction);
    state.peakRows = analysisRows;
    state.analysisResults = extractedResults;
    state.diagnosisSummary = buildDiagnosisSummary(
      analysisPeaks,
      extractedResults,
      state.uploadResult.machineContext,
    );
    state.diagnosisSummary.confidence = Math.max(20, state.diagnosisSummary.confidence - totalPenalty);
    if (lowConfidenceUploads.length) {
      state.diagnosisSummary.evidence = [
        ...state.diagnosisSummary.evidence,
        'Some uploaded photos need manual calibration; diagnosis confidence was reduced.',
      ];
    }
    if (aiMerge.confidencePenalty) {
      state.diagnosisSummary.evidence = [
        ...state.diagnosisSummary.evidence,
        'AI and local extraction disagreed on at least one dominant peak; review manual corrections before final report.',
      ];
    }
    persistAppState(state);
    renderUploadPanel();

    const historyEntry = seedHistoryEntry('ai', state.uploadResult.faultKey, state.rpm, state.uploadResult.machineContext.direction, state.uploadResult.confidence, state.uploadResult.evidence.map((item) => `${item.label}: ${item.value}`));
    state.history = appendHistory(historyEntry);
    renderAllSections();
    persistAnalysisRemote(historyEntry, []).catch(() => undefined);
  } finally {
    renderAIStateModal(false);
  }
}

function applyAIResult(): void {
  if (!state.uploadResult) {
    return;
  }

  state.faultKey = state.uploadResult.faultKey;
  state.machineContext = state.uploadResult.machineContext;
  state.rpm = state.machineContext.rpm;
  state.load = state.machineContext.load;
  state.direction = mapMeasurementDirection(state.machineContext.direction);
  state.analysisRpm = state.machineContext.rpm;
  state.analysisDirection = mapMeasurementDirection(state.machineContext.direction);
  state.peakRows = state.uploadResult.recommendedPeaks;
  const recommendedPeaks = parsePeakInputRows(state.peakRows);
  state.analysisResults = rankSpectrumPeaks(recommendedPeaks, state.analysisRpm, state.analysisDirection, state.machineContext);
  state.diagnosisSummary = buildDiagnosisSummary(recommendedPeaks, state.analysisResults, state.machineContext);
  state.currentTab = 'sim';
  state.uploadResult = null;
  persistAppState(state);
  renderAllSections();
  if (controllers) {
    controllers.three.resize();
    controllers.charts.resize();
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function refreshConnectionState(): void {
  void (async () => {
    state.connection = await fetchAuthConnectionState();
    renderAllSections();
    if (state.connection.mode === 'signed-in') {
      syncRemoteHistory().catch(() => undefined);
    }
  })();
}

async function syncRemoteHistory(): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    return;
  }

  const userId = await getSignedInUserId(client);
  if (!userId) {
    return;
  }

  const { data, error } = await client
    .from('analysis_results')
    .select('id, confidence, fault_key, source, evidence, created_at, fault_profiles(name)')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error || !data) {
    return;
  }

  const remoteHistory: HistoryEntry[] = data.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    source: row.source === 'ai' ? 'ai' : 'spectrum',
    faultKey: row.fault_key as FaultKey,
    faultName: (row.fault_profiles as { name?: string } | null)?.name ?? faultLabel(row.fault_key as FaultKey),
    confidence: Number(row.confidence),
    rpm: state.rpm,
    direction: state.direction,
    evidence: Array.isArray(row.evidence) ? row.evidence.map(String) : [],
  }));

  const merged = [...remoteHistory, ...state.history].slice(0, 50);
  state.history = merged;
  renderAllSections();
}

function syncAuthFormButtonState(): void {
  const submit = qs<HTMLButtonElement>('#authSubmit');
  const signOut = qs<HTMLButtonElement>('#authSignOut');
  if (submit) {
    submit.textContent = state.connection.mode === 'signed-in' ? 'Signed In' : 'Sign In';
  }
  if (signOut) {
    signOut.classList.toggle('is-hidden', state.connection.mode !== 'signed-in');
  }
}

async function signInWithEmail(): Promise<void> {
  const email = qs<HTMLInputElement>('#authEmail')?.value.trim() ?? '';
  const password = qs<HTMLInputElement>('#authPassword')?.value ?? '';
  if (!email || !password) {
    showToast('Masukkan email dan password untuk login Supabase.', 'warning');
    return;
  }

  const { error } = await signInWithPassword(email, password);
  if (error) {
    state.connection = {
      ...state.connection,
      mode: 'error',
      message: error,
    };
    renderAllSections();
    return;
  }

  refreshConnectionState();
}

async function signOut(): Promise<void> {
  await signOutSession();
  refreshConnectionState();
}

function updateBearingValues(): void {
  const model = qs<HTMLInputElement>('#bearingModel')?.value ?? '';
  const panel = qs<HTMLElement>('.bearing-panel');
  if (!panel) {
    return;
  }

  panel.outerHTML = renderBearingPanel(state.rpm, model);
}

function updateEquipmentDatasetFromSelector(): void {
  const key = getSelectedDatasetKey();
  if (equipmentDatasets[key]) {
    state.equipmentDatasetKey = key;
    persistAppState(state);
    syncEquipmentView();
  }
}

function updateEquipmentUnitFilter(value: string): void {
  state.equipmentUnitFilter = value;
  persistAppState(state);
  syncEquipmentView();
}

function updateEquipmentStatusFilter(value: string): void {
  state.equipmentStatusFilter = value as AppState['equipmentStatusFilter'];
  persistAppState(state);
  syncEquipmentView();
}

function updateEquipmentSearch(value: string): void {
  state.equipmentSearch = value;
  persistAppState(state);
  syncEquipmentView();
}

function updateAnalysisInputs(): void {
  const rpm = Number.parseInt(qs<HTMLInputElement>('#analysisRpm')?.value ?? `${state.analysisRpm}`, 10);
  const direction = (qs<HTMLSelectElement>('#analysisDir')?.value ?? state.analysisDirection) as FaultDirection;
  if (Number.isFinite(rpm)) {
    state.analysisRpm = rpm;
  }
  state.analysisDirection = direction;
  persistAppState(state);
}

function updateMachineContextFromInput(target: HTMLElement): void {
  const field = target.dataset.contextField as keyof MachineContext | undefined;
  if (!field) {
    return;
  }

  const value = (target as HTMLInputElement | HTMLSelectElement).value;
  const numericFields = new Set<keyof MachineContext>([
    'rpm',
    'detectedRpm',
    'masterRpm',
    'load',
    'bearingCount',
    'vaneCount',
    'gearTeeth',
    'criticality',
    'productionImpact',
    'safetyImpact',
  ]);
  state.machineContext = {
    ...state.machineContext,
    [field]: numericFields.has(field) ? Number(value) : value,
  } as MachineContext;

  if (field === 'driveType') {
    state.machineContext.couplingType = state.machineContext.driveType;
  }
  if (field === 'rpmSource') {
    state.machineContext.rpm = effectiveRpm(state.machineContext);
  }
  if (field === 'rpm' || field === 'rpmSource' || field === 'detectedRpm' || field === 'masterRpm') {
    state.rpm = effectiveRpm(state.machineContext);
    state.analysisRpm = state.rpm;
  }
  if (field === 'load') {
    state.load = Number(value) || state.load;
  }
  if (field === 'direction') {
    state.direction = mapMeasurementDirection(value);
    state.analysisDirection = state.direction;
  }

  persistAppState(state);
  syncSidebar();
  syncSimView();
}

function updateSimulationControl(target: HTMLElement): void {
  const field = target.dataset.simControl as 'simulationSpeed' | 'vibrationGain' | undefined;
  if (!field) {
    return;
  }

  if (field === 'simulationSpeed') {
    state.simulationSpeed = (target as HTMLSelectElement).value as SimulationSpeed;
  } else {
    state.vibrationGain = (target as HTMLSelectElement).value as VibrationGain;
  }
  persistAppState(state);
}

function mapMeasurementDirection(value: string): FaultDirection {
  if (value === 'axial') {
    return 'axial';
  }
  if (value === 'both') {
    return 'both';
  }
  return 'radial';
}

function syncPeakInputState(target: HTMLElement): void {
  const rowId = target.dataset.peakId;
  const field = target.dataset.peakField as keyof PeakInputRow | undefined;
  if (!rowId || !field) {
    return;
  }

  const input = target as HTMLInputElement;
  updatePeakRowField(rowId, field, input.value);
}

function syncUploadInputState(target: HTMLElement): void {
  const id = Number(target.dataset.uploadId);
  const field = target.dataset.uploadField as keyof UploadedAsset | undefined;
  if (!Number.isFinite(id) || !field) {
    return;
  }

  updateUploadAsset(id, field, (target as HTMLSelectElement).value);
}

function updateAiProviderSetting(target: HTMLElement): void {
  const field = target.dataset.aiProviderField as keyof AppState['aiProviderSettings'] | undefined;
  if (!field) {
    return;
  }

  const current = state.aiProviderSettings;
  const value = field === 'enabled'
    ? (target as HTMLInputElement).checked
    : (target as HTMLInputElement).value;
  state.aiProviderSettings = {
    ...current,
    [field]: value,
    status: field === 'enabled' && !value ? 'idle' : isAiProviderReady({ ...current, [field]: value }) ? 'ready' : 'idle',
    message: field === 'enabled' && !value
      ? 'AI assist disabled. Local extraction is active.'
      : 'Provider settings are stored locally in this browser.',
  };
  persistAppState(state);
  renderUploadPanel();
}

function syncSimButtons(): void {
  const faultButtons = qsa<HTMLButtonElement>('#faultGrid .fault-btn');
  faultButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.fault === state.faultKey);
  });

  const directionButtons = qsa<HTMLButtonElement>('#directionGrid .direction-btn');
  directionButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.direction === state.direction);
  });

  const currentLayout = state.machineContext.machineType === 'motor' && state.machineContext.drivenComponent === 'motor'
    ? 'motor'
    : state.machineContext.drivenComponent;
  const layoutButtons = qsa<HTMLButtonElement>('#machineLayoutGrid .layout-btn');
  layoutButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.layout === currentLayout);
  });
}

function bindEvents(root: HTMLElement): void {
  root.addEventListener('click', async (event) => {
    const target = event.target as HTMLElement | null;
    const actionTarget = target?.closest<HTMLElement>('[data-action]');
    if (!actionTarget) {
      return;
    }

    const action = actionTarget.dataset.action;
    switch (action) {
      case 'switch-tab': {
        const tab = actionTarget.dataset.tab as AppState['currentTab'] | undefined;
        if (tab) {
          state.currentTab = tab;
          persistAppState(state);
          syncTabVisibility();
          void ensureVisualControllers();
          window.requestAnimationFrame(() => {
            controllers?.three.resize();
            controllers?.charts.resize();
            if (tab === 'equipment') {
              syncEquipmentView();
            }
            if (tab === 'analysis') {
              renderAnalysisResultsPanel();
            }
          });
        }
        break;
      }
      case 'set-fault': {
        const fault = actionTarget.dataset.fault as FaultKey | undefined;
        if (fault) {
          state.faultKey = fault;
          persistAppState(state);
          syncSidebar();
          syncSimView();
          syncSimButtons();
          void ensureVisualControllers().then(() => {
            controllers?.three.resize();
            controllers?.charts.resize();
          });
        }
        break;
      }
      case 'set-direction': {
        const direction = actionTarget.dataset.direction as FaultDirection | undefined;
        if (direction) {
          state.direction = direction;
          state.machineContext = { ...state.machineContext, direction };
          persistAppState(state);
          syncSidebar();
          syncSimView();
          syncSimButtons();
        }
        break;
      }
      case 'set-machine-layout': {
        const layout = actionTarget.dataset.layout as MachineContext['machineType'] | undefined;
        if (layout) {
          const isMotorOnly = layout === 'motor';
          state.machineContext = {
            ...state.machineContext,
            machineType: layout,
            drivenComponent: layout,
            driveType: isMotorOnly ? 'direct' : state.machineContext.driveType,
            couplingType: isMotorOnly ? 'direct' : state.machineContext.couplingType,
            bearingPosition: isMotorOnly ? 'DE' : state.machineContext.bearingPosition,
          };
          persistAppState(state);
          syncSidebar();
          syncSimView();
          syncSimButtons();
          void ensureVisualControllers().then(() => {
            controllers?.three.resize();
            controllers?.three.resetCamera();
          });
        }
        break;
      }
      case 'reset-camera':
        void ensureVisualControllers().then(() => controllers?.three.resetCamera());
        break;
      case 'toggle-wireframe':
        state.wireframe = !state.wireframe;
        persistAppState(state);
        void ensureVisualControllers().then(() => controllers?.three.toggleWireframe());
        break;
      case 'toggle-ui-density': {
        state.uiDensity = state.uiDensity === 'normal' ? 'compact' : state.uiDensity === 'compact' ? 'large' : 'normal';
        persistAppState(state);
        renderAllSections();
        void ensureVisualControllers().then(() => {
          controllers?.three.resize();
          controllers?.charts.resize();
        });
        break;
      }
      case 'toggle-ui-text':
        state.uiTextCollapsed = !state.uiTextCollapsed;
        persistAppState(state);
        renderAllSections();
        break;
      case 'focus-equipment-sim':
        focusEquipmentToSimulation(actionTarget.dataset.eq);
        break;
      case 'toggle-sim-flag': {
        const flag = actionTarget.dataset.simFlag as 'showOrbit' | 'showSensors' | 'showVectors' | undefined;
        if (flag) {
          state[flag] = !state[flag];
          persistAppState(state);
          renderAllSections();
          void ensureVisualControllers().then(() => {
            controllers?.three.resize();
            controllers?.charts.resize();
          });
        }
        break;
      }
      case 'add-peak':
        addPeakRow();
        break;
      case 'remove-peak': {
        const peakId = actionTarget.dataset.peakId;
        if (peakId) {
          removePeakRow(peakId);
        }
        break;
      }
      case 'analyze-spectrum':
        analyzeSpectrum();
        break;
      case 'reset-analysis':
        resetAnalysisRows();
        break;
      case 'open-file-picker':
        pendingUploadPreset = actionTarget.dataset.uploadType
          ? {
              type: actionTarget.dataset.uploadType as UploadedAsset['type'],
              bearing: actionTarget.dataset.uploadBearing as UploadedAsset['bearing'],
              direction: actionTarget.dataset.uploadDirection as UploadedAsset['direction'],
            }
          : null;
        qs<HTMLInputElement>('#photoInput')?.click();
        break;
      case 'start-ai':
        void startAIAnalysis();
        break;
      case 'extract-upload': {
        const uploadId = Number(actionTarget.dataset.uploadId);
        if (Number.isFinite(uploadId)) {
          void extractUpload(uploadId);
        }
        break;
      }
      case 'extract-all':
        void extractAllUploads();
        break;
      case 'apply-extracted-peaks':
        applyExtractedPeaks();
        break;
      case 'reset-ai':
        resetUploads();
        renderUploadPanel();
        break;
      case 'apply-ai':
        applyAIResult();
        break;
      case 'generate-report':
        generateReport();
        break;
      case 'export-csv':
        exportCsv();
        break;
      case 'use-detected-rpm':
        if (state.machineContext.detectedRpm) {
          const detectedRpm = state.machineContext.detectedRpm;
          state.machineContext = { ...state.machineContext, rpmSource: 'detected', rpm: detectedRpm };
          state.rpm = detectedRpm;
          state.analysisRpm = state.rpm;
          persistAppState(state);
          renderAllSections();
        }
        break;
      case 'keep-manual-rpm':
        state.machineContext = { ...state.machineContext, rpmSource: 'manual' };
        persistAppState(state);
        renderAllSections();
        break;
      case 'remove-upload': {
        const uploadId = Number(actionTarget.dataset.uploadId);
        if (Number.isFinite(uploadId)) {
          removeUpload(uploadId);
        }
        break;
      }
      case 'update-upload':
        syncUploadInputState(actionTarget);
        break;
      case 'auth-signin':
        void signInWithEmail();
        break;
      case 'auth-signout':
        void signOut();
        break;
      default:
        break;
    }
  });

  root.addEventListener('input', (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    if (target.id === 'rpmSlider') {
      const value = Number.parseInt((target as HTMLInputElement).value, 10);
      if (Number.isFinite(value)) {
        state.rpm = value;
        state.machineContext = { ...state.machineContext, rpm: value };
        state.analysisRpm = value;
        persistAppState(state);
        syncSidebar();
        syncSimView();
      }
    } else if (target.id === 'loadSlider') {
      const value = Number.parseInt((target as HTMLInputElement).value, 10);
      if (Number.isFinite(value)) {
        state.load = value;
        state.machineContext = { ...state.machineContext, load: value };
        persistAppState(state);
        syncSidebar();
        syncSimView();
      }
    } else if (target.id === 'bearingModel') {
      state.machineContext = { ...state.machineContext, bearingModel: (target as HTMLInputElement).value };
      persistAppState(state);
      updateBearingValues();
    } else if (target.id === 'eqSearch') {
      updateEquipmentSearch((target as HTMLInputElement).value);
    } else if (target.id === 'authEmail' || target.id === 'authPassword') {
      // Form fields are kept as-is; no state sync needed.
    } else if (target.dataset.contextField) {
      updateMachineContextFromInput(target);
    } else if (target.dataset.extractionField) {
      updateExtractionCalibration(target);
    } else if (target.dataset.extractedPeakField) {
      updateExtractedPeak(target);
    } else if (target.dataset.peakId) {
      syncPeakInputState(target);
    } else if (target.dataset.uploadId) {
      syncUploadInputState(target);
    } else if (target.id === 'analysisRpm') {
      const value = Number.parseInt((target as HTMLInputElement).value, 10);
      if (Number.isFinite(value)) {
        state.analysisRpm = value;
        persistAppState(state);
      }
    }
  });

  root.addEventListener('change', (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    if (target.dataset.simControl) {
      updateSimulationControl(target);
    } else if (target.dataset.aiProviderField) {
      updateAiProviderSetting(target);
    } else if (target.dataset.extractionField) {
      updateExtractionCalibration(target);
    } else if (target.dataset.extractedPeakField) {
      updateExtractedPeak(target);
    } else if (target.dataset.contextField) {
      updateMachineContextFromInput(target);
    } else if (target.id === 'analysisDir') {
      updateAnalysisInputs();
    } else if (target.id === 'eqUnitFilter') {
      updateEquipmentUnitFilter((target as HTMLSelectElement).value);
    } else if (target.id === 'eqStatusFilter') {
      updateEquipmentStatusFilter((target as HTMLSelectElement).value);
    } else if (target.id === 'eqDateDay' || target.id === 'eqDateMonth' || target.id === 'eqDateYear') {
      updateEquipmentDatasetFromSelector();
    } else if (target.id === 'photoInput') {
      const input = target as HTMLInputElement;
      addUploads(input.files);
      input.value = '';
    }
  });

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((eventName) => {
    root.addEventListener(eventName, (event) => {
      const target = event.target as HTMLElement | null;
      const uploadZone = target?.closest<HTMLElement>('#uploadZone');
      if (!uploadZone) {
        return;
      }

      event.preventDefault();
      if (eventName === 'dragenter' || eventName === 'dragover') {
        uploadZone.classList.add('dragover');
      } else {
        uploadZone.classList.remove('dragover');
      }

      if (eventName === 'drop') {
        const dropEvent = event as DragEvent;
        addUploads(dropEvent.dataTransfer?.files ?? null);
      }
    });
  });
}

function mountApp(root: HTMLElement): void {
  root.innerHTML = renderShell(state);
  bindEvents(root);
  populateEquipmentSelectors();
  renderPeakList();
  renderAnalysisResultsPanel();
  renderReferencePanel();
  syncSidebar();
  syncSimView();
  syncEquipmentView();
  syncTabVisibility();
  syncSimButtons();

  renderAnalysisPanel();
  renderUploadPanel();
  renderEquipmentPanel();
  renderReferencePanel();

  if (state.connection.mode === 'connected' || state.connection.mode === 'signed-out' || state.connection.mode === 'signed-in') {
    refreshConnectionState();
  }

  void ensureVisualControllers();
}

export function bootstrapApp(): void {
  const root = document.getElementById('app');
  if (!root) {
    throw new Error('App root not found');
  }

  mountApp(root);
  if (!authBootstrapped) {
    authBootstrapped = true;
    refreshConnectionState();
  }
}
