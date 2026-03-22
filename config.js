/**
 * Cloud Run backend base URL (no trailing slash).
 *
 * If translate fails with 404, this URL is wrong or the service was deleted.
 * Get the current URL:
 *   gcloud run services describe chrome-extension-translate-backend \
 *     --region=us-central1 --format='value(status.url)'
 * Then paste it below and reload the extension.
 */
const EXTENSION_BACKEND_BASE_URL =
  'https://chrome-extension-translate-backend-ce42z5mupq-uc.a.run.app';
