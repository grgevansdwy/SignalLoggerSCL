# SCL API — Deployment Guide

---

## Recommended Option: Render (Free Tier)

Render is the best fit for this use case. The API only needs to wake up once per hour
when data is pushed, so the free tier's spin-down behavior is not a problem.

### Steps

1. **Push the `server` folder to a GitHub repo**
   - Create a new repo (can be private) and push the `server` folder contents as the root

2. **Create a Render account**
   - Go to [https://render.com](https://render.com) and sign up

3. **Create a new Web Service**
   - Click **New → Web Service**
   - Connect your GitHub repo
   - Configure:

   | Setting | Value |
   |---------|-------|
   | **Environment** | `Node` |
   | **Build Command** | `npm install` |
   | **Start Command** | `npm start` |
   | **Instance Type** | `Free` |

4. **Add Environment Variables**

   In the Render dashboard under **Environment**, add:

   | Key | Value |
   |-----|-------|
   | `API_KEY` | `cad9f626033c3a612bb689710cef8499728dc6a1ee9f38fc771ecaa9cd862e66` |
   | `FIREBASE_SERVICE_ACCOUNT` | Paste the entire service account JSON as a single line |
   | `PORT` | `3001` |

5. **Deploy**
   - Click **Deploy**. Render will install dependencies and start the server.
   - Your API will be live at: `https://your-service-name.onrender.com`

6. **Test it**
   ```bash
   curl https://your-service-name.onrender.com/health
   # Expected: { "status": "ok" }
   ```

> **Note on free tier spin-down:** Render free services spin down after 15 minutes of inactivity.
> The first request after spin-down takes ~30 seconds to respond. Since you're pushing
> data every hour, the server will be spun down between pushes — this is fine, the
> request will just take a bit longer on the first hit. If you want instant response,
> upgrade to the $7/month Starter plan.

---

## Alternative Option: Railway

Railway gives $5 free credit per month which covers a small server.

### Steps

1. Go to [https://railway.app](https://railway.app) and sign up with GitHub
2. Click **New Project → Deploy from GitHub repo**
3. Select your server repo
4. Railway auto-detects Node.js — set the start command to `npm start`
5. Go to **Variables** and add the same three env vars as above
6. Railway assigns a public URL automatically

---

## Alternative Option: Fly.io

Good for more control with a generous free tier (3 shared VMs free).

### Steps

1. Install the Fly CLI: [https://fly.io/docs/hands-on/install-flyctl](https://fly.io/docs/hands-on/install-flyctl)
2. In the `server` folder:
   ```bash
   fly auth login
   fly launch        # follow the prompts, pick the free shared-cpu tier
   ```
3. Set environment variables:
   ```bash
   fly secrets set API_KEY="cad9f626033c3a612bb689710cef8499728dc6a1ee9f38fc771ecaa9cd862e66"
   fly secrets set FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'
   ```
4. Deploy:
   ```bash
   fly deploy
   ```

---

## Things to Keep in Mind Before Deploying

- **Never commit `.env` to git.** The `.gitignore` should exclude it. The service account JSON contains a private key.
- **The `FIREBASE_SERVICE_ACCOUNT` env var** must be the entire JSON on a single line (no line breaks).
- **After deployment**, update the `POST` URL in whatever script/device is pushing the data to use the new public URL instead of `localhost:3001`.

---

## Quick Comparison

| Platform | Free Tier | Cold Start | Easiest Setup |
|----------|-----------|------------|---------------|
| **Render** | Yes (spins down) | ~30s | Yes |
| **Railway** | $5 credit/mo | No | Yes |
| **Fly.io** | 3 free VMs | No | Moderate |
