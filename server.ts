import express from 'express';
import fs from 'fs';
import path from 'path';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

// FIX: Cloud Run injects the port it expects the container to listen on via $PORT
// (default 8080). Hard-coding 3000 makes the revision fail its startup probe.
const PORT = Number(process.env.PORT) || 8080;

// FIX: Cloud Run does not set NODE_ENV, so `NODE_ENV !== 'production'` was true
// in production and the container was booting the Vite DEV server. K_SERVICE is
// always present on Cloud Run, so we treat it as a definitive production signal.
const IS_PRODUCTION =
  process.env.NODE_ENV === 'production' || !!process.env.K_SERVICE;

// Cloud Run sits behind a proxy; trust it so req.ip is the real client.
app.set('trust proxy', true);
app.disable('x-powered-by');

// Security headers. No helmet dependency for four headers we can state plainly.
// style-src allows inline because React sets style attributes directly, and
// img-src allows data:/blob: because uploads are held as data URLs client-side.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (IS_PRODUCTION) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "connect-src 'self'",
        "font-src 'self' data:",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
      ].join('; ')
    );
  }
  next();
});

// Base64 payloads inflate ~33%; the client downsamples before upload, but keep
// headroom for large multi-channel captures.
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));

/**
 * Minimal fixed-window rate limit on the model-backed routes. These calls cost
 * money, so an unauthenticated public URL needs some floor.
 *
 * This is per-instance and in-memory. Cloud Run may run several instances, so
 * the effective global limit is this number times the instance count. For a
 * hard global cap, put Cloud Armor or an API gateway in front.
 */
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_PER_MINUTE) || 20;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(req: express.Request, res: express.Response, next: express.NextFunction) {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const bucket = rateBuckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }

  if (bucket.count >= RATE_LIMIT_MAX) {
    res.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000));
    return res.status(429).json({ error: 'Too many analysis requests. Please wait a moment.' });
  }

  bucket.count++;
  next();
}

// Bounded cleanup so the map cannot grow without limit on a long-lived instance.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (now > bucket.resetAt) rateBuckets.delete(key);
  }
}, RATE_LIMIT_WINDOW_MS).unref();

/** Aborts an upstream call that hangs, so a request cannot pin a worker forever. */
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS) || 90_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

// Model IDs are configurable so you can roll forward without a code change.
const TEXT_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

// Lazy initialize Gemini API to avoid crashes on startup if key is missing
let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && apiKey !== 'MY_GEMINI_API_KEY') {
      aiClient = new GoogleGenAI({ apiKey });
    }
  }
  return aiClient;
}

// Structured-output schema. Far more reliable than asking for "clean JSON" in
// the prompt, which silently breaks whenever the model adds prose or a fence.
const ANALYSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    detections: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          type: { type: Type.STRING },
          shape: { type: Type.STRING },
          points: {
            type: Type.ARRAY,
            items: { type: Type.ARRAY, items: { type: Type.NUMBER } },
          },
          confidence: { type: Type.NUMBER },
          label: { type: Type.STRING },
          attributes: {
            type: Type.OBJECT,
            properties: {
              area: { type: Type.NUMBER },
              perimeter: { type: Type.NUMBER },
              circularity: { type: Type.NUMBER },
              intensity: { type: Type.NUMBER },
              status: { type: Type.STRING },
              length: { type: Type.NUMBER },
              branchCount: { type: Type.NUMBER },
              morphology: { type: Type.STRING },
            },
          },
          explanation: { type: Type.STRING },
        },
        required: ['id', 'type', 'shape', 'points', 'confidence', 'label', 'explanation'],
      },
    },
    summary: {
      type: Type.OBJECT,
      properties: {
        count: { type: Type.NUMBER },
        avgSize: { type: Type.NUMBER },
        avgCircularity: { type: Type.NUMBER },
        density: { type: Type.NUMBER },
      },
    },
  },
  required: ['detections'],
};

// Guards against a malformed model response poisoning the canvas renderer.
function sanitizeDetections(raw: any[]): any[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((d) => d && Array.isArray(d.points) && d.points.length > 0)
    .map((d, i) => {
      const points = d.points
        .filter((p: any) => Array.isArray(p) && p.length >= 2)
        .map((p: any) => [
          Math.min(100, Math.max(0, Number(p[0]) || 0)),
          Math.min(100, Math.max(0, Number(p[1]) || 0)),
        ]);
      const shape = ['rect', 'polygon', 'point', 'line'].includes(d.shape) ? d.shape : 'polygon';
      return {
        id: typeof d.id === 'string' && d.id ? d.id : `gem-det-${i + 1}`,
        type: d.type || 'cell',
        shape: shape === 'rect' && points.length < 2 ? 'polygon' : shape,
        points,
        confidence: Math.min(1, Math.max(0, Number(d.confidence) || 0.5)),
        label: d.label || 'Detected structure',
        attributes: d.attributes && typeof d.attributes === 'object' ? d.attributes : {},
        explanation: d.explanation || 'No reasoning returned by the model.',
      };
    })
    .filter((d) => d.points.length >= (d.shape === 'rect' ? 2 : 3));
}

