import { Detection } from '../types';
import { BatchItem, micronsPerPixelForItem } from './batch';
import { Calibration, describeCalibration } from './calibration';
import { describe } from './summary';

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Renders each detection as an SVG path over a 100x100 viewBox, so the overlay
 * scales with whatever size the thumbnail ends up at in print.
 */
function overlaySvg(detections: Detection[]): string {
  const shapes = detections
    .map((det) => {
      const color = escapeHtml(det.color || '#10b981');
      if (det.shape === 'rect' && det.points.length >= 2) {
        const x = Math.min(det.points[0][0], det.points[1][0]);
        const y = Math.min(det.points[0][1], det.points[1][1]);
        const w = Math.abs(det.points[1][0] - det.points[0][0]);
        const h = Math.abs(det.points[1][1] - det.points[0][1]);
        return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}18" stroke="${color}" stroke-width="0.4"/>`;
      }
      const points = det.points.map((p) => `${p[0]},${p[1]}`).join(' ');
      if (det.shape === 'line') {
        return `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="0.6"/>`;
      }
      return `<polygon points="${points}" fill="${color}18" stroke="${color}" stroke-width="0.4"/>`;
    })
    .join('');

  return `<svg viewBox="0 0 100 100" preserveAspectRatio="none" class="overlay">${shapes}</svg>`;
}

/** Downscales an image data URL to a print-friendly width. */
export function makeThumbnail(dataUrl: string, maxWidth = 700): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onerror = () => resolve(dataUrl);
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.naturalWidth);
      if (scale === 1) {
        resolve(dataUrl);
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.src = dataUrl;
  });
}

export interface ReportOptions {
  title: string;
  items: BatchItem[];
  thumbnails: Record<string, string>;
  calibration: Calibration;
  category: string;
  model: string;
}

/**
 * Builds a single self-contained HTML file. No PDF library: the page carries
 * print styles, so the browser's own "Save as PDF" produces the deliverable.
 * That keeps the bundle small and the output editable.
 */
