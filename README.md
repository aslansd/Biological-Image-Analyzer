<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/c09d0618-dfdf-4e5c-bf26-93b05dc287d3

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Deployment (Google Cloud Run)

The server honours `$PORT` and detects Cloud Run via `K_SERVICE`, so a source
deploy needs no special configuration:

```
npm run build     # emits dist/ (client assets + server.cjs)
npm start         # NODE_ENV=production node dist/server.cjs
```

Set `GEMINI_API_KEY` as an environment variable or secret on the service.
Without it the app runs in local simulation mode and says so in the header.
`GEMINI_MODEL` optionally overrides the model ID (default `gemini-3.6-flash`).

## A note on the numbers

Morphometry (area, perimeter, circularity, Feret) and densitometry (mean,
median, SD, integrated density, per-channel means) are measured from the image
pixels enclosed by each ROI. They are only as good as the ROI, which is why the
canvas supports zoom, manual ROI placement and deletion.

Physical units require calibration. If none is set, the app reports pixels and
labels itself uncalibrated rather than inventing a scale. Detection *labels* and
*status classifications* still come from the vision model and remain estimates.
See `FIXES.md` for details.

## Batch processing and reports

Queue several fields from the same experiment in the batch panel and run them
together. Each image goes through the same analysis and measurement path as the
interactive workspace, under one calibration normalised to capture resolution,
so results are comparable across the queue. Click any finished item to load it
into the workspace and correct its regions by hand.

Exports: an objects CSV (one row per detection), a per-image summary CSV, and a
self-contained HTML report with pooled statistics and overlay figures — print it
to PDF from your browser.

## Editing regions

Select any object, then drag its vertices or box corners to reshape it, drag the
centre grip to move it, double-click an edge to add a vertex, or alt-click a
vertex to remove one. Measurements update live. `Ctrl/Cmd+Z` and
`Ctrl/Cmd+Shift+Z` undo and redo; `Delete` removes the selection; `Escape`
deselects.

## Development

```
npm install
npm run dev     # Vite middleware + API on http://localhost:8080
npm run lint    # tsc --noEmit, strict
npm test        # 27 unit tests, Node's built-in runner
npm run build   # client bundle + dist/server.cjs
```

A `Dockerfile` is included for container deploys; Cloud Run source deploys work
without it. CI runs typecheck, tests, a production build, an assertion that the
sample assets were actually emitted into `dist/`, and a live boot probe.