// API Routes
app.get('/api/health', (_req, res) => {
  const hasKey = !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY';
  res.json({ status: 'ok', geminiKeyConfigured: hasKey, model: TEXT_MODEL });
});

// Primary Endpoint for AI-powered biological image analysis
app.post('/api/analyze-image', rateLimit, async (req, res) => {
  const { imageBase64, category, fileName, mimeType } = req.body;

  if (!imageBase64) {
    return res.status(400).json({ error: 'No image data provided.' });
  }

  const ai = getGeminiClient();

  if (!ai) {
    console.log('[Analysis] No Gemini API key configured. Client will use local simulation.');
    return res.json({
      isSimulated: true,
      message: 'Gemini API key not configured. Reverting to local microscopy analysis simulation.',
    });
  }

  try {
    let analysisInstruction = '';
    let categoryDetails = '';

    if (category === 'cells') {
      analysisInstruction =
        'Identify individual cell bodies and cell nuclei in this fluorescence microscopy image. Outline cell bodies as 6-to-8 point polygons, and nuclei as circular-like 6-to-8 point polygons.';
      categoryDetails =
        'For each cell and nucleus, estimate mean fluorescence intensity from 0 to 255, a status ("healthy", "dead", "dividing"), and cell size (area in µm², typically 50 to 400).';
    } else if (category === 'neurons') {
      analysisInstruction =
        'Identify the primary neuron cell body (soma) and trace dendrite / axon paths as multi-point connected lines.';
      categoryDetails =
        'Return the soma as a polygon and trace dendritic branches or axons as lines. Provide length in µm (50 to 300 µm) and branch counts.';
    } else if (category === 'histology') {
      analysisInstruction =
        'Identify cell nuclei (purple in H&E stained pathology slides) and classify them as normal stromal/epithelial nuclei versus abnormal/pleomorphic tumour nuclei.';
      categoryDetails =
        'Use rectangle bounding boxes (exactly 2 coordinates: top-left and bottom-right). Return status as "healthy" (normal) or "abnormal" (tumour nuclei).';
    } else if (category === 'bacteria') {
      analysisInstruction =
        'Detect and count bacterial colony forming units (CFUs) on the agar plate. Distinguish typical circular colonies from atypical/irregular contaminants.';
      categoryDetails =
        'Outline colonies as polygons. Classify morphology as "coccus" or "bacillus", status "normal" or "abnormal" (contaminants). Area range 300 to 2000 µm².';
    } else {
      analysisInstruction =
        'Identify stomata openings and chlorotic or necrotic foliar lesions on this plant leaf epidermis scan.';
      categoryDetails = 'Outline stomata or spots as polygons. Classify status as "normal" or "infected".';
    }

    const base64Data = String(imageBase64).replace(/^data:image\/\w+;base64,/, '');

    const imagePart = {
      inlineData: {
        // FIX: was hard-coded to image/jpeg, which mislabels PNG/WebP uploads.
        mimeType: typeof mimeType === 'string' && mimeType.startsWith('image/') ? mimeType : 'image/jpeg',
        data: base64Data,
      },
    };

    const promptPart = {
      text: `You are a computational microscopy image analysis assistant. Analyse this microscopy image of category "${category}" (file name: "${fileName || 'microscope_capture.jpg'}").

TASK
${analysisInstruction}
${categoryDetails}

COORDINATE RULE
All coordinates are percentages of image dimensions (0-100), [0,0] top-left, [100,100] bottom-right.
- "rect": exactly two points, [[minX, minY], [maxX, maxY]].
- "polygon": 5 to 8 sequential boundary points.
- "line": sequential points following the neurite path.

Return every detected structure with a short label, a confidence, quantitative attributes, and an explanation of the visual evidence behind its classification (chromatin condensation, membrane margins, staining distribution, and so on). Be conservative: only report structures you can actually see. If nothing is detectable, return an empty detections array.`,
    };

    console.log(`[Gemini] Analysing category "${category}" with ${TEXT_MODEL}`);

    const response = await withTimeout(
      ai.models.generateContent({
      model: TEXT_MODEL,
      contents: { parts: [imagePart, promptPart] },
      config: {
        responseMimeType: 'application/json',
        responseSchema: ANALYSIS_SCHEMA,
        // NOTE: temperature/top_p/top_k are deprecated on Gemini 3.x and have
        // been removed rather than sent and ignored.
      },
      }),
      UPSTREAM_TIMEOUT_MS,
      'Gemini analysis'
    );

    const textResult = response.text || '{}';

    let analysisData: any = {};
    try {
      analysisData = JSON.parse(textResult);
    } catch (parseError) {
      console.error('[Gemini] Response was not valid JSON. First 300 chars:', textResult.slice(0, 300));
      return res.status(502).json({
        error: 'Model returned malformed JSON.',
        isSimulated: true,
      });
    }

    const detections = sanitizeDetections(analysisData.detections);
    console.log(`[Gemini] Analysis complete: ${detections.length} structures.`);

    res.json({
      isSimulated: false,
      detections,
      summary: analysisData.summary || null,
    });
  } catch (error: any) {
    console.error('[Gemini API Error]', error);
    res.status(500).json({
      error: 'Failed to process image through Gemini. Falling back to local simulation.',
      details: IS_PRODUCTION ? undefined : error?.message || String(error),
      isSimulated: true,
    });
  }
});

