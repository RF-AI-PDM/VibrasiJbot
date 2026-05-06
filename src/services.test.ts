import { describe, it, expect } from 'vitest';
import {
  buildAiProcessingSteps,
  buildReportInsightsFromRows,
  buildReportPayloadFromRows,
  buildWorkbookRowsFromUploads,
  calcBearingFrequencies,
  clamp,
  defaultAiProviderSettings,
  defaultMachineContext,
  detectRpmFromPeaks,
  effectiveRpm,
  isAiProviderReady,
  guessBearing,
  guessDataType,
  guessDirection,
  mergeAiVisionResultWithUploads,
  normalizeBearingModel,
  normalizeMachineContext,
  nonImagePreview,
  parsePeakInputRows,
  runAiUploadAnalysis,
  validateUploadFile,
} from './services';

describe('services.ts - Core Logic', () => {
  it('clamp should correctly restrict values within min and max', () => {
    expect(clamp(5, 0, 10)).toBe(5); // within range
    expect(clamp(-5, 0, 10)).toBe(0); // below min
    expect(clamp(15, 0, 10)).toBe(10); // above max
  });

  it('normalizeBearingModel should clean strings properly', () => {
    expect(normalizeBearingModel(' SKF 6205 ')).toBe('6205');
    expect(normalizeBearingModel('FAG6305')).toBe('6305');
    expect(normalizeBearingModel(' 6205-2RS ')).toBe('6205-2RS');
    expect(normalizeBearingModel('NSK 6206')).toBe('6206');
    expect(normalizeBearingModel('ntn 6308')).toBe('6308');
  });

  it('effectiveRpm should prioritize detected or master rpm based on source', () => {
    const ctx = defaultMachineContext();
    ctx.rpm = 1500;

    // fallback to default rpm
    ctx.rpmSource = 'manual';
    expect(effectiveRpm(ctx)).toBe(1500);

    // use detected rpm
    ctx.rpmSource = 'detected';
    ctx.detectedRpm = 1495;
    expect(effectiveRpm(ctx)).toBe(1495);

    // use master rpm
    ctx.rpmSource = 'master';
    ctx.masterRpm = 1490;
    expect(effectiveRpm(ctx)).toBe(1490);
  });

  it('calcBearingFrequencies should return valid fallback frequencies when bearing not in DB', () => {
    const result = calcBearingFrequencies('UNKNOWN6205', 1500);

    // 1500 RPM = 25 Hz
    expect(result.exact).toBe(false);
    expect(result.values.bpfo).toBeCloseTo(3.57 * 25, 2);
    expect(result.values.bpfi).toBeCloseTo(5.43 * 25, 2);
    expect(result.values.ftf).toBeCloseTo(0.4 * 25, 2);
    expect(result.values.bsf).toBeCloseTo(2.39 * 25, 2);
  });

  it('detectRpmFromPeaks should choose the dominant valid peak in running-speed range', () => {
    const rpm = detectRpmFromPeaks(
      [
        { freq: 12, amp: 0.4 },
        { freq: 24.8, amp: 2.6 },
        { freq: 96, amp: 5.1 },
      ],
      1500,
    );

    expect(rpm).toBe(Math.round(24.8 * 60));
  });

  it('normalizeMachineContext should clamp numeric values and sanitize enums', () => {
    const context = normalizeMachineContext({
      rpm: 99999,
      load: -10,
      bearingCount: 99,
      vaneCount: 1,
      gearTeeth: 999,
      machineType: 'invalid' as never,
      direction: 'invalid' as never,
    });

    expect(context.rpm).toBe(6000);
    expect(context.load).toBe(0);
    expect(context.bearingCount).toBe(8);
    expect(context.vaneCount).toBe(2);
    expect(context.gearTeeth).toBe(300);
    expect(context.machineType).toBe(defaultMachineContext().machineType);
    expect(context.direction).toBe(defaultMachineContext().direction);
  });

  it('upload helper functions should infer metadata consistently', () => {
    expect(guessDataType('pump_wave.csv')).toBe('Waveform');
    expect(guessDataType('bearing_env_capture.png')).toBe('Envelope');
    expect(guessDirection('motor_axial_photo.jpg')).toBe('axial');
    expect(guessDirection('fan_h_spectrum.png')).toBe('horizontal');
    expect(guessBearing('pump_nde_waveform.png')).toBe('2');
    expect(guessBearing('bearing-4-spectrum.jpg')).toBe('4');
    expect(nonImagePreview('trend data.csv')).toContain('DATA FILE');
  });

  it('validateUploadFile should reject unsupported or oversized files', () => {
    const validImage = new File(['ok'], 'spectrum.png', { type: 'image/png' });
    const invalidFile = new File(['bad'], 'malware.exe', { type: 'application/x-msdownload' });
    const bigText = new File(['x'.repeat(2 * 1024 * 1024 + 1)], 'data.csv', { type: 'text/csv' });

    expect(validateUploadFile(validImage)).toBeNull();
    expect(validateUploadFile(invalidFile)).toContain('Format file harus');
    expect(validateUploadFile(bigText)).toContain('maksimal 2 MB');
  });

  it('parsePeakInputRows should parse valid rows and discard invalid values', () => {
    const rows = parsePeakInputRows([
      { id: '1', order: '1X', freq: '24.5', amp: '2.2' },
      { id: '2', order: '2X', freq: 'invalid', amp: '0.7' },
      { id: '3', order: '3X', freq: '73.5', amp: '0.3' },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ order: '1X', freq: 24.5, amp: 2.2 });
    expect(rows[1]).toEqual({ order: '3X', freq: 73.5, amp: 0.3 });
  });

  it('report helper builders should produce consistent payload and workbook rows', () => {
    const context = defaultMachineContext();
    const rows = [
      { id: '1', order: '1X', freq: '24.5', amp: '2.2' },
      { id: '2', order: '2X', freq: '49.0', amp: '0.7' },
    ];
    const uploads = [
      {
        id: 1,
        name: 'spec-b1.png',
        src: 'data:image/png;base64,xx',
        type: 'Spectrum' as const,
        bearing: '1' as const,
        direction: 'radial' as const,
        extractedPeaks: [{ id: 'p1', frequency: 24.5, amplitude: 2.2, confidence: 90 }],
      },
    ];

    const insights = buildReportInsightsFromRows(rows, context);
    const payload = buildReportPayloadFromRows(rows, context, null, uploads);
    const workbook = buildWorkbookRowsFromUploads(rows, context, uploads);

    expect(insights.markers.length).toBeGreaterThan(0);
    expect(insights.peaks.length).toBeGreaterThan(0);
    expect(payload.context.equipmentCode).toBe(context.equipmentCode);
    expect(payload.uploads).toHaveLength(1);
    expect(workbook.peakRows.length).toBeGreaterThan(0);
    expect(workbook.markerRows.length).toBeGreaterThan(0);
    expect(workbook.uploadRows).toHaveLength(1);
  });

  it('AI helper builders should produce steps and analysis output', () => {
    const context = defaultMachineContext();
    const uploads = [
      {
        id: 1,
        name: 'motor_axial_bearing1_spectrum.png',
        src: 'data:image/png;base64,xx',
        type: 'Spectrum' as const,
        bearing: '1' as const,
        direction: 'axial' as const,
        extractionStatus: 'extracted' as const,
        extractionConfidence: 86,
        extractedPeaks: [{ id: 'p1', frequency: 24.5, amplitude: 2.1, confidence: 90 }],
      },
    ];
    const steps = buildAiProcessingSteps(uploads.length);
    const aiResult = runAiUploadAnalysis(uploads, context.rpm, context);

    expect(steps[0]).toContain('Loading 1 image data');
    expect(steps.length).toBeGreaterThanOrEqual(5);
    expect(aiResult.analysisRows.length).toBeGreaterThan(0);
    expect(aiResult.analysisPeaks.length).toBeGreaterThan(0);
    expect(aiResult.extractedResults.length).toBeGreaterThan(0);
    expect(aiResult.finalResult.recommendedPeaks.length).toBe(aiResult.analysisRows.length);
  });

  it('AI provider settings should stay disabled until endpoint and key are configured', () => {
    const defaults = defaultAiProviderSettings();

    expect(defaults.enabled).toBe(false);
    expect(isAiProviderReady(defaults)).toBe(false);
    expect(isAiProviderReady({ ...defaults, enabled: true, endpoint: 'https://example.com/vision' })).toBe(false);
    expect(isAiProviderReady({ ...defaults, enabled: true, apiKey: 'demo-key' })).toBe(false);
    expect(isAiProviderReady({ ...defaults, enabled: true, endpoint: 'https://example.com/vision', apiKey: 'demo-key' })).toBe(true);
  });

  it('mergeAiVisionResultWithUploads should keep local extraction when AI is unavailable', () => {
    const uploads = [
      {
        id: 1,
        name: 'pump-spectrum.png',
        src: 'data:image/png;base64,xx',
        type: 'Spectrum' as const,
        bearing: '1' as const,
        direction: 'horizontal' as const,
        extractionStatus: 'extracted' as const,
        extractionConfidence: 82,
        extractedPeaks: [{ id: 'local-1', label: 'P1', frequency: 24.5, amplitude: 2.2, confidence: 82 }],
      },
    ];

    const merged = mergeAiVisionResultWithUploads(uploads, null);

    expect(merged.uploads[0].extractionSource).toBe('local');
    expect(merged.confidencePenalty).toBe(0);
    expect(merged.evidence[0].value).toContain('Local extraction');
  });

  it('mergeAiVisionResultWithUploads should prefer close AI peaks and mark source as AI assisted', () => {
    const uploads = [
      {
        id: 1,
        name: 'pump-spectrum.png',
        src: 'data:image/png;base64,xx',
        type: 'Spectrum' as const,
        bearing: '1' as const,
        direction: 'horizontal' as const,
        extractionStatus: 'extracted' as const,
        extractionConfidence: 78,
        extractedPeaks: [{ id: 'local-1', label: 'P1', frequency: 24.5, amplitude: 2.2, confidence: 78 }],
      },
    ];

    const merged = mergeAiVisionResultWithUploads(uploads, {
      provider: 'demo',
      model: 'vision-test',
      confidence: 88,
      assets: [
        {
          uploadId: 1,
          peaks: [{ label: '1X', frequency: 24.7, amplitude: 2.3, confidence: 91 }],
          evidence: ['Axis label and 1X marker detected'],
        },
      ],
      evidence: ['Spectrum grid detected'],
    });

    expect(merged.uploads[0].extractionSource).toBe('ai-assisted');
    expect(merged.uploads[0].extractedPeaks?.[0]).toMatchObject({ label: '1X', frequency: 24.7, amplitude: 2.3 });
    expect(merged.uploads[0].aiEvidence?.[0].description).toContain('Axis label');
    expect(merged.confidencePenalty).toBe(0);
  });

  it('mergeAiVisionResultWithUploads should penalize large local and AI disagreement', () => {
    const uploads = [
      {
        id: 1,
        name: 'pump-spectrum.png',
        src: 'data:image/png;base64,xx',
        type: 'Spectrum' as const,
        bearing: '1' as const,
        direction: 'horizontal' as const,
        extractionStatus: 'extracted' as const,
        extractionConfidence: 78,
        extractedPeaks: [{ id: 'local-1', label: 'P1', frequency: 24.5, amplitude: 2.2, confidence: 78 }],
      },
    ];

    const merged = mergeAiVisionResultWithUploads(uploads, {
      provider: 'demo',
      model: 'vision-test',
      confidence: 84,
      assets: [
        {
          uploadId: 1,
          peaks: [{ label: '2X', frequency: 49, amplitude: 2.4, confidence: 89 }],
          evidence: ['AI found a different dominant marker'],
        },
      ],
      evidence: [],
    });

    expect(merged.confidencePenalty).toBeGreaterThan(0);
    expect(merged.evidence.some((item) => item.match === false)).toBe(true);
  });

  it('report payload should include AI source metadata without leaking provider secrets', () => {
    const context = defaultMachineContext();
    const payload = buildReportPayloadFromRows(
      [{ id: '1', order: '1X', freq: '24.5', amp: '2.2' }],
      context,
      null,
      [
        {
          id: 1,
          name: 'spec-b1.png',
          src: 'data:image/png;base64,xx',
          type: 'Spectrum',
          bearing: '1',
          direction: 'radial',
          extractionSource: 'ai-assisted',
          aiEvidence: [{ source: 'vision-test', description: 'Axis labels detected', confidence: 88 }],
          extractedPeaks: [{ id: 'p1', frequency: 24.5, amplitude: 2.2, confidence: 90 }],
        },
      ],
    );

    expect(payload.uploads[0]).toMatchObject({
      name: 'spec-b1.png',
      extractionSource: 'ai-assisted',
      aiEvidence: [{ source: 'vision-test', description: 'Axis labels detected', confidence: 88 }],
    });
    expect(JSON.stringify(payload)).not.toContain('apiKey');
    expect(JSON.stringify(payload)).not.toContain('demo-key');
  });
});
