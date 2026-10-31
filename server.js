'use strict';

const http = require('node:http');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 3000);
const GEOCODER_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const OVERPASS_ENDPOINT = process.env.OVERPASS_ENDPOINT || 'https://overpass.openstreetmap.fr/api/interpreter';
const OVERPASS_TIMEOUT_MS = 20000;
const QUERY_TIMEOUT_SECONDS = 15;
const MAX_RESULTS = 300;
const CACHE_TTL_MS = 5 * 60 * 1000;
const MIN_REQUEST_GAP_MS = 1100;
const APP_CONTACT = process.env.APP_CONTACT ? ` (${process.env.APP_CONTACT})` : '';
const USER_AGENT = `YojanaSahayak-CentreLocator/1.0${APP_CONTACT}`;
const CORS_ORIGINS = new Set(
  (process.env.CORS_ORIGINS || 'http://127.0.0.1:5500,http://localhost:5500')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
);
const FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/script.js': ['script.js', 'text/javascript; charset=utf-8']
};
const cache = new Map();
const geocodeCache = new Map();
let nextRequest = Promise.resolve();
let lastRequestAt = 0;
let nextGeocodeRequest = Promise.resolve();
let lastGeocodeRequestAt = 0;
let endpointCooldownUntil = 0;

class ProviderError extends Error {
  constructor(message, status = 502, retryAfterMs = null, retryable = false) {
    super(message);
    this.status = status;
    this.retryAfterMs = retryAfterMs;
    this.retryable = retryable;
  }
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(JSON.stringify(body));
}

function buildQuery(latitude, longitude, radiusKm) {
  const around = `(around:${radiusKm * 1000},${latitude},${longitude})`;
  return `[out:json][timeout:${QUERY_TIMEOUT_SECONDS}];(` +
    `nwr["amenity"="hospital"]${around};` +
    `nwr["amenity"="clinic"]${around};` +
    `nwr["amenity"="post_office"]${around};` +
    `nwr["amenity"="townhall"]${around};` +
    `nwr["office"="government"]${around};` +
    `nwr["government"="agriculture"]${around};` +
    `);out center tags ${MAX_RESULTS};`;
}

