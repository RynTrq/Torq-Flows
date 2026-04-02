import 'server-only';

function normalizeUrl(url: string) {
  const trimmed = url.trim().replace(/\/+$/, '');

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `http://${trimmed}`;
}

export function getBackendBaseUrl() {
  const configured = process.env.BACKEND_API_URL?.trim();

  if (configured) {
    return normalizeUrl(configured);
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('BACKEND_API_URL is required in production.');
  }

  return 'http://127.0.0.1:8000';
}
