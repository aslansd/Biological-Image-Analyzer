import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const app = express();
const PORT = 3000;

// Increase payload limit for base64 image uploading
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));

let __dirname = '';
try {
  __dirname = path.dirname(fileURLToPath(import.meta.url));
} catch (e) {
  __dirname = process.cwd();
}

// Lazy initialize Gemini API to avoid crashes on startup if key is missing
let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && apiKey !== 'MY_GEMINI_API_KEY') {
      aiClient = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    }
  }
  return aiClient;
}

// API Routes
app.get('/api/health', (req, res) => {
  const hasKey = !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY';
  res.json({ status: 'ok', geminiKeyConfigured: hasKey });
});

// Primary Endpoint for AI-powered biological image analysis
app.post('/api/analyze-image', async (req, res) => {
  const { imageBase64, category, fileName } = req.body;

  if (!imageBase64) {
    return res.status(400).json({ error: 'No image data provided.' });
  }

  const ai = getGeminiClient();

  if (!ai) {
    console.log('[Analysis] No Gemini API Key or using default placeholder. Falling back to high-fidelity local simulation.');
    // Simulated analysis helper will be utilized on client or server. Let's return a success indicator with a simulation flag
    return res.json({ 
      isSimulated: true, 
      message: 'Gemini API key not configured in Secrets. Reverting to local high-fidelity microscopy analysis simulation.'
    });
  }

  try {
    // Standardize category and build context-appropriate instructions
    let analysisInstruction = '';
    let categoryDetails = '';

    if (category === 'cells') {
      analysisInstruction = 'Identify individual cell bodies and cell nuclei in this fluorescence microscopy image. Outline cell bodies as 6-to-8 point polygons, and nuclei as circular-like 6-to-8 point polygons.';
      categoryDetails = 'For each cell and nucleus, calculate a mock fluorescence intensity from 0 to 255 (mean intensity), a status ("healthy", "dead", "dividing"), and standard cell size (area in µm² from 50 to 400).';
    } else if (category === 'neurons') {
      analysisInstruction = 'Identify the primary neuron cell body (soma) and trace dendrite / axon paths as multi-point connected lines.';
      categoryDetails = 'Return the soma as a polygon and trace dendritic branches or axons as lines. Provide length in µm (50 to 300 µm) and indicate branching counts.';
    } else if (category === 'histology') {
      analysisInstruction = 'Identify the cell nuclei (purple spheres in standard H&E stained pathology slides) and classify them into normal stromal/epithelial nuclei versus abnormal/pleomorphic tumor nuclei.';
      categoryDetails = 'Use rectangle bounding boxes (exactly 2 coordinates: top-left and bottom-right). Return status as either "healthy" (normal) or "abnormal" (tumor nuclei).';
    } else if (category === 'bacteria') {
      analysisInstruction = 'Detect and count bacterial colony forming units (CFUs) on the agar plate. Identify standard circular colonies vs atypical/irregular contaminants.';
      categoryDetails = 'Outline colonies as polygons. Classify standard colonies as morphology "coccus" or "bacillus", status "normal" or "abnormal" (contaminants). Area range 300 to 2000 µm².';
    } else {
      analysisInstruction = 'Identify stomata openings and chlorotic or necrotic foliar lesions / spots on this plant leaf epidermis microscopic scan.';
      categoryDetails = 'Outline stomata or spots as polygons. Classify as status "normal" or "infected" (for fungal disease spots).';
    }

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    const imagePart = {
      inlineData: {
        mimeType: 'image/jpeg',
        data: base64Data,
      },
    };

    const promptPart = {
      text: `You are a professional full-stack Bio-Microscopy Image AI Assistant. Analyze this microscopy image of category: "${category}" (File name: "${fileName || 'microscope_capture.jpg'}").
      
      TASK INSTRUCTIONS:
      ${analysisInstruction}
      ${categoryDetails}

      CRITICAL GEOMETRIC COORD RULE:
      All coordinate points MUST be specified as percentages relative to the image dimensions (0 to 100 scale), where [0,0] is top-left and [100,100] is bottom-right.
      For "rect" shapes, return exactly two points: [ [minX, minY], [maxX, maxY] ].
      For "polygon" shapes, return a list of 5 to 8 sequential points outlining the border.
      For "line" shapes, return a list of sequential points tracking the neurite path.

      Generate a scientifically plausible and comprehensive quantitative list of detected biological structures. 
      Also provide a general summary and a plausible explanation for each detected item (Explainable AI reasoning: e.g. why is this nucleus flagged as healthy, dead, or tumorous based on its visual parameters).
      
      You must respond with valid, clean JSON matching the following structure:
      {
        "detections": [
          {
            "id": "det-1",
            "type": "${category === 'cells' ? 'cell' : category === 'neurons' ? 'soma' : category === 'histology' ? 'nucleus' : category === 'bacteria' ? 'colony' : 'stomata'}",
            "shape": "polygon", 
            "points": [[x1, y1], [x2, y2], ...],
            "confidence": 0.95,
            "label": "Brief human readable label",
            "attributes": {
              "area": 120.4,
              "perimeter": 42.5,
              "circularity": 0.88,
              "intensity": 185,
              "status": "healthy"
            },
            "explanation": "Expert explainable AI reasoning describing the structural/visual metrics backing this detection"
          }
        ],
        "summary": {
          "count": 1,
          "avgSize": 120.4,
          "avgCircularity": 0.88,
          "density": 250
        }
      }`
    };

    console.log(`[Gemini API] Requesting bio-analysis for category "${category}" from model: "gemini-3.5-flash"...`);

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: { parts: [imagePart, promptPart] },
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      }
    });

    const textResult = response.text || '{}';
    console.log('[Gemini API] Analysis completed successfully.');
    
    // Parse response
    const analysisData = JSON.parse(textResult);
    res.json({
      isSimulated: false,
      detections: analysisData.detections || [],
      summary: analysisData.summary || { count: 0, avgSize: 0, avgCircularity: 0, density: 0 },
    });

  } catch (error: any) {
    console.error('[Gemini API Error]', error);
    res.status(500).json({ 
      error: 'Failed to process image through Gemini. Falling back to local high-fidelity simulation.',
      details: error.message,
      isSimulated: true 
    });
  }
});

