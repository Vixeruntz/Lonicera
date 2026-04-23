import express from 'express';
import rateLimit from 'express-rate-limit';
import { YoutubeTranscript } from 'youtube-transcript/dist/youtube-transcript.esm.js';
import path from 'path';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import crypto from 'crypto';
import fs from 'fs';
import OpenAI from 'openai';

// Initialize Firebase Admin with the database ID from config
let db: FirebaseFirestore.Firestore;
try {
  const configRaw = fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8');
  const firebaseConfig = JSON.parse(configRaw);
  const adminApp = initializeApp({
      credential: applicationDefault()
  });
  db = getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);
} catch (error) {
  console.warn("Firebase Admin Initialization Warning:", error);
}

// Strict URL validation
function isValidVideoUrl(url: string) {
   if (!url || url.length > 300) return false;
   try {
       const parsedUrl = new URL(url);
       const hostname = parsedUrl.hostname.toLowerCase();
       return hostname.includes('youtube.com') || 
              hostname.includes('youtu.be') || 
              hostname.includes('bilibili.com') || 
              hostname.includes('b23.tv');
   } catch(e) {
       return false;
   }
}

function extractYouTubeVideoId(url: string) {
   const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
   const match = url.match(regex);
   return match ? match[1] : null;
}

// Global Limiter
const apiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 200, // Increased limit drastically to prevent false positive transcript errors a user is hitting
  message: { error: "Too many requests from this IP, please try again after an hour" },
  standardHeaders: true, 
  legacyHeaders: false, 
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Trust proxy if running behind one (like Cloud Run) to get real IP for rate limiting
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '10mb' }));

  // --- API Proxy for 3rd Party OpenAI services to bypass browser CORS ---
  app.post('/api/ai/chat', async (req, res) => {
    const { apiKey, baseUrl, model, messages, response_format, stream } = req.body;

    if (!apiKey || !model) {
        return res.status(400).json({ error: "Missing API credentials" });
    }

    try {
        const client = new OpenAI({
            apiKey: apiKey,
            baseURL: baseUrl || undefined,
        });

        if (stream) {
            const responseStream = await client.chat.completions.create({
                model,
                messages,
                stream: true,
                response_format
            });
            
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            for await (const chunk of responseStream) {
                const text = chunk.choices[0]?.delta?.content || "";
                if (text) {
                    res.write(`data: ${JSON.stringify({ text })}\n\n`);
                }
            }
            res.write(`data: [DONE]\n\n`);
            res.end();
        } else {
            const response = await client.chat.completions.create({
                model,
                messages,
                response_format
            });
            res.json({ content: response.choices[0]?.message?.content });
        }
    } catch (e: any) {
        console.error("[AI Proxy Error]:", e.message);
        res.status(500).json({ error: e.message || "Connection error" });
    }
  });

  // --- External Internal Endpoints ---

  app.get('/api/cache', async (req, res) => {
    const videoUrl = req.query.video as string;
    if (!videoUrl) return res.status(400).json({ error: "Missing video URL" });

    // Use v2_ prefix to bypass old cache pollution
    const videoHash = 'v2_' + crypto.createHash('md5').update(videoUrl).digest('hex');
    if (db) {
         try {
             const docSnap = await db.collection('articles').doc(videoHash).get();
             if (docSnap.exists) {
                 return res.json({ data: docSnap.data() });
             }
         } catch(err: any) {
             if (!err.message?.includes('PERMISSION_DENIED')) {
                 console.error("[Cache GET Error]", err.message || err);
             }
         }
    }
    return res.json({ data: null });
  });

  app.post('/api/cache', async (req, res) => {
    const { videoUrl, cacheData } = req.body;
    if (!videoUrl || !cacheData) return res.status(400).json({ error: "Missing params" });

    // Use v2_ prefix to track the new cache correctly
    const videoHash = 'v2_' + crypto.createHash('md5').update(videoUrl).digest('hex');
    if (db) {
         try {
             await db.collection('articles').doc(videoHash).set(cacheData);
             return res.json({ success: true });
         } catch(err: any) {
             if (!err.message?.includes('PERMISSION_DENIED')) {
                 console.error("[Cache POST Error]", err.message || err);
             }
         }
    }
    return res.json({ success: false });
  });

  app.get('/api/transcript', apiLimiter, async (req, res) => {
    const videoUrl = req.query.video as string;
    if (!videoUrl) return res.status(400).json({ error: "Missing video URL" });

    let ytId = extractYouTubeVideoId(videoUrl);
    if (!ytId) {
        return res.json({ transcript: "" });
    }

    let transcriptText = "";
    let videoTitle = "";
    let videoAuthor = "";

    try {
        const transcriptData = await YoutubeTranscript.fetchTranscript(ytId);
        transcriptText = transcriptData.map((t: any) => t.text).join(' ').substring(0, 80000); 
    } catch (e: any) {
        // Log silently to node process, not console.warn which pollutes logs
    }

    // Always try to fetch basic metadata via oEmbed for context
    try {
        const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${ytId}&format=json`);
        if (oembedRes.ok) {
            const data = await oembedRes.json();
            videoTitle = data.title;
            videoAuthor = data.author_name;
        }
    } catch (oembedErr) {
        console.warn("oEmbed fetch failed", oembedErr);
    }

    return res.json({ 
        transcript: transcriptText, 
        title: videoTitle, 
        author: videoAuthor 
    });
  });

  // --- End of API Endpoints ---

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
