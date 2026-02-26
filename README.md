# ✦ Gemini Studio — AI Instagram Publisher

Transform raw photos into studio-quality images using **Google Gemini AI**, auto-host them on **Cloudinary**, and publish directly to **Instagram** — all with one click.

---

## 🚀 Deploy in 5 Minutes (Railway — Recommended Free Host)

### Step 1 — Push to GitHub

```bash
git init
git add .
git commit -m "initial commit"
gh repo create gemini-studio --public --push
# or: git remote add origin https://github.com/YOUR_USER/gemini-studio.git && git push -u origin main
```

### Step 2 — Deploy to Railway

1. Go to **[railway.app](https://railway.app)** → New Project → Deploy from GitHub
2. Select your `gemini-studio` repo
3. Railway auto-detects Node.js and deploys

### Step 3 — Set Environment Variables in Railway

In your Railway project → **Variables** tab, add:

| Variable | Value | Where to get it |
|---|---|---|
| `GEMINI_API_KEY` | `AIzaSy...` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) — free |
| `CLOUDINARY_CLOUD_NAME` | `my-cloud` | [cloudinary.com/console](https://cloudinary.com/console) dashboard |
| `CLOUDINARY_UPLOAD_PRESET` | `unsigned_preset` | Cloudinary → Settings → Upload → Add Preset → **set to Unsigned** |
| `INSTAGRAM_ACCESS_TOKEN` | `EAAxxxxx` | See Instagram setup below |
| `INSTAGRAM_ACCOUNT_ID` | `17841xxxxx` | See Instagram setup below |

Railway redeploys automatically. Your app is live at `https://your-app.up.railway.app` ✓

---

## 📸 Instagram Setup (one-time, ~10 min)

You need a **Business or Creator** Instagram account linked to a Facebook Page.

### Get Access Token & Account ID

1. Go to [developers.facebook.com](https://developers.facebook.com) → My Apps → Create App → **Business**
2. Add **Instagram Graph API** product
3. Under Instagram → **Generate Token** → log in with your Instagram business account
4. Copy the token — then extend it to a **long-lived token** (valid 60 days):
   ```
   GET https://graph.facebook.com/v19.0/oauth/access_token
     ?grant_type=fb_exchange_token
     &client_id=YOUR_APP_ID
     &client_secret=YOUR_APP_SECRET
     &fb_exchange_token=SHORT_LIVED_TOKEN
   ```
5. Get your Account ID:
   ```
   GET https://graph.facebook.com/v19.0/me/accounts?access_token=YOUR_TOKEN
   ```
   Look for `instagram_business_account.id` in the response.

---

## ☁️ Cloudinary Setup (2 min)

1. Sign up free at [cloudinary.com](https://cloudinary.com) (25 GB/month free)
2. Copy your **Cloud Name** from the dashboard
3. Go to **Settings → Upload → Upload Presets → Add upload preset**
4. Set **Signing Mode = Unsigned** → Save → copy the preset name

---

## 🐳 Alternative: Docker

```bash
docker build -t gemini-studio .
docker run -p 3000:3000 \
  -e GEMINI_API_KEY=AIzaSy... \
  -e CLOUDINARY_CLOUD_NAME=my-cloud \
  -e CLOUDINARY_UPLOAD_PRESET=my-preset \
  -e INSTAGRAM_ACCESS_TOKEN=EAAxxxxx \
  -e INSTAGRAM_ACCOUNT_ID=17841xxxxx \
  gemini-studio
```

---

## 🖥️ Alternative: Render

1. Go to [render.com](https://render.com) → New Web Service → Connect GitHub
2. Select repo — Render detects `render.yaml` automatically
3. Add the 5 environment variables in Render dashboard → Deploy

---

## 💻 Run Locally

```bash
cp .env.example .env
# Edit .env with your keys
npm install
npm run dev
# Open http://localhost:3000
```

---

## 🏗️ Architecture

```
Browser (no API keys exposed)
    │
    ├── POST /api/enhance      → Gemini 2.5 Flash Image API
    ├── POST /api/upload       → Cloudinary (forced JPEG output)
    └── POST /api/instagram/post → Instagram Graph API v19.0
                                    ├── Create container
                                    ├── Poll until FINISHED
                                    └── Publish
```

All API keys live **server-side only** as environment variables. The browser never sees them.

---

## ⚙️ Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | ✓ | Google Gemini API key (starts with `AIzaSy`) |
| `CLOUDINARY_CLOUD_NAME` | ✓ | Your Cloudinary cloud name |
| `CLOUDINARY_UPLOAD_PRESET` | ✓ | Unsigned upload preset name |
| `INSTAGRAM_ACCESS_TOKEN` | ✓ | Long-lived Instagram access token |
| `INSTAGRAM_ACCOUNT_ID` | ✓ | Instagram Business account numeric ID |
| `PORT` | optional | Server port (default: 3000) |
| `NODE_ENV` | optional | Set to `production` on servers |

---

## 📋 Studio Presets

| Preset | Description |
|---|---|
| 💡 Studio Clean | 3-point lighting, neutral backdrop, commercial look |
| 🎭 Dramatic | Rembrandt lighting, deep shadows, cinematic |
| 🌅 Golden Hour | Warm amber, outdoor backlighting, lifestyle |
| 🌸 Beauty Soft | Fashion softbox, airy pastel, magazine cover |
| 📦 Product Shot | White studio, perfect sharpness, Apple-style |
| 🎬 Cinematic | Teal-orange grade, film grain, Netflix aesthetic |

---

## 🔒 Security Features

- All API keys server-side only (never in browser)
- Helmet.js security headers
- Rate limiting: 30 API requests/min per IP
- File type validation (images only, 20 MB max)
- Memory-only file handling (no disk writes)
- HTTPS enforced for image URLs

---

Made with ✦ Gemini Studio
