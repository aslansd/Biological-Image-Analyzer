import test from 'node:test';
import assert from 'node:assert/strict';
import { measureDetection, computeImageHistogram, otsuThreshold, LoadedImage } from '../src/utils/measure';
import { Detection } from '../src/types';
import { resolveMicronsPerPixel, calibrationFromScaleBar, formatArea } from '../src/utils/calibration';

/** 100x100 frame: black, with a 40x40 white square at (30,30)-(69,69). */
function syntheticFrame(): LoadedImage {
  const width = 100;
  const height = 100;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const value = x >= 30 && x < 70 && y >= 30 && y < 70 ? 255 : 0;
      pixels[i] = value;
      pixels[i + 1] = value;
      pixels[i + 2] = value;
      pixels[i + 3] = 255;
    }
  }
  return { width, height, pixels };
}

const roi = (points: [number, number][], shape: Detection['shape'] = 'rect'): Detection => ({
  id: 'roi',
  type: 'cell',
  shape,
  points,
  confidence: 1,
  label: 'roi',
  attributes: {},
  explanation: '',
});

test('rectangular ROI morphometry is exact', () => {
  const m = measureDetection(
    roi([
      [30, 30],
      [70, 70],
    ]),
    syntheticFrame(),
    0.5
  )!;

  assert.equal(m.areaPx, 1600);
  assert.equal(m.perimeterPx, 160);
  assert.equal(m.circularity, 0.785); // 4*pi*A/P^2 for a square
  assert.equal(m.equivalentDiameterPx, 45.1);
  assert.equal(m.areaMicrons2, 400); // 1600 px^2 at 0.5 um/px
});

test('densitometry samples only the enclosed pixels', () => {
  const frame = syntheticFrame();

  const inside = measureDetection(
    roi([
      [30, 30],
      [70, 70],
    ]),
    frame,
    null
  )!;
  assert.equal(inside.meanIntensity, 255);
  assert.equal(inside.medianIntensity, 255);
  assert.equal(inside.stdDev, 0);
  assert.equal(inside.pixelCount, 1600);
  assert.equal(inside.integratedDensity, 1600 * 255);

  const outside = measureDetection(
    roi([
      [0, 0],
      [20, 20],
    ]),
    frame,
    null
  )!;
  assert.equal(outside.meanIntensity, 0);
  assert.equal(outside.maxIntensity, 0);
});

test('polygon area uses the shoelace formula in pixel space', () => {
  const triangle = measureDetection(
    roi(
      [
        [0, 0],
        [100, 0],
        [0, 100],
      ],
      'polygon'
    ),
    syntheticFrame(),
    null
  )!;
  assert.equal(triangle.areaPx, 5000);
});

test('area is measured in pixel space, not normalized space', () => {
  // A non-square frame: the same normalized ROI must not report the same area
  // as it would on a square one. Normalized-space shoelace would.
  const wide: LoadedImage = {
    width: 200,
    height: 100,
    pixels: new Uint8ClampedArray(200 * 100 * 4),
  };
  const m = measureDetection(
    roi([
      [0, 0],
      [50, 50],
    ]),
    wide,
    null
  )!;
  assert.equal(m.areaPx, 100 * 50); // half the width, half the height
});

test('line ROIs report traced length', () => {
  const line = measureDetection(
    roi(
      [
        [0, 0],
        [30, 40],
      ],
      'line'
    ),
    syntheticFrame(),
    2
  )!;
  assert.equal(line.lengthPx, 50); // 3-4-5 triangle scaled to a 100x100 frame
  assert.equal(line.lengthMicrons, 100);
});

test('histogram counts every sampled pixel', () => {
  const hist = computeImageHistogram(syntheticFrame(), 64, 1);
  assert.equal(
    hist.reduce((sum, bin) => sum + bin.count, 0),
    10000
  );
  assert.equal(hist[hist.length - 1].count, 1600);
  const threshold = otsuThreshold(hist);
  assert.ok(threshold >= 0 && threshold <= 255);
});

test('calibration resolves from either a per-pixel value or a field width', () => {
  assert.equal(resolveMicronsPerPixel({ micronsPerPixel: 0.25, source: 'user' }, 1200), 0.25);
  assert.equal(resolveMicronsPerPixel({ fieldWidthMicrons: 90000, source: 'declared' }, 1200), 75);
  assert.equal(resolveMicronsPerPixel({ source: 'none' }, 1200), null);
});

test('scale bar calibration converts units', () => {
  assert.equal(calibrationFromScaleBar(200, 100, 'µm')!.micronsPerPixel, 0.5);
  assert.equal(calibrationFromScaleBar(100, 1, 'mm')!.micronsPerPixel, 10);
  assert.equal(calibrationFromScaleBar(0, 100, 'µm'), null);
});

test('area formatting picks a sensible unit', () => {
  assert.deepEqual(formatArea(undefined, 1600), { value: '1,600', unit: 'px²' });
  assert.deepEqual(formatArea(284.5, 1600), { value: '284.5', unit: 'µm²' });
  assert.equal(formatArea(3_100_000, 1).unit, 'mm²');
});