export function buildReportHtml({
  title,
  items,
  thumbnails,
  calibration,
  category,
  model,
}: ReportOptions): string {
  const completed = items.filter((item) => item.status === 'done');

  const allAreas: number[] = [];
  const allCircularities: number[] = [];
  const allIntensities: number[] = [];
  let areaUnit = 'px²';

  for (const item of completed) {
    if (item.summary?.sizeUnit) areaUnit = item.summary.sizeUnit;
    for (const det of item.detections) {
      if (!det.measured) continue;
      allAreas.push(det.measured.areaMicrons2 ?? det.measured.areaPx);
      allCircularities.push(det.measured.circularity);
      allIntensities.push(det.measured.meanIntensity);
    }
  }

  const areaStats = describe(allAreas);
  const circStats = describe(allCircularities);
  const intensityStats = describe(allIntensities);

  const statsRow = (label: string, unit: string, d: ReturnType<typeof describe>) =>
    d
      ? `<tr><td>${escapeHtml(label)}</td><td>${d.n}</td><td>${d.mean}</td><td>${d.sd}</td><td>${d.median}</td><td>${d.q1} – ${d.q3}</td><td>${d.min} – ${d.max}</td><td>${escapeHtml(unit)}</td></tr>`
      : '';

  const perImageRows = items
    .map(
      (item) => `<tr>
        <td>${escapeHtml(item.fileName)}</td>
        <td class="${item.status === 'done' ? 'ok' : item.status === 'error' ? 'bad' : ''}">${escapeHtml(item.status)}</td>
        <td>${item.width || '—'}×${item.height || '—'}</td>
        <td>${item.summary?.count ?? '—'}</td>
        <td>${item.summary?.avgSize ?? '—'} ${escapeHtml(item.summary?.sizeUnit ?? '')}</td>
        <td>${item.summary?.avgCircularity ?? '—'}</td>
        <td>${item.summary?.density ?? '—'}</td>
        <td>${item.isSimulated ? 'simulation' : 'model'}</td>
      </tr>`
    )
    .join('');

  const plates = completed
    .map((item) => {
      const micronsPerPixel = micronsPerPixelForItem(calibration, item);
      const objectRows = item.detections
        .slice(0, 40)
        .map((det) => {
          const m = det.measured;
          return `<tr>
            <td>${escapeHtml(det.label)}</td>
            <td>${Math.round(det.confidence * 100)}%</td>
            <td>${m ? (m.areaMicrons2 ?? m.areaPx) : '—'}</td>
            <td>${m?.circularity ?? '—'}</td>
            <td>${m?.meanIntensity ?? '—'}</td>
            <td>${m?.integratedDensity?.toLocaleString() ?? '—'}</td>
            <td>${escapeHtml(det.attributes.status ?? '')}</td>
          </tr>`;
        })
        .join('');

      const truncated =
        item.detections.length > 40
          ? `<p class="muted">Showing the first 40 of ${item.detections.length} objects. The CSV export contains all of them.</p>`
          : '';

      return `<section class="plate">
        <h3>${escapeHtml(item.fileName)}</h3>
        <div class="figure">
          <img src="${escapeHtml(thumbnails[item.id] || item.dataUrl)}" alt="">
          ${overlaySvg(item.detections)}
        </div>
        <p class="muted">
          ${item.width}×${item.height} px ·
          ${micronsPerPixel ? `1 px = ${micronsPerPixel.toPrecision(3)} µm` : 'uncalibrated'} ·
          ${item.summary?.count ?? 0} objects ·
          detections from ${item.isSimulated ? 'local simulation' : 'the vision model'}
        </p>
        <table>
          <thead><tr><th>Object</th><th>Conf.</th><th>Area (${escapeHtml(item.summary?.sizeUnit ?? '')})</th><th>Circ.</th><th>Mean grey</th><th>IntDen</th><th>Status</th></tr></thead>
          <tbody>${objectRows}</tbody>
        </table>
        ${truncated}
      </section>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font: 13px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #18181b; margin: 0; padding: 32px; max-width: 900px; margin-inline: auto; background: #fff; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 28px 0 10px; padding-bottom: 5px; border-bottom: 1px solid #e4e4e7; }
  h3 { font-size: 13px; margin: 0 0 8px; font-family: ui-monospace, monospace; }
  .muted { color: #71717a; font-size: 11px; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 4px; font-size: 11px; }
  th, td { text-align: left; padding: 4px 6px; border-bottom: 1px solid #f4f4f5; }
  th { font-weight: 600; color: #52525b; background: #fafafa; }
  td { font-variant-numeric: tabular-nums; }
  .ok { color: #15803d; } .bad { color: #b91c1c; }
  .meta { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px 20px; font-size: 11px; color: #52525b; margin-top: 10px; }
  .meta b { color: #18181b; font-weight: 600; }
  .figure { position: relative; display: inline-block; max-width: 100%; border: 1px solid #d4d4d8; line-height: 0; }
  .figure img { max-width: 100%; height: auto; display: block; }
  .overlay { position: absolute; inset: 0; width: 100%; height: 100%; }
  .plate { margin-bottom: 26px; page-break-inside: avoid; }
  .note { background: #fafafa; border-left: 3px solid #a1a1aa; padding: 9px 12px; font-size: 11px; color: #3f3f46; margin-top: 22px; }
  @media print {
    body { padding: 0; }
    h2 { page-break-after: avoid; }
  }
</style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="muted">Generated ${escapeHtml(new Date().toLocaleString())}</div>

  <div class="meta">
    <div>Images processed: <b>${completed.length} of ${items.length}</b></div>
    <div>Objects measured: <b>${allAreas.length}</b></div>
    <div>Sample category: <b>${escapeHtml(category)}</b></div>
    <div>Detector view: <b>${escapeHtml(model)}</b></div>
    <div>Calibration: <b>${escapeHtml(describeCalibration(calibration, completed[0]?.width ?? 0))}</b></div>
    <div>Calibration source: <b>${escapeHtml(calibration.source)}</b></div>
  </div>

  <h2>Pooled measurements</h2>
  <table>
    <thead><tr><th>Metric</th><th>n</th><th>Mean</th><th>SD</th><th>Median</th><th>IQR</th><th>Range</th><th>Unit</th></tr></thead>
    <tbody>
      ${statsRow('Area', areaUnit, areaStats)}
      ${statsRow('Circularity', '0–1', circStats)}
      ${statsRow('Mean grey value', '0–255', intensityStats)}
    </tbody>
  </table>

  <h2>Per image</h2>
  <table>
    <thead><tr><th>Image</th><th>Status</th><th>Size</th><th>Objects</th><th>Mean area</th><th>Mean circ.</th><th>Density</th><th>Source</th></tr></thead>
    <tbody>${perImageRows}</tbody>
  </table>

  <h2>Fields</h2>
  ${plates || '<p class="muted">No images completed processing.</p>'}

  <div class="note">
    <strong>How to read this.</strong> Area, perimeter, circularity and all intensity
    figures are measured directly from the pixels enclosed by each region of
    interest, using the calibration stated above. Object <em>labels</em> and
    <em>status</em> classifications come from the vision model or the local
    simulation and are estimates, not measurements. Regions of interest can be
    edited by hand in the workstation, and every figure here follows from them.
    This report is not a clinical diagnosis.
  </div>
</body>
</html>`;
}
