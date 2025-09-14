# Backend Setup Guide for Chrome Extension Translate

This guide walks you through setting up the complete backend infrastructure using Google Cloud Run with automatic deployment from GitHub.

## Overview

The backend provides:
- **Stripe Integration**: Customer and subscription management
- **Usage Tracking**: Free tier limits and premium access
- **Webhook Handling**: Real-time subscription updates
- **Database**: SQLite for subscription data (easily upgradeable to PostgreSQL)
- **Auto Deployment**: GitHub Actions → Google Cloud Run

## Prerequisites

1. **Google Cloud Account** with billing enabled
2. **Stripe Account** (can use test mode initially)
3. **GitHub Repository** (this repo)

## Step 1: Google Cloud Setup

### 1.1 Create a New Project
```bash
# Install Google Cloud CLI if not already installed
# https://cloud.google.com/sdk/docs/install

# Login to Google Cloud
gcloud auth login

# Create a new project (replace PROJECT_ID with your desired ID)
export PROJECT_ID="chrome-extension-translate-backend"
gcloud projects create $PROJECT_ID
gcloud config set project $PROJECT_ID

# Enable required APIs
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable secretmanager.googleapis.com
```

### 1.2 Set up Workload Identity Federation (for GitHub Actions)
```bash
# Create workload identity pool
gcloud iam workload-identity-pools create "github-pool" \
  --location="global" \
  --display-name="GitHub Actions Pool"

# Get the pool ID
export WORKLOAD_IDENTITY_POOL_ID=$(gcloud iam workload-identity-pools describe "github-pool" \
  --location="global" \
  --format="value(name)")

# Create workload identity provider
gcloud iam workload-identity-pools providers create-oidc "github-provider" \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --display-name="GitHub Actions Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
  --issuer-uri="https://token.actions.githubusercontent.com"

# Create service account for deployments
gcloud iam service-accounts create github-actions-sa \
  --display-name="GitHub Actions Service Account"

# Grant necessary permissions to the service account
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:github-actions-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:github-actions-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/storage.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:github-actions-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

# Allow GitHub Actions to impersonate the service account
# Replace YOUR_GITHUB_USERNAME and YOUR_REPO_NAME
export GITHUB_REPO="YOUR_GITHUB_USERNAME/YOUR_REPO_NAME"

gcloud iam service-accounts add-iam-policy-binding \
  github-actions-sa@$PROJECT_ID.iam.gserviceaccount.com \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/$WORKLOAD_IDENTITY_POOL_ID/attribute.repository/$GITHUB_REPO"
```

## Step 2: Stripe Setup