// Endpoint for explainable-AI queries and microscopy research guidance
app.post('/api/explain-ai', rateLimit, async (req, res) => {
  const { category, detectionDetails, question } = req.body;

  const ai = getGeminiClient();

  if (!ai) {
    const a = detectionDetails?.attributes || {};
    const mockAnswer = `**Offline explanation (no Gemini key configured)**

Structure: **${detectionDetails?.label || 'Target'}** in a ${category} sample.

**Measured parameters**
* Area: ${a.area ?? 'N/A'} µm²
* Circularity: ${a.circularity ?? 'N/A'}
* Mean intensity: ${a.intensity ?? 'N/A'} (0-255)
* Status: ${a.status ?? 'not assigned'}

**Interpretation**
These values are consistent with the morphology class assigned by the segmentation step. Set a GEMINI_API_KEY in your Cloud Run environment variables to get a full model-generated pathology rationale here instead of this placeholder.`;

    return res.json({ explanation: mockAnswer, isSimulated: true });
  }

  try {
    const prompt = `You are an expert computational biologist and pathology assistant specialising in microscopy.
A researcher is examining a "${category}" sample and selected this detected structure:
${JSON.stringify(detectionDetails, null, 2)}

Their question: "${question || 'Give a detailed breakdown of this detected object and explain why it was classified this way.'}"

Cover, in markdown, concisely:
1. The visual indicators involved (membrane margins, chromatin condensation, staining distribution).
2. The reasoning behind the "${detectionDetails?.attributes?.status || 'normal'}" classification.
3. Suggested follow-up (alternative biomarkers, deconvolution or other filters, physiological implications).

Be precise about uncertainty: these measurements come from an automated segmentation and are not a clinical diagnosis.`;

    const response = await withTimeout(
      ai.models.generateContent({ model: TEXT_MODEL, contents: prompt }),
      UPSTREAM_TIMEOUT_MS,
      'Gemini explanation'
    );

    res.json({ explanation: response.text, isSimulated: false });
  } catch (error: any) {
    console.error('[Gemini Explain Error]', error);
    res.status(500).json({
      error: 'Failed to generate explanation from Gemini API.',
      details: IS_PRODUCTION ? undefined : error?.message || String(error),
    });
  }
});

// Vite middleware (dev) or static dist (production)
async function initServer() {
  let servingDev = false;

  if (!IS_PRODUCTION) {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
      app.use(vite.middlewares);
      servingDev = true;
      console.log('[Dev Server] Vite middleware integrated.');
    } catch (err) {
      // Vite is a devDependency. If it is absent we are effectively in
      // production regardless of what NODE_ENV claims, so serve the build.
      console.warn('[Server] Vite unavailable, falling back to static dist/.', err);
    }
  }

  if (!servingDev) {
    const distPath = path.join(process.cwd(), 'dist');
    if (!fs.existsSync(path.join(distPath, 'index.html'))) {
      console.error(`[Fatal] No production build found at ${distPath}. Run "npm run build" first.`);
      process.exit(1);
    }
    // Hashed asset filenames are safe to cache aggressively; index.html is not.
    app.use(express.static(distPath, { maxAge: '1y', index: false }));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log('[Production Server] Serving build from dist/.');
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Biological Workstation] Listening on 0.0.0.0:${PORT} (production=${IS_PRODUCTION})`);
  });

  // Cloud Run sends SIGTERM before reclaiming an instance; exit cleanly so
  // in-flight requests are not cut off mid-response.
  process.on('SIGTERM', () => {
    console.log('[Server] SIGTERM received, shutting down.');
    server.close(() => process.exit(0));
  });
}

initServer();