async function requestProvider(query, attempt = 0) {
  if (endpointCooldownUntil > Date.now()) {
    throw new ProviderError('Overpass is temporarily cooling down after HTTP 406. Retry in a minute.', 503);
  }

  const execute = async () => {
    const wait = MIN_REQUEST_GAP_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
    lastRequestAt = Date.now();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);
    try {
      const response = await fetch(OVERPASS_ENDPOINT, {
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body: new URLSearchParams({ data: query }),
        signal: controller.signal
      });
      if (!response.ok) {
        const detail = (await response.text()).trim().replace(/\s+/g, ' ').slice(0, 240);
        if (response.status === 406) endpointCooldownUntil = Date.now() + 60000;
        const retryAfterHeader = response.headers.get('Retry-After');
        const retryAfterMs = retryAfterHeader
          ? Number.isFinite(Number(retryAfterHeader))
            ? Number(retryAfterHeader) * 1000
            : Math.max(0, Date.parse(retryAfterHeader) - Date.now())
          : null;
        const retryable = response.status === 408 || response.status === 425 ||
          response.status === 429 || response.status >= 500;
        throw new ProviderError(
          `Overpass returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
          response.status,
          retryAfterMs,
          retryable
        );
      }

      const data = await response.json();
      if (!Array.isArray(data.elements)) throw new ProviderError('Overpass returned an invalid response.');
      if (data.remark) throw new ProviderError(`Overpass query failed: ${data.remark}`);
      return data.elements;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (error.name === 'AbortError') throw new ProviderError(`Overpass timed out after ${OVERPASS_TIMEOUT_MS / 1000} seconds.`);
      throw new ProviderError(`Could not reach Overpass: ${error.message}`);
    } finally {
      clearTimeout(timeout);
    }
  };

  const run = nextRequest.then(execute, execute);
  nextRequest = run.then(() => undefined, () => undefined);
  try {
    return await run;
  } catch (error) {
    if (attempt === 0 && error.retryable) {
      const wait = error.retryAfterMs ?? 800;
      if (wait <= 60000) {
        await new Promise(resolve => setTimeout(resolve, wait));
        return requestProvider(query, attempt + 1);
      }
    }
    throw error;
  }
}

async function requestGeocoder(query) {
  const key = query.toLowerCase();
  const cached = geocodeCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.hits;

  const execute = async () => {
    const wait = MIN_REQUEST_GAP_MS - (Date.now() - lastGeocodeRequestAt);
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
    lastGeocodeRequestAt = Date.now();

    const url = new URL(GEOCODER_ENDPOINT);
    url.search = new URLSearchParams({
      format: 'jsonv2',
      addressdetails: '1',
      limit: '5',
      countrycodes: 'in',
      ...( /^\d{6}$/.test(query)
        ? { postalcode: query, country: 'India' }
        : { q: query })
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: controller.signal
      });
      if (!response.ok) {
        const detail = (await response.text()).trim().replace(/\s+/g, ' ').slice(0, 180);
        throw new ProviderError(`Nominatim returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`, response.status);
      }
      const hits = await response.json();
      if (!Array.isArray(hits)) throw new ProviderError('Nominatim returned an invalid response.');
      geocodeCache.set(key, { hits, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
      if (geocodeCache.size > 200) geocodeCache.delete(geocodeCache.keys().next().value);
      return hits;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (error.name === 'AbortError') throw new ProviderError('Nominatim timed out after 12 seconds.');
      throw new ProviderError(`Could not reach Nominatim: ${error.message}`);
    } finally {
      clearTimeout(timeout);
    }
  };

  const run = nextGeocodeRequest.then(execute, execute);
  nextGeocodeRequest = run.then(() => undefined, () => undefined);
  return run;
}

async function getCentres(latitude, longitude, radiusKm) {
  const key = `${latitude.toFixed(5)},${longitude.toFixed(5)},${radiusKm}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.elements;

  const elements = await requestProvider(buildQuery(latitude, longitude, radiusKm));
  cache.set(key, { elements, expiresAt: Date.now() + CACHE_TTL_MS });
  if (cache.size > 100) cache.delete(cache.keys().next().value);
  return elements;
}

async function handleCentres(requestUrl, response) {
  const latitude = Number(requestUrl.searchParams.get('latitude'));
  const longitude = Number(requestUrl.searchParams.get('longitude'));
  const radiusKm = Number(requestUrl.searchParams.get('radius_km'));
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
      ![2, 5, 10, 25].includes(radiusKm)) {
    return sendJson(response, 400, { error: 'Provide valid latitude, longitude and radius_km (2, 5, 10 or 25).' });
  }

  try {
    const elements = await getCentres(latitude, longitude, radiusKm);
    sendJson(response, 200, {
      source: 'OpenStreetMap',
      endpoint: OVERPASS_ENDPOINT,
      fetchedAt: new Date().toISOString(),
      elements
    });
  } catch (error) {
    sendJson(response, error.status || 502, { error: error.message, source: 'OpenStreetMap', endpoint: OVERPASS_ENDPOINT });
  }
}

async function handleGeocode(requestUrl, response) {
  const query = requestUrl.searchParams.get('q')?.trim() || '';
  if (!query || (!/^\d{6}$/.test(query) && query.length < 3)) {
    return sendJson(response, 400, { error: 'Enter at least 3 characters or a 6-digit PIN code.' });
  }
  try {
    const hits = await requestGeocoder(query);
    const filtered = /^\d{6}$/.test(query)
      ? hits.filter(hit => (hit.address?.postcode || '').replace(/\s/g, '') === query)
      : hits;
    sendJson(response, 200, filtered);
  } catch (error) {
    sendJson(response, error.status || 502, { error: error.message, source: 'Nominatim' });
  }
}

async function handleRequest(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (request.method === 'OPTIONS' && ['/api/geocode', '/api/centres'].includes(requestUrl.pathname)) {
    response.writeHead(204, {
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Accept',
      'Access-Control-Max-Age': '600'
    });
    return response.end();
  }
  if (request.method === 'GET' && requestUrl.pathname === '/api/centres') {
    return handleCentres(requestUrl, response);
  }
  if (request.method === 'GET' && requestUrl.pathname === '/api/geocode') {
    return handleGeocode(requestUrl, response);
  }
  if (request.method !== 'GET' || !FILES[requestUrl.pathname]) {
    return sendJson(response, 404, { error: 'Not found.' });
  }

  try {
    const [file, contentType] = FILES[requestUrl.pathname];
    const body = await readFile(path.join(__dirname, file));
    response.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    response.end(body);
  } catch (error) {
    sendJson(response, 500, { error: `Could not read the Centre Locator asset: ${error.message}` });
  }
}

http.createServer((request, response) => {
  const origin = request.headers.origin;
  if (CORS_ORIGINS.has(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
  }
  handleRequest(request, response).catch(error => {
    sendJson(response, 500, { error: `Centre Locator server error: ${error.message}` });
  });
}).listen(PORT, HOST, () => {
  console.log(`Yojana Sahayak Centre Locator: http://${HOST}:${PORT}`);
  console.log(`Overpass endpoint: ${OVERPASS_ENDPOINT}`);
});
