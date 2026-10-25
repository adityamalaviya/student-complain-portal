# CampusVoice

A department-based student grievance and community-advocacy portal built on **Next.js App Router** and **Appwrite Cloud Functions**.

## Architectural Highlights
- **Strict Department Isolation:** Dynamic grievance filtering separating Department-Private issues from Public Institutional Matters.
- **Deterministic Department Mapping:** 12-digit enrollment number validation with characters 8–9 zero-based slice (`[7:9]`) automatically mapping to Civil (`06`) and Computer (`07`) departments.
- **Oracle Elimination:** Cross-department complaint lookups return generic HTTP `404 Not Found`.
- **Atomic Single-Support Community Voting:** Deterministic 32-character SHA-256 document IDs preventing race conditions and double-voting.
- **Serverless Architecture:** Next.js deployed to Vercel, single API router deployed to Appwrite Cloud Functions.

## Getting Started

### Prerequisites
- Node.js 18+ (tested on Node.js 24)
- npm 10+

### Setup
1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:3000](http://localhost:3000) in your browser.

### Quality Checks
```bash
npm run typecheck
npm run lint
npm run test
```

## Production Deployment Runbook

### 1. Frontend Deployment (Vercel)
1. **Push your code to GitHub:**
   ```bash
   git add .
   git commit -m "AG-016: feat(phase-7): configure production deployment and smoke tests"
   git push origin main
   ```
2. **Import Project into Vercel:**
   - Log in to [Vercel Dashboard](https://vercel.com).
   - Click **Add New...** > **Project**, and select your `campusvoice` repository.
   - Framework preset will automatically detect **Next.js** (configured in `vercel.json`).
3. **Configure Environment Variables in Vercel:**
   Add these environment variables under **Settings > Environment Variables**:
   - `NEXT_PUBLIC_APPWRITE_ENDPOINT`: `https://fra.cloud.appwrite.io/v1` (or your Appwrite endpoint)
   - `NEXT_PUBLIC_APPWRITE_PROJECT_ID`: Your Appwrite project ID
   - `NEXT_PUBLIC_APPWRITE_DATABASE_ID`: `campusvoice`
   - `NEXT_PUBLIC_APPWRITE_FUNCTION_ID`: `campusvoice-api`
   - `NEXT_PUBLIC_APP_URL`: `https://<your-project>.vercel.app`
   *(⚠️ Never add `APPWRITE_API_KEY` to Vercel — backend secrets belong exclusively in Appwrite Cloud Functions).*
4. **Deploy:** Click **Deploy**. Vercel will build and assign your production URL.

---

### 2. Appwrite Cloud Configuration (Post-Deployment)
Once Vercel gives you your production URL (e.g., `https://campusvoice.vercel.app`):
1. **Add Allowed Origin in Appwrite Console:**
   - Open **Appwrite Cloud Console** > Select your Project.
   - Navigate to **Overview** > **Platforms** > **Add Platform** > **Web App**.
   - **Name:** `CampusVoice Production`
   - **Hostname:** `<your-project>.vercel.app` (and optionally `*.vercel.app` for preview branches).
2. **Google OAuth Authorized Redirects:**
   - In Appwrite Console > **Auth** > **Settings** > **OAuth2 Providers** > **Google**.
   - Ensure the Google Cloud Console Authorized Redirect URI includes:
     `https://fra.cloud.appwrite.io/v1/account/sessions/oauth2/callback/google` (or cluster equivalent).

---

### 3. Backend Function Deployment (`campusvoice-api`)
Package and deploy the single API Cloud Function:
```bash
npm run package:function
```
This produces `dist/campusvoice-api.tar.gz`.
1. In **Appwrite Console** > **Functions** > **campusvoice-api**.
2. Go to **Deployments** > **Create Deployment** (Manual Upload).
3. Upload `dist/campusvoice-api.tar.gz`.
4. Ensure:
   - **Entrypoint:** `dist/index.js`
   - **Runtime:** `Node.js 20.0` or `22.0`
   - **Execute Permissions:** `Any`
5. Activate the deployment.

---

### 4. Verification Smoke Tests
Run automated production smoke tests against your live Vercel URL:
```bash
npm run test:smoke -- --url https://<your-project>.vercel.app
```