### 2.1 Get Stripe Keys
1. Go to [Stripe Dashboard](https://dashboard.stripe.com/)
2. Get your **Publishable Key** and **Secret Key** from the API keys section
3. Create a **Product** for your $0.99/month subscription
4. Copy the **Price ID** from the product

### 2.2 Set up Webhook Endpoint
1. Go to Stripe Dashboard → Webhooks
2. Click "Add endpoint"
3. URL: `https://YOUR_SERVICE_URL/api/webhooks/stripe` (you'll get this after first deployment)
4. Select these events:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Copy the **Webhook Secret**

## Step 3: Store Secrets in Google Cloud

```bash
# Store Stripe secrets
echo -n "sk_test_your_actual_secret_key" | gcloud secrets create stripe-secret-key --data-file=-
echo -n "whsec_your_actual_webhook_secret" | gcloud secrets create stripe-webhook-secret --data-file=-
echo -n "price_your_actual_price_id" | gcloud secrets create stripe-price-id --data-file=-

# Grant Cloud Run access to secrets
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$PROJECT_ID@appspot.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

## Step 4: Configure GitHub Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions

Add these **Repository Secrets**:
- `GCP_PROJECT_ID`: Your Google Cloud project ID
- `WIF_PROVIDER`: `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/providers/github-provider`
- `WIF_SERVICE_ACCOUNT`: `github-actions-sa@PROJECT_ID.iam.gserviceaccount.com`

To get your project number:
```bash
gcloud projects describe $PROJECT_ID --format="value(projectNumber)"
```

## Step 5: Update Extension Configuration

### 5.1 Update payment.js
Replace the placeholder URL in `payment.js`:
```javascript
this.apiBaseUrl = 'https://your-service-url.run.app'; // Replace with actual URL after deployment
```

### 5.2 Update Stripe Publishable Key
Replace the placeholder in `payment.js`:
```javascript
this.stripe = Stripe('pk_test_your_actual_publishable_key');
```

## Step 6: Deploy

### 6.1 First Deployment
```bash
# Commit and push your changes
git add .
git commit -m "Add backend infrastructure"
git push origin main
```

The GitHub Action will automatically:
1. Build the Docker image
2. Push to Google Container Registry
3. Deploy to Cloud Run
4. Output the service URL

### 6.2 Get Service URL
After deployment, get your service URL:
```bash
gcloud run services describe chrome-extension-translate-backend \
  --region=us-central1 \
  --format="value(status.url)"
```

### 6.3 Update Extension with Real URL
Update `payment.js` with your actual Cloud Run URL and redeploy.

## Step 7: Update Stripe Webhook

1. Go back to Stripe Dashboard → Webhooks
2. Update your webhook endpoint URL with the real Cloud Run URL
3. Test the webhook endpoint

## Step 8: Testing

### 8.1 Test Backend Health
```bash
curl https://your-service-url.run.app/health
```

### 8.2 Test Extension
1. Load the extension in Chrome
2. Try creating a subscription with test card: `4242 4242 4242 4242`
3. Check the browser console and Cloud Run logs

## Environment Variables

The backend uses these environment variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `STRIPE_SECRET_KEY` | Stripe secret key | `sk_test_...` |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key | `pk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook secret | `whsec_...` |
| `STRIPE_PRICE_ID` | Stripe price ID for subscription | `price_...` |
| `PORT` | Server port | `8080` |
| `NODE_ENV` | Environment | `production` |
| `DATABASE_URL` | Database path | `./data/subscriptions.db` |
| `ALLOWED_ORIGINS` | CORS origins | `chrome-extension://...` |

## API Endpoints

The backend provides these endpoints:

### Subscription Management
- `POST /api/subscriptions/create` - Create new subscription
- `GET /api/subscriptions/status/:userId` - Get subscription status
- `POST /api/subscriptions/cancel` - Cancel subscription
- `POST /api/subscriptions/track-usage` - Track translation usage
- `GET /api/subscriptions/usage/:userId` - Get usage statistics

### Webhooks
- `POST /api/webhooks/stripe` - Stripe webhook handler

### Health Check
- `GET /health` - Service health check

## Database Schema

The SQLite database includes:

### subscriptions table
- `id` - Primary key
- `user_id` - Unique user identifier
- `stripe_customer_id` - Stripe customer ID
- `stripe_subscription_id` - Stripe subscription ID
- `status` - Subscription status
- `current_period_start` - Subscription period start
- `current_period_end` - Subscription period end
- `translation_count` - Number of translations used
- `created_at` - Record creation timestamp
- `updated_at` - Record update timestamp

### usage_logs table
- `id` - Primary key
- `user_id` - User identifier
- `translation_text` - Translated text (for analytics)
- `source_language` - Source language
- `target_language` - Target language
- `timestamp` - Usage timestamp

## Monitoring and Logs

### View Logs
```bash
# Cloud Run logs
gcloud logs read --service=chrome-extension-translate-backend --limit=50

# Real-time logs
gcloud logs tail --service=chrome-extension-translate-backend
```

### Monitoring
- Cloud Run metrics are available in Google Cloud Console
- Stripe events can be monitored in Stripe Dashboard
- Set up alerting for failed payments or high error rates

## Scaling and Performance

The current setup supports:
- **Automatic scaling**: 0-10 instances based on traffic
- **Concurrency**: 80 requests per instance
- **Memory**: 512Mi per instance
- **CPU**: 1 vCPU per instance

To handle higher load:
```bash
# Update scaling settings
gcloud run services update chrome-extension-translate-backend \
  --region=us-central1 \
  --max-instances=50 \
  --memory=1Gi \
  --cpu=2
```

## Upgrading to PostgreSQL

To upgrade from SQLite to PostgreSQL:

1. Create Cloud SQL instance
2. Update database connection code in `src/models/database.js`
3. Add Cloud SQL proxy to Docker image
4. Update environment variables

## Cost Estimation

**Google Cloud Run** (free tier includes 2M requests/month):
- Beyond free tier: ~$0.40 per 1M requests
- Memory/CPU: ~$0.0000024 per vCPU-second

**Stripe fees**:
- 2.9% + $0.30 per successful charge
- For $0.99 subscription: ~$0.33 fee = $0.66 net revenue

## Security Considerations

✅ **Implemented**:
- HTTPS only
- CORS protection
- Rate limiting
- Webhook signature verification
- Non-root Docker user
- Input validation

🔄 **Consider adding**:
- API key authentication
- Request logging
- DDoS protection
- Database encryption

## Troubleshooting

### Common Issues

1. **Deployment fails**: Check GitHub Actions logs and Google Cloud IAM permissions
2. **Webhook errors**: Verify webhook URL and signature in Stripe Dashboard
3. **CORS errors**: Update `ALLOWED_ORIGINS` environment variable
4. **Database errors**: Check file permissions and disk space

### Debug Commands
```bash
# Check service status
gcloud run services describe chrome-extension-translate-backend --region=us-central1

# Check recent deployments
gcloud run revisions list --service=chrome-extension-translate-backend --region=us-central1

# View environment variables
gcloud run services describe chrome-extension-translate-backend --region=us-central1 --format="value(spec.template.spec.template.spec.containers[0].env[].name,spec.template.spec.template.spec.containers[0].env[].value)"
```

## Next Steps

1. **Test thoroughly** with Stripe test mode
2. **Set up monitoring** and alerting
3. **Switch to production** Stripe keys when ready
4. **Consider adding** user authentication
5. **Implement** email notifications for subscription events
6. **Add** analytics and usage reporting

## Support

For issues:
1. Check Cloud Run logs
2. Check Stripe Dashboard events
3. Verify webhook signatures
4. Test API endpoints directly

The backend is designed to be production-ready with proper error handling, logging, and scalability built in.
