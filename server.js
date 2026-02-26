import 'dotenv/config';
import express      from 'express';
import multer       from 'multer';
import fetch        from 'node-fetch';
import FormData     from 'form-data';
import helmet       from 'helmet';
import rateLimit    from 'express-rate-limit';
import path         from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app  = express();
const PORT = process.env.PORT || 3000;

// ── Multer: memory-only, 20 MB max, images only ──────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_, file, cb) =>
    cb(null, /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)),
});

// ── Security headers ──────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'", "'unsafe-inline'"],   // script blocks in HTML
      scriptSrcAttr:  ["'none'"],                       // no inline onclick= etc
      styleSrc:       ["'self'", "'unsafe-inline'",
                       "fonts.googleapis.com", "fonts.gstatic.com"],
      fontSrc:        ["'self'", "fonts.gstatic.com"],
      imgSrc:         ["'self'", "data:", "blob:", "https://res.cloudinary.com"],
      connectSrc:     ["'self'"],
    },
  },
}));

// ── Rate limit: 30 req/min per IP on all /api routes ─────────────────────
app.use('/api', rateLimit({
  windowMs: 60_000, max: 30,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests — please wait a moment.' },
}));

app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Health check (used by Railway/Render/Docker) ──────────────────────────
app.get('/health', (_, res) =>
  res.json({ status: 'ok', ts: new Date().toISOString() })
);

// ── Env guard helper ──────────────────────────────────────────────────────
function need(...keys) {
  const missing = keys.filter(k => !process.env[k]);
  if (missing.length) throw new Error('Missing env vars: ' + missing.join(', '));
}

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/enhance
// multipart: { image: File, prompt: string }
// → { imageB64, imageMime, text }
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/enhance', upload.single('image'), async (req, res) => {
  try {
    need('GEMINI_API_KEY');
    if (!req.file)        return res.status(400).json({ error: 'No image uploaded' });
    if (!req.body.prompt) return res.status(400).json({ error: 'prompt is required' });

    const gemRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { text: req.body.prompt },
            { inline_data: {
                mime_type: req.file.mimetype,
                data: req.file.buffer.toString('base64'),
            }},
          ]}],
          generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
        }),
      }
    );

    if (!gemRes.ok) {
      const err = await gemRes.json().catch(() => ({}));
      return res.status(gemRes.status).json({
        error: err?.error?.message || `Gemini API error ${gemRes.status}`,
      });
    }

    const parts = (await gemRes.json())?.candidates?.[0]?.content?.parts ?? [];
    let imgOut = null, txtOut = null;
    for (const p of parts) {
      if (!p.thought && p.inlineData?.data) imgOut = p.inlineData;
      if (!p.thought && p.text)             txtOut = p.text;
    }

    if (!imgOut)
      return res.status(502).json({ error: 'Gemini returned no image — try a different prompt.' });

    res.json({ imageB64: imgOut.data, imageMime: imgOut.mimeType || 'image/png', text: txtOut });

  } catch (err) {
    console.error('[enhance]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/upload
// json: { imageB64, imageMime }
// → { url }  ← direct HTTPS JPEG URL, accepted by Instagram
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/upload', async (req, res) => {
  try {
    need('CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_UPLOAD_PRESET');
    const { imageB64, imageMime } = req.body;
    if (!imageB64) return res.status(400).json({ error: 'imageB64 required' });

    const form = new FormData();
    form.append('file',          `data:${imageMime || 'image/jpeg'};base64,${imageB64}`);
    form.append('upload_preset', process.env.CLOUDINARY_UPLOAD_PRESET);
    form.append('folder',        'gemini_studio');
    form.append('eager',         'f_jpg,q_92');   // force JPEG for Instagram
    form.append('resource_type', 'image');

    const cdnData = await (await fetch(
      `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload`,
      { method: 'POST', body: form }
    )).json();

    if (cdnData.error)
      return res.status(502).json({ error: 'Cloudinary: ' + cdnData.error.message });

    // eager[0].secure_url = forced-JPEG; fallback = original upload URL
    res.json({ url: cdnData?.eager?.[0]?.secure_url || cdnData.secure_url });

  } catch (err) {
    console.error('[upload]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/instagram/post
// json: { imageUrl, caption? }
// → { success: true, mediaId }
// Full 3-step Graph API flow: create container → poll → publish
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/instagram/post', async (req, res) => {
  try {
    need('INSTAGRAM_ACCESS_TOKEN', 'INSTAGRAM_ACCOUNT_ID');
    const { imageUrl, caption = '' } = req.body;
    if (!imageUrl)                    return res.status(400).json({ error: 'imageUrl required' });
    if (!imageUrl.startsWith('https://')) return res.status(400).json({ error: 'imageUrl must be HTTPS' });

    const token = process.env.INSTAGRAM_ACCESS_TOKEN;
    const acct  = process.env.INSTAGRAM_ACCOUNT_ID;
    const G     = 'https://graph.facebook.com/v19.0';

    // ① Create container
    const createData = await (await fetch(`${G}/${acct}/media`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({ image_url: imageUrl, caption, access_token: token }),
    })).json();

    if (createData.error)
      return res.status(502).json({ error: `[${createData.error.code}] ${createData.error.message}` });

    const cid = createData.id;

    // ② Poll until FINISHED (max 60 s / 24 polls × 2.5 s)
    let status = 'IN_PROGRESS';
    for (let i = 0; i < 24 && status === 'IN_PROGRESS'; i++) {
      await new Promise(r => setTimeout(r, 2500));
      const d = await (await fetch(`${G}/${cid}?fields=status_code&access_token=${token}`)).json();
      status = d.status_code ?? status;
      if (status === 'ERROR')
        return res.status(502).json({ error: 'Container processing failed on Instagram side' });
    }
    if (status !== 'FINISHED')
      return res.status(504).json({ error: 'Instagram container timed out (>60 s)' });

    // ③ Publish
    const pubData = await (await fetch(`${G}/${acct}/media_publish`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({ creation_id: cid, access_token: token }),
    })).json();

    if (pubData.error)
      return res.status(502).json({ error: `[${pubData.error.code}] ${pubData.error.message}` });

    res.json({ success: true, mediaId: pubData.id });

  } catch (err) {
    console.error('[instagram]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── SPA fallback ──────────────────────────────────────────────────────────
app.use((_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ── Boot ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀  Gemini Studio  →  http://localhost:${PORT}`);
  console.log(`    ENV: ${process.env.NODE_ENV || 'development'}\n`);
  const keys = ['GEMINI_API_KEY','CLOUDINARY_CLOUD_NAME','CLOUDINARY_UPLOAD_PRESET',
                 'INSTAGRAM_ACCESS_TOKEN','INSTAGRAM_ACCOUNT_ID'];
  keys.forEach(k => console.log(`    ${k.padEnd(34)} ${process.env[k] ? '✓ set' : '✗ MISSING'}`));
  console.log();
});
