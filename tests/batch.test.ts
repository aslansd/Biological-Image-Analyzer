import test from 'node:test';
import assert from 'node:assert/strict';
import { Detection } from '../src/types';
import { summarize, describe as describeStats } from '../src/utils/summary';
import { BatchItem, buildPerImageCsv, buildPooledCsv, micronsPerPixelForItem, toCaptureCalibration } from '../src/utils/batch';
import { buildReportHtml } from '../src/utils/report';

const detection = (id: string, areaPx: number, areaUm2: number | undefined, circ: number): Detection => ({
  id,
  type: 'cell',
  shape: 'polygon',
  points: [
    [0, 0],
    [10, 0],
    [10, 10],
  ],
  confidence: 0.9,
  label: `cell ${id}`,
  attributes: { status: 'healthy' },
  explanation: '',
  measured: {
    areaPx,
    perimeterPx: 40,
    circularity: circ,
    equivalentDiameterPx: 10,
    maxFeretPx: 14,
    areaMicrons2: areaUm2,
    perimeterMicrons: areaUm2 === undefined ? undefined : 20,
    meanIntensity: 120,
    medianIntensity: 118,
    minIntensity: 10,
    maxIntensity: 240,
    stdDev: 30,
    integratedDensity: areaPx * 120,
    channels: { r: 100, g: 130, b: 90 },
    pixelCount: areaPx,
  },
});

test('summarize averages measured values and computes real density', () => {
  const detections = [detection('a', 100, 25, 0.8), detection('b', 300, 75, 0.6)];
  // 1000x500 px at 0.5 um/px = 500x250 um = 0.5mm x 0.25mm = 0.125 mm^2
  const s = summarize(detections, 0.5, 1000, 500);

  assert.equal(s.count, 2);
  assert.equal(s.avgSize, 50); // (25 + 75) / 2
  assert.equal(s.sizeUnit, 'µm²');
  assert.equal(s.avgCircularity, 0.7);
  assert.equal(s.totalArea, 100);
  assert.equal(s.density, 16); // 2 objects / 0.125 mm^2
  assert.equal(s.measured, true);
});

test('summarize falls back to pixel units when uncalibrated', () => {
  const s = summarize([detection('a', 100, undefined, 0.8)], null, 1000, 1000);
  assert.equal(s.avgSize, 100);
  assert.equal(s.sizeUnit, 'px²');
  assert.equal(s.density, 1); // 1 object per megapixel
});

test('summarize handles an empty set without dividing by zero', () => {
  const s = summarize([], 0.5, 100, 100);
  assert.equal(s.count, 0);
  assert.equal(s.avgSize, 0);
  assert.equal(s.density, 0);
  assert.equal(s.measured, false);
});

test('describe reports quartiles and spread', () => {
  const d = describeStats([1, 2, 3, 4, 5])!;
  assert.equal(d.n, 5);
  assert.equal(d.mean, 3);
  assert.equal(d.median, 3);
  assert.equal(d.min, 1);
  assert.equal(d.max, 5);
  assert.equal(d.q1, 2);
  assert.equal(d.q3, 4);
  assert.equal(describeStats([]), null);
});

const item = (overrides: Partial<BatchItem> = {}): BatchItem => ({
  id: 'i1',
  fileName: 'field_01.jpg',
  dataUrl: 'data:image/jpeg;base64,AA',
  mimeType: 'image/jpeg',
  width: 1600,
  height: 1200,
  downscaleFactor: 2.5,
  status: 'done',
  detections: [detection('a', 100, 25, 0.8)],
  summary: summarize([detection('a', 100, 25, 0.8)], 0.5, 1600, 1200),
  isSimulated: false,
  ...overrides,
});

test('batch calibration converts between capture and decoded resolution', () => {
  // 0.16 um/px at capture; an image downsampled 2.5x has 0.4 um per decoded px.
  const captureCal = { micronsPerPixel: 0.16, source: 'user' as const };
  assert.equal(micronsPerPixelForItem(captureCal, item()), 0.4);

  // A field-width calibration is resolution independent.
  assert.equal(micronsPerPixelForItem({ fieldWidthMicrons: 3200, source: 'user' }, item()), 2);

  assert.equal(micronsPerPixelForItem({ source: 'none' }, item()), null);
});

test('toCaptureCalibration reverses the workspace downscaling', () => {
  const workspace = { micronsPerPixel: 0.4, source: 'user' as const };
  assert.equal(toCaptureCalibration(workspace, 2.5).micronsPerPixel, 0.16);
  // Field-width calibrations pass through untouched.
  const field = { fieldWidthMicrons: 90000, source: 'declared' as const };
  assert.deepEqual(toCaptureCalibration(field, 2.5), field);
});

test('pooled CSV has one row per object and escapes quotes', () => {
  const items = [item(), item({ id: 'i2', fileName: 'we"ird.jpg' })];
  const csv = buildPooledCsv(items, '1 px = 0.4 µm');
  const lines = csv.trim().split('\n');
  const dataLines = lines.filter((l) => !l.startsWith('#') && !l.startsWith('source_image'));

  assert.equal(dataLines.length, 2);
  assert.ok(csv.includes('"we""ird.jpg"'));
  assert.ok(csv.includes('# calibration: 1 px = 0.4 µm'));
});

test('pooled CSV skips items that did not complete', () => {
  const csv = buildPooledCsv([item({ status: 'error', error: 'boom' })], 'x');
  const dataLines = csv.trim().split('\n').filter((l) => !l.startsWith('#') && !l.startsWith('source_image'));
  assert.equal(dataLines.length, 0);
});

test('per-image CSV has one row per image including failures', () => {
  const csv = buildPerImageCsv([item(), item({ id: 'i2', status: 'error' })], 'x');
  const dataLines = csv.trim().split('\n').filter((l) => !l.startsWith('#') && !l.startsWith('image,'));
  assert.equal(dataLines.length, 2);
  assert.ok(dataLines[1].includes('"error"'));
});

test('report renders and escapes untrusted filenames', () => {
  const html = buildReportHtml({
    title: 'Report',
    items: [item({ fileName: '<script>alert(1)</script>.jpg' })],
    thumbnails: {},
    calibration: { micronsPerPixel: 0.16, source: 'user' },
    category: 'cells',
    model: 'UNET',
  });

  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  // Pooled stats table should carry the object we supplied.
  assert.ok(html.includes('Pooled measurements'));
  assert.ok(html.includes('Objects measured'));
});
