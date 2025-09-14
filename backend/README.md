# Chrome Extension Translate Backend

Node.js/Express backend for Chrome Extension Translate with Stripe integration and Google Cloud Run deployment.

## Quick Start

1. **Set up Google Cloud Project**
   ```bash
   export PROJECT_ID="your-project-id"
   gcloud projects create $PROJECT_ID
   gcloud config set project $PROJECT_ID
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com
   ```

2. **Store Stripe secrets**
   ```bash
   echo -n "sk_test_your_secret_key" | gcloud secrets create stripe-secret-key --data-file=-
   echo -n "whsec_your_webhook_secret" | gcloud secrets create stripe-webhook-secret --data-file=-
   echo -n "price_your_price_id" | gcloud secrets create stripe-price-id --data-file=-
   ```

3. **Configure GitHub Actions** (see BACKEND_SETUP.md for details)

4. **Deploy**
   ```bash
   git push origin main
   ```

## Local Development

```bash
cd backend
npm install
cp env.example .env
# Edit .env with your values
npm run dev
```

## API Endpoints

- `GET /health` - Health check
- `POST /api/subscriptions/create` - Create subscription
- `GET /api/subscriptions/status/:userId` - Get user status
- `POST /api/subscriptions/cancel` - Cancel subscription
- `POST /api/subscriptions/track-usage` - Track usage
- `POST /api/webhooks/stripe` - Stripe webhooks

## Environment Variables

Required:
- `STRIPE_SECRET_KEY` - Stripe secret key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook secret
- `STRIPE_PRICE_ID` - Stripe price ID

Optional:
- `PORT` - Server port (default: 8080)
- `NODE_ENV` - Environment (default: development)
- `DATABASE_URL` - Database path (default: ./data/subscriptions.db)
- `ALLOWED_ORIGINS` - CORS origins

## Database

SQLite database with two tables:
- `subscriptions` - User subscription data
- `usage_logs` - Translation usage tracking

## Deployment

Automatic deployment via GitHub Actions to Google Cloud Run.

See `BACKEND_SETUP.md` for complete setup instructions.
# Deployment trigger Mon Sep 15 00:16:06 BST 2025
