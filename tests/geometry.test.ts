import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rectCorners,
  rectFromCorner,
  projectOntoSegment,
  boundingBox,
  polygonAreaNormalized,
  polylineLengthNormalized,
  circularity,
  asBoundingBoxDetection,
} from '../src/utils/geometry';
import { Detection } from '../src/types';

const box: [number, number][] = [
  [10, 20],
  [40, 60],
];

test('rectCorners returns TL/TR/BR/BL', () => {
  assert.deepEqual(rectCorners(box), [
    [10, 20],
    [40, 20],
    [40, 60],
    [10, 60],
  ]);
});

test('dragging a corner rebuilds the box from the opposite corner', () => {
  assert.deepEqual(rectFromCorner(box, 0, [5, 5]), [
    [5, 5],
    [40, 60],
  ]);
  assert.deepEqual(rectFromCorner(box, 2, [100, 100]), [
    [10, 20],
    [100, 100],
  ]);
  assert.deepEqual(rectFromCorner(box, 1, [70, 0]), [
    [10, 0],
    [70, 60],
  ]);
});

test('dragging a corner past the opposite one flips rather than inverting', () => {
  // A negative width/height makes SVG drop the element silently, so the box
  // must always come back normalized.
  assert.deepEqual(rectFromCorner(box, 0, [90, 90]), [
    [40, 60],
    [90, 90],
  ]);
});

test('projectOntoSegment clamps to the segment', () => {
  assert.deepEqual(projectOntoSegment([5, 0], [0, 0], [10, 0]), { distance: 0, point: [5, 0] });
  assert.deepEqual(projectOntoSegment([5, 3], [0, 0], [10, 0]), { distance: 3, point: [5, 0] });
  assert.deepEqual(projectOntoSegment([-5, 0], [0, 0], [10, 0]), { distance: 5, point: [0, 0] });
});

test('boundingBox spans all vertices', () => {
  assert.deepEqual(
    boundingBox([
      [3, 9],
      [20, 2],
      [11, 40],
    ]),
    [
      [3, 2],
      [20, 40],
    ]
  );
});

test('polygon area and circularity', () => {
  const square: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];
  assert.equal(polygonAreaNormalized(square), 100);
  assert.equal(Number(circularity(100, 40).toFixed(3)), 0.785);
});

test('polyline length sums segments without closing the path', () => {
  assert.equal(
    polylineLengthNormalized([
      [0, 0],
      [3, 4],
      [3, 14],
    ]),
    15
  );
});

test('asBoundingBoxDetection converts a polygon to its true extent', () => {
  const polygon: Detection = {
    id: 'p1',
    type: 'cell',
    shape: 'polygon',
    points: [
      [15, 20],
      [28, 12],
      [42, 18],
      [48, 35],
      [22, 48],
    ],
    confidence: 0.9,
    label: 'cell',
    attributes: {},
    explanation: '',
  };

  const rect = asBoundingBoxDetection(polygon);
  assert.equal(rect.shape, 'rect');
  // The old code kept the original vertex list, so the box was drawn between
  // points[0] and points[1] -- a sliver, not the object.
  assert.deepEqual(rect.points, [
    [15, 12],
    [48, 48],
  ]);
});