// Endpoint for general explainable AI queries and microscopy research guidance
app.post('/api/explain-ai', async (req, res) => {
  const { category, detectionDetails, question } = req.body;

  const ai = getGeminiClient();

  if (!ai) {
    // If no key, return highly plausible mock biological response
    const mockAnswer = `This specific structure (labeled "${detectionDetails?.label || 'Target'}") exhibits structural features typical of ${category} microscopy. 

Key metrics analyzed:
- Size/Area: ${detectionDetails?.attributes?.area || 'N/A'} µm²
- Boundary Circularity: ${detectionDetails?.attributes?.circularity || 'N/A'}
- Staining Intensity: ${detectionDetails?.attributes?.intensity || 'N/A'} MFI
- Functional Status: ${detectionDetails?.attributes?.status || 'standard'}

Biological Diagnosis & Justification:
The irregular border and lower staining density suggest standard physiological morphology under the selected conditions. Based on experimental guidelines, this aligns with active metabolic activity and regular membrane integrity. Adjusting the focus or fluorescence gain may assist in refining the fine-structural details.`;

    return res.json({
      explanation: mockAnswer,
      isSimulated: true
    });
  }

  try {
    const prompt = `You are an expert computational biologist and pathologist assistant specializing in microscopy.
    A researcher is examining a "${category}" sample and clicked on a specific detected structure:
    ${JSON.stringify(detectionDetails, null, 2)}
    
    The user's specific query is: "${question || 'Can you provide a detailed, explainable AI breakdown of this detected object and explain why it was classified this way?'}"
    
    Based on the morphological parameters (area, perimeter, circularity, fluorescent intensity, and status), please provide a scientifically rich, professional, and accessible response. Break down:
    1. The visual indicators in the image (e.g., membrane margins, chromatin condensation levels, fluorescent staining distribution).
    2. The scientific explanation backing its classification as "${detectionDetails?.attributes?.status || 'normal'}".
    3. Suggested follow-up steps (e.g., alternative biomarkers, software filters like deconvolution, or physiological implications).
    
    Write a concise, professional, markdown-formatted response suitable for a research dashboard. Keep it highly educational and insightful.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
    });

    res.json({
      explanation: response.text,
      isSimulated: false
    });

  } catch (error: any) {
    console.error('[Gemini API Explain Error]', error);
    res.status(500).json({
      error: 'Failed to generate explanation from Gemini API.',
      details: error.message
    });
  }
});

// Vite Middleware & Static files routing
async function initServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('[Dev Server] Vite middleware integrated successfully.');
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log('[Production Server] Serving compiled production build from dist/.');
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Biological Workstation] Server running on http://0.0.0.0:${PORT}`);
  });
}

initServer();
