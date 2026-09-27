import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Support large base64 image payloads from camera scans
  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ extended: true, limit: "25mb" }));

  // Lazy initialization of Gemini client
  let aiClient: GoogleGenAI | null = null;
  const getAiClient = () => {
    if (!aiClient) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY environment variable is not set.");
      }
      aiClient = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    }
    return aiClient;
  };

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      hasKey: !!process.env.GEMINI_API_KEY,
      timestamp: new Date().toISOString(),
    });
  });

  // Odometer Image Analysis API
  app.post("/api/analyze-odometer", async (req, res) => {
    try {
      const { image } = req.body;
      if (!image || typeof image !== "string") {
        return res.status(400).json({ error: "Missing image data. Please provide a photo." });
      }

      // Extract mime type and clean base64 string
      const mimeMatch = image.match(/^data:(image\/[a-zA-Z0-9.+_-]+);base64,/);
      const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
      const cleanBase64 = image.replace(/^data:image\/[a-zA-Z0-9.+_-]+;base64,/, "");

      if (!cleanBase64) {
        return res.status(400).json({ error: "Invalid image format." });
      }

      const ai = getAiClient();

      const promptText = `You are an expert vehicle odometer and instrument cluster reader.
Analyze this photo of a car/vehicle dashboard or instrument cluster.
Locate the primary odometer display that shows the total cumulative distance/mileage of the vehicle.
Rules:
1. Distinguish between the total odometer (often marked 'ODO', 'km', 'mi', or located near speedometer) and trip odometers (often marked 'TRIP A', 'TRIP B', 'Trip 1', or smaller numbers). Always prioritize the main total odometer.
2. Return ONLY the numeric value as an integer in 'mileage'. If decimal tenths are shown (e.g. on analog rollers with a white-on-black wheel or digital single decimal point), disregard tenths or round to the nearest whole integer.
3. If the reading is clearly visible, return it in 'mileage' (e.g. 142580).
4. If no odometer or numbers can be identified in the image, set 'mileage' to 0.`;

      const contents = {
        parts: [
          {
            inlineData: {
              mimeType,
              data: cleanBase64,
            },
          },
          {
            text: promptText,
          },
        ],
      };

      const config = {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            mileage: {
              type: Type.INTEGER,
              description: "The total cumulative odometer integer reading. 0 if unreadable.",
            },
            confidence: {
              type: Type.STRING,
              description: "High, Medium, or Low",
            },
            unit: {
              type: Type.STRING,
              description: "km or mi, if discernible",
            },
          },
          required: ["mileage"],
        },
      };

      // Try primary model (gemini-3.8-flash) first, fallback to gemini-flash-latest if high demand or unavailable
      let response;
      const candidateModels = ["gemini-3.8-flash", "gemini-flash-latest"];
      let lastError: any = null;

      for (const modelName of candidateModels) {
        try {
          response = await ai.models.generateContent({
            model: modelName,
            contents,
            config,
          });
          if (response?.text) {
            break;
          }
        } catch (err: any) {
          lastError = err;
          console.warn(`Model ${modelName} failed, trying next candidate if available:`, err?.message || err);
        }
      }

      if (!response?.text) {
        throw lastError || new Error("AI service temporarily unavailable. Please retry.");
      }

      const parsed = JSON.parse(response.text.trim());
      const mileage = typeof parsed.mileage === "number" ? parsed.mileage : 0;

      return res.json({
        success: mileage > 0,
        mileage: mileage > 0 ? mileage : null,
        confidence: parsed.confidence || "Medium",
        unit: parsed.unit || null,
      });
    } catch (err: any) {
      console.error("Error analyzing odometer image:", err);
      let errorMessage = "Failed to analyze image. Please retry or enter reading manually.";
      if (err?.message) {
        try {
          const parsedErr = JSON.parse(err.message);
          if (parsedErr?.error?.message) {
            errorMessage = parsedErr.error.message;
          }
        } catch {
          errorMessage = err.message;
        }
      }
      return res.status(500).json({ error: errorMessage });
    }
  });

  // AI Predictive Tagging & Classification API
  app.post("/api/predict-trip-tag", async (req, res) => {
    try {
      const {
        startAddress = "",
        endAddress = "",
        distance = 0,
        startTime = new Date().toISOString(),
        vehicle = "",
        notes = "",
        recentTrips = []
      } = req.body;

      const ai = getAiClient();

      const tripDate = new Date(startTime);
      const dayOfWeek = tripDate.toLocaleDateString('en-US', { weekday: 'long' });
      const timeOfDay = tripDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

      const promptText = `You are an intelligent vehicle mileage classification and tax logbook compliance assistant.
Analyze this trip's details and predict whether it was for 'work' (business purpose) or 'personal' use, suggest the most likely client or project name, tax category, and concise reason.

CURRENT TRIP DETAILS:
- Day & Time: ${dayOfWeek} at ${timeOfDay}
- Start Location / Address: ${startAddress || 'Unknown start'}
- Destination / End Location: ${endAddress || 'Unknown destination'}
- Distance: ${distance} units
- Vehicle: ${vehicle || 'Default vehicle'}
- User's Draft Notes: ${notes || 'None'}

USER'S PAST TRIP PATTERNS (for context):
${JSON.stringify(recentTrips.slice(0, 10), null, 2)}

CLASSIFICATION RULES:
1. Trips between 7:30 AM and 6:30 PM on Monday-Friday that travel to commercial addresses, offices, job sites, suppliers (e.g. hardware, electrical, distribution), or client locations are likely 'work'.
2. Weekend trips, evening trips, and travel to supermarkets, gyms, entertainment, or purely residential addresses are likely 'personal', unless explicitly tagged as work in past patterns.
3. If past trips to similar destinations or addresses have a known client name or notes, reuse that client name with high confidence.
4. Provide a confidence score between 0.50 and 0.99.
5. Provide a short, practical 1-sentence explanation of why this was predicted.`;

      const config = {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            predictedTripType: {
              type: Type.STRING,
              description: "Must be 'work' or 'personal'",
            },
            confidence: {
              type: Type.NUMBER,
              description: "Confidence from 0.50 to 0.99",
            },
            predictedClient: {
              type: Type.STRING,
              description: "Predicted client or company name, or empty string",
            },
            predictedCategory: {
              type: Type.STRING,
              description: "e.g. Client Meeting, Site Visit, Supplier Pickup, Commute, Personal Errand",
            },
            predictedReason: {
              type: Type.STRING,
              description: "Short suggested logbook reason for tax records",
            },
            tags: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Suggested tags e.g. ['Client Visit', 'Billable']",
            },
            explanation: {
              type: Type.STRING,
              description: "Brief explanation of prediction",
            },
          },
          required: [
            "predictedTripType",
            "confidence",
            "predictedClient",
            "predictedCategory",
            "predictedReason",
            "tags",
            "explanation"
          ],
        },
      };

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: promptText,
        config,
      });

      if (!response?.text) {
        throw new Error("No response from AI model");
      }

      const parsed = JSON.parse(response.text.trim());
      return res.json({
        success: true,
        prediction: {
          predictedTripType: parsed.predictedTripType === 'personal' ? 'personal' : 'work',
          confidence: Math.round((parsed.confidence || 0.85) * 100),
          predictedClient: parsed.predictedClient || '',
          predictedCategory: parsed.predictedCategory || (parsed.predictedTripType === 'personal' ? 'Personal' : 'General Business'),
          predictedReason: parsed.predictedReason || (parsed.predictedTripType === 'personal' ? 'Personal trip' : 'Business travel'),
          tags: Array.isArray(parsed.tags) ? parsed.tags : ['Auto-Tagged'],
          explanation: parsed.explanation || 'Predicted based on route and time of day.'
        }
      });
    } catch (err: any) {
      console.warn("Predictive tagging error:", err?.message || err);
      // Fallback local heuristic
      const { startAddress = '', endAddress = '', startTime } = req.body;
      const hour = startTime ? new Date(startTime).getHours() : new Date().getHours();
      const isWorkHours = hour >= 8 && hour <= 18;
      const isPersonal = /home|gym|supermarket|woolworths|coles|cinema|cafe|beach/i.test(endAddress + ' ' + startAddress);
      const tripType = isPersonal ? 'personal' : (isWorkHours ? 'work' : 'personal');

      return res.json({
        success: true,
        prediction: {
          predictedTripType: tripType,
          confidence: 78,
          predictedClient: '',
          predictedCategory: tripType === 'work' ? 'Business Travel' : 'Personal',
          predictedReason: tripType === 'work' ? 'Client / Business visit' : 'Personal errand',
          tags: [tripType === 'work' ? 'Work' : 'Personal'],
          explanation: isPersonal ? 'Matched personal destination keywords.' : (isWorkHours ? 'Travel during standard business hours.' : 'Off-hours travel.')
        }
      });
    }
  });

  // Serve frontend: Vite middleware in development, compiled dist in production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // Express 5 wildcard routing
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
