'use strict';

/* ==========================================================
   Centre Locator — live data from OpenStreetMap (Overpass) + Nominatim.
   No sample records exist in this file. Every centre shown comes from an
   API response. Embedded mode hides the module header; add ?standalone
   to the URL to see it while testing.
   ========================================================== */
const CONFIG = {
  API_BASE_URL: location.port === '5500'
    ? `${location.protocol}//${location.hostname}:3000`
    : location.origin,
  GEOCODE_API_URL: '/api/geocode',
  CENTRES_API_URL: '/api/centres',
  REQUEST_TIMEOUT_MS: 25000
};
if (new URLSearchParams(location.search).has('standalone')) {
  document.body.classList.add('standalone');
  document.getElementById('standaloneHeader')?.removeAttribute('hidden');
}

const SCHEMES = [
  { id: 'pmkisan', name: 'PM-KISAN Samman Nidhi', help: 'Registration, e-KYC and document support.', relevant: ['agri', 'csc', 'govt'] },
  { id: 'pmjay',   name: 'Ayushman Bharat PM-JAY', help: 'Health-scheme enrolment and hospital information.', relevant: ['health', 'csc'] },
  { id: 'pmay',    name: 'Pradhan Mantri Awas Yojana', help: 'Housing application and document assistance.', relevant: ['govt', 'csc'] },
  { id: 'pmfby',   name: 'PM Fasal Bima Yojana', help: 'Crop-insurance enrolment and claim guidance.', relevant: ['agri', 'csc'] },
  { id: 'ssy',     name: 'Sukanya Samriddhi Yojana', help: 'Account-opening and KYC guidance.', relevant: ['post', 'csc'] }
];
const CATEGORIES = {
  csc:    { label: 'CSC (name-based)',   short: 'CSC',         color: '#157a53', glyph: 'C' },
  agri:   { label: 'Agriculture Office', short: 'Agriculture', color: '#6a9a1f', glyph: 'A' },
  govt:   { label: 'Government Office',  short: 'Govt Office', color: '#d9791a', glyph: 'G' },
  health: { label: 'Healthcare Facility', short: 'Healthcare', color: '#c0345c', glyph: '+' },
  post:   { label: 'Post Office',        short: 'Post Office', color: '#2f6fb0', glyph: 'P' }
};

/* ---------- state + helpers ---------- */
const state = { scheme: SCHEMES[0].id, loc: null, radius: 10, cat: 'all', query: '', sort: 'near', relevantOnly: false,
                all: [], phase: 'idle', error: null, skipped: 0, selectedId: null };
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const hasCoords = c => Number.isFinite(c.latitude) && Number.isFinite(c.longitude);
const currentScheme = () => SCHEMES.find(s => s.id === state.scheme);
const isPotential = c => currentScheme().relevant.includes(c.category);

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371, rad = d => d * Math.PI / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
const formatDistance = km => km == null ? '' : km < 1 ? `${Math.round(km * 100) * 10} m` : `${km.toFixed(1)} km`;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2800);
}
function setStatus(kind, html) { const s = $('status'); s.className = 'status ' + kind; s.innerHTML = html; }
function setLocationNote(text, kind = 'warn') { $('locStatus').className = 'loc-status ' + kind; $('locText').textContent = text; }

/* ==========================================================
   DATA LAYER — Nominatim geocoding + Overpass place search
   ========================================================== */
const geoCache = new Map();

class APIRequestError extends Error {
  constructor(message, { status = null, retryable = false, retryAfterMs = null } = {}) {
    super(message);
    this.name = 'APIRequestError';
    this.status = status;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
  }
}

async function fetchJson(url, options = {}) {
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), CONFIG.REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...options,
      headers: { Accept: 'application/json', ...options.headers },
      signal: ctrl.signal
    });
    if (!res.ok) {
      const body = (await res.text()).trim().replace(/\s+/g, ' ').slice(0, 240);
      const retryAfter = res.headers.get('Retry-After');
      const retryAfterMs = retryAfter
        ? Number.isFinite(Number(retryAfter)) ? Number(retryAfter) * 1000 : Math.max(0, Date.parse(retryAfter) - Date.now())
        : null;
      const retryable = res.status === 408 || res.status === 425 || res.status === 429 || res.status >= 500;
      throw new APIRequestError(
        `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}${body ? ` — ${body}` : ''}`,
        { status: res.status, retryable, retryAfterMs }
      );
    }
    try { return await res.json(); }
    catch { throw new APIRequestError('Service returned invalid JSON'); }
  } catch (e) {
    if (e instanceof APIRequestError) throw e;
    if (e.name === 'AbortError') throw new APIRequestError(`Request timed out after ${CONFIG.REQUEST_TIMEOUT_MS / 1000} seconds`, { retryable: true });
    const detail = e instanceof TypeError && location.port === '5500'
      ? `Cannot reach the Centre Locator backend at ${CONFIG.API_BASE_URL}. Start it with “node server.js” in the project folder.`
      : e.message;
    throw new APIRequestError(detail, { retryable: e instanceof TypeError });
  }
  finally { clearTimeout(timer); }
}

/* Returns an array of candidate locations (possibly empty). Never substitutes a different place. */
async function geocode(text) {
  const key = text.trim().toLowerCase();
  if (geoCache.has(key)) return geoCache.get(key);
  if (location.protocol === 'file:') {
    throw new Error('Start the Centre Locator backend with “node server.js” and open http://localhost:3000 to search live centres.');
  }
  const isPin = /^\d{6}$/.test(text);
  const url = new URL(CONFIG.GEOCODE_API_URL, CONFIG.API_BASE_URL);
  url.search = new URLSearchParams({ q: text });
  let hits = await fetchJson(url);
  if (isPin) hits = hits.filter(h => (h.address?.postcode || '').replace(/\s/g, '') === text);   // PIN must actually match
  const out = hits.map(h => ({ lat: +h.lat, lng: +h.lon, name: h.display_name, importance: h.importance || 0, pin: isPin, typed: text }));
  geoCache.set(key, out); return out;
}

/* Assign a category only from evidence in the OSM tags. Returns null if not relevant. */
function classify(t) {
  const name = t.name || t['name:en'] || '';
  if (t.amenity === 'hospital' || t.amenity === 'clinic') return { category: 'health', note: null };
  if (t.amenity === 'post_office') return { category: 'post', note: null };
  if (t.government === 'agriculture') return { category: 'agri', note: null };
  if (/\b(csc|common service|jan ?seva|jan ?suvidha)\b/i.test(name)) return { category: 'csc', note: 'Classified from its name. Not confirmed as an authorised CSC.' };
  if (!t.shop && /krishi|agricultur|kisan/i.test(name) && (t.office || t.amenity)) return { category: 'agri', note: 'Classified from its name.' };
  if (t.office === 'government' || t.amenity === 'townhall') return { category: 'govt', note: null };
  return null;
}
function buildAddress(t) {
  const parts = t['addr:full'] ? [t['addr:full']] : [t['addr:housenumber'], t['addr:street'], t['addr:suburb'] || t['addr:neighbourhood'], t['addr:city'] || t['addr:district'], t['addr:postcode']];
  return parts.filter(Boolean).join(', ') || null;
}
function parseElement(el) {
  const t = el.tags || {}, name = t.name || t['name:en'], cls = classify(t);
  const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
  if (!name || !cls || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { id: `osm-${el.type}-${el.id}`, name, category: cls.category, classificationNote: cls.note, latitude: lat, longitude: lon,
    address: buildAddress(t), sourceName: 'OpenStreetMap', sourceUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`, sourceType: 'Community-maintained map data',
    externalPlaceId: `${el.type}/${el.id}`, supportedServices: null, phone: t.phone || t['contact:phone'] || null,
    openingHours: t.opening_hours || null, verificationStatus: 'osm_listed', lastVerified: t.check_date || null };
}
function dedupe(list) {                                           // same name within 50 m = same physical place
  const kept = [];
  list.forEach(c => { if (!kept.some(k => k.name.toLowerCase() === c.name.toLowerCase() && haversineKm(k.latitude, k.longitude, c.latitude, c.longitude) < 0.05)) kept.push(c); });
  return kept;
}
const placeCache = new Map(), PLACE_CACHE_TTL_MS = 5 * 60 * 1000;
async function fetchCentres(lat, lng, radiusKm) {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)},${radiusKm}`;
  const cached = placeCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.result;
  if (cached) placeCache.delete(key);
  if (location.protocol === 'file:') {
    throw new Error('Start the Centre Locator backend with “node server.js” and open http://localhost:3000 to search live centres.');
  }
  const url = new URL(CONFIG.CENTRES_API_URL, CONFIG.API_BASE_URL);
  url.search = new URLSearchParams({ latitude: lat, longitude: lng, radius_km: radiusKm });
  const data = await fetchJson(url);
  if (!Array.isArray(data.elements)) throw new Error('Centre service returned an invalid response.');
  const parsed = data.elements.map(parseElement);
  const result = { centres: dedupe(parsed.filter(Boolean)), skipped: parsed.filter(p => !p).length };
  placeCache.set(key, { result, expiresAt: Date.now() + PLACE_CACHE_TTL_MS });
  return result;
}

/* ==========================================================
   FILTERING
   ========================================================== */
function visibleCentres() {
  const q = state.query.trim().toLowerCase();
  return state.all
    .map(c => ({ ...c, dist: state.loc ? haversineKm(state.loc.lat, state.loc.lng, c.latitude, c.longitude) : null }))
    .filter(c => c.dist == null || c.dist <= state.radius)
    .filter(c => state.cat === 'all' || c.category === state.cat)
    .filter(c => !q || `${c.name} ${c.address || ''}`.toLowerCase().includes(q))
    .filter(c => !state.relevantOnly || isPotential(c))
    .sort((a, b) => state.sort === 'name' ? a.name.localeCompare(b.name) : (a.dist ?? 1e9) - (b.dist ?? 1e9));
}

/* ==========================================================
   MAP
   ========================================================== */
let map, markerLayer, youMarker, markers = {}, tileOk = 0, tileFail = 0;
function pinIcon(cat, selected) {
  const c = CATEGORIES[cat];
  return L.divIcon({ className: '', iconSize: selected ? [38, 38] : [30, 30], iconAnchor: selected ? [19, 38] : [15, 30], popupAnchor: [0, -30],
    html: `<div class="pin ${selected ? 'sel' : ''}" style="background:${c.color}"><span>${c.glyph}</span></div>` });
}
function showMapMessage(html) { const m = $('mapMsg'); m.innerHTML = html; m.hidden = false; }
function initMap() {
  if (typeof L === 'undefined') { showMapMessage('<b>The map library could not be loaded.</b><p>Check your internet connection.</p><button class="btn primary" onclick="location.reload()">Retry</button>'); return; }
  map = L.map('map').setView([22.9, 79.6], 5);                    // neutral view of India, not a user location
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
  tiles.on('tileload', () => { tileOk++; $('mapMsg').hidden = true; });
  tiles.on('tileerror', () => { if (++tileFail >= 4 && !tileOk) showMapMessage('<b>Map tiles could not be loaded.</b><p>Map tiles need an internet connection.</p><button class="btn primary" id="retryTiles">Retry</button>'); });
  document.addEventListener('click', e => { if (e.target.id === 'retryTiles') { tileFail = 0; tiles.redraw(); $('mapMsg').hidden = true; } });
  markerLayer = L.layerGroup().addTo(map);
  $('legend').innerHTML = Object.values(CATEGORIES).map(c => `<span><i style="background:${c.color}"></i>${c.short}</span>`).join('');
}
function drawMarkers(list) {
  if (!map) return;
  markerLayer.clearLayers(); markers = {};
  list.filter(hasCoords).forEach(c => {
    const m = L.marker([c.latitude, c.longitude], { icon: pinIcon(c.category, c.id === state.selectedId), title: c.name });
    m.bindPopup(`<div class="pop"><b>${esc(c.name)}</b>${c.dist != null ? esc(formatDistance(c.dist)) + ' (approx. straight line)<br>' : ''}<button type="button" data-view-id="${esc(c.id)}">View Details</button></div>`);
    m.on('click', () => selectCentre(c.id, { pan: false }));
    m.addTo(markerLayer); markers[c.id] = m;
  });
}
function fitResults() {
  if (!map) return;
  const pts = Object.values(markers).map(m => m.getLatLng());
  if (state.loc) pts.push([state.loc.lat, state.loc.lng]);
  if (pts.length > 1) map.fitBounds(L.latLngBounds(pts).pad(0.15), { maxZoom: 15 });
  else if (pts.length) map.setView(pts[0], 13);
}
function drawYou() {
  if (!map) return;
  youMarker?.remove(); youMarker = null;
  if (state.loc) youMarker = L.marker([state.loc.lat, state.loc.lng], { icon: L.divIcon({ className: '', html: '<div class="you"></div>', iconSize: [16, 16] }), interactive: false, keyboard: false }).addTo(map);
}

/* ==========================================================
   RENDERING
   ========================================================== */
function render({ fit = false } = {}) {
  const list = visibleCentres();
  if (state.selectedId && !list.some(c => c.id === state.selectedId)) state.selectedId = null;
  $('count').textContent = state.phase === 'loading' ? 'Searching…' : state.phase === 'idle' ? 'No search yet' : `${list.length} centre${list.length === 1 ? '' : 's'} found`;
  renderCards(list); drawMarkers(list); renderDetails(list.find(c => c.id === state.selectedId));
  if (fit) fitResults();
}
function renderCards(list) {
  const ul = $('cards');
  if (state.phase === 'idle') { ul.innerHTML = '<li class="empty"><b>Search to begin</b>Enter a city, locality or PIN code, or use your location.</li>'; return; }
  if (state.phase === 'loading') { ul.innerHTML = '<li class="empty">Searching OpenStreetMap data…</li>'; return; }
  if (state.phase === 'error') { ul.innerHTML = `<li class="empty"><b>The search failed</b>${esc(state.error)}<br><button class="btn primary" id="retryLoad">Retry</button></li>`; return; }
  if (!list.length) {
    ul.innerHTML = `<li class="empty"><b>No matching centres found in the available data for this location and search radius.</b>This does not mean no centres exist here — OpenStreetMap may be incomplete.<br>
      <button class="btn" data-recover="radius">Increase radius</button> <button class="btn" data-recover="filters">Clear filters</button></li>`;
    return;
  }
  ul.innerHTML = list.map(c => {
    const cat = CATEGORIES[c.category];
    return `<li><button class="card ${c.id === state.selectedId ? 'sel' : ''}" data-id="${esc(c.id)}" aria-pressed="${c.id === state.selectedId}">
      <span class="glyph" style="background:${cat.color}">${cat.glyph}</span>
      <span class="txt"><span class="row"><b>${esc(c.name)}</b><span class="dist">${esc(formatDistance(c.dist))}</span></span>
      <small>${esc(c.address || 'Address not available')}</small><small class="meta">${esc(cat.label)}${isPotential(c) ? ' · Potential match' : ''}</small></span>
      <span class="arrow" aria-hidden="true">›</span></button></li>`;
  }).join('');
}
function directionsUrl(c) {
  const dest = hasCoords(c) ? `${c.latitude},${c.longitude}` : (c.address ? encodeURIComponent(c.address) : null);
  return dest ? `https://www.google.com/maps/dir/?api=1&destination=${dest}` : null;
}
const validPhone = p => typeof p === 'string' && /^\+?[0-9\s-]{8,15}$/.test(p.trim());
const VERIFY = { osm_listed: 'Listed on OpenStreetMap — not officially verified', verified: 'Officially verified', pending: 'Verification pending', unverified: 'Unverified' };

function renderDetails(c) {
  const d = $('details');
  if (!c) { d.innerHTML = '<p class="ph">Select a centre on the map or from the list to see details.</p>'; d.classList.remove('open'); return; }
  const cat = CATEGORIES[c.category], sch = currentScheme();
  d.innerHTML = `
    <div class="d-top"><span class="glyph" style="background:${cat.color}">${cat.glyph}</span>
      <div><h2>${esc(c.name)}</h2><span class="tag">${esc(cat.label)}</span></div>
      <button class="close" id="closeDetails" aria-label="Close details">✕</button></div>
    <p class="addr">${esc(c.address || 'Address not available in source')}${c.dist != null ? `<br><b>${esc(formatDistance(c.dist))}</b> approx. straight-line distance` : ''}</p>
    <div class="acts">
      <button class="btn primary" data-act="directions">Get Directions</button>
      ${validPhone(c.phone) ? '<button class="btn" data-act="call">Call</button>' : ''}
      <button class="btn" data-act="share">Share Centre</button>
      ${c.address ? '<button class="btn" data-act="copy">Copy Address</button>' : ''}</div>
    <div class="sec"><h3>Relevance to ${esc(sch.name)}</h3>
      <p class="note">${isPotential(c) ? 'Potential match based on the type of place. ' : 'No relevance rule for this scheme and place type. '}Services offered and scheme authorisation are not confirmed by this data.</p>
      ${c.classificationNote ? `<p class="note" style="margin-top:6px">${esc(c.classificationNote)}</p>` : ''}</div>
    <div class="sec"><h3>Details</h3><div class="kv">
      <span>Services</span><span>Not available from this source</span>
      <span>Hours</span><span>${esc(c.openingHours || 'Not available')}</span>
      <span>Phone</span><span>${esc(c.phone || 'Not available')}</span></div></div>
    <div class="sec"><h3>Source</h3><div class="kv">
      <span>Source</span><span><a href="${esc(c.sourceUrl)}" target="_blank" rel="noopener">${esc(c.sourceName)}</a> (${esc(c.sourceType)})</span>
      <span>Status</span><span>${esc(VERIFY[c.verificationStatus])}</span>
      <span>Last checked</span><span>${esc(c.lastVerified || 'Not available')}</span></div></div>`;
  d.classList.add('open');
}
function selectCentre(id, { pan = true } = {}) {
  const prev = state.selectedId; state.selectedId = id;
  const list = visibleCentres(), c = list.find(x => x.id === id);
  if (prev && markers[prev]) markers[prev].setIcon(pinIcon(list.find(x => x.id === prev)?.category, false));
  if (c && markers[id]) { markers[id].setIcon(pinIcon(c.category, true)); if (pan && map) { map.flyTo(markers[id].getLatLng(), Math.max(map.getZoom(), 15), { duration: .5 }); markers[id].openPopup(); } }
  renderCards(list); renderDetails(c);
  document.querySelector('.card.sel')?.scrollIntoView({ block: 'nearest' });
}

/* ==========================================================
   SEARCH FLOW
   ========================================================== */
function setLocation(loc) {
  state.loc = loc; $('choices').hidden = true;
  setLocationNote(`${loc.pin ? 'PIN area (approximate centre): ' : ''}${loc.name}`, 'ok');
  if (map) map.setView([loc.lat, loc.lng], 13);
  drawYou();
}
function showChoices(options) {
  const box = $('choices');
  box.innerHTML = '<p>Several places match. Which did you mean?</p>' + options.map((o, i) => `<button type="button" data-choice="${i}">${esc(o.name)}</button>`).join('');
  box.hidden = false; box._options = options;
  setStatus('warn', 'Please choose the intended location above.');
}
async function runSearch() {
  const text = $('place').value.trim(), btn = $('searchBtn'); btn.disabled = true;
  state.radius = +$('radius').value;
  try {
    if (text && (!state.loc || state.loc.typed !== text)) {
      if (!/^\d{6}$/.test(text) && text.length < 3) throw new Error('Enter at least 3 characters, or a 6-digit PIN code.');
      setStatus('', 'Looking up location…');
      let options;
      try { options = await geocode(text); } catch (e) { throw new Error(`Location lookup failed: ${e.message}`); }
      if (!options.length) { state.all = []; state.phase = 'idle'; render(); return setStatus('warn', /^\d{6}$/.test(text) ? 'No location matched that PIN code exactly. Try the city or locality name.' : 'Location not found. Try a nearby locality, city or PIN code.'); }
      if (options.length > 1 && options[0].importance - options[1].importance < 0.15) { showChoices(options); return; }
      setLocation(options[0]);
    }
    if (!state.loc) { setStatus('warn', 'Enter a place or use your location first.'); return; }
    await loadCentres(true);
  } catch (e) { state.all = []; state.phase = 'error'; state.error = e.message; render(); setStatus('err', esc(e.message)); }
  finally { btn.disabled = false; }
}
async function loadCentres(fit) {
  state.phase = 'loading'; state.selectedId = null; state.all = []; render();      // never keep results from a previous search
  setStatus('', 'Searching OpenStreetMap data…');
  try {
    const { centres, skipped } = await fetchCentres(state.loc.lat, state.loc.lng, state.radius);
    state.all = centres; state.skipped = skipped; state.phase = 'done'; render({ fit });
    setStatus(centres.length ? '' : 'warn',
      `<b>Live data search</b> · Source: OpenStreetMap · ${centres.length} listing${centres.length === 1 ? '' : 's'} within ${state.radius} km of the search point · Listings are not officially verified.` +
      (skipped ? ` ${skipped} record(s) without a usable name or location were left out.` : ''));
  } catch (e) {
    state.phase = 'error'; state.error = `Could not reach the place-data service (${e.message}).`; render();
    setStatus('err', `Search failed. No results are shown. ${esc(e.message)} <button class="btn" type="button" data-retry-search>Retry</button>`);
  }
}
function useMyLocation() {
  if (!navigator.geolocation) return setLocationNote('This browser does not support location. Search a place instead.');
  setLocationNote('Waiting for location permission…');
  navigator.geolocation.getCurrentPosition(
    p => { $('place').value = ''; setLocation({ lat: p.coords.latitude, lng: p.coords.longitude, name: 'Your current location (device-reported)', typed: null }); runSearch(); },
    err => setLocationNote(err.code === 1 ? 'Location permission was denied. Type a city, locality or PIN code instead.' : 'Could not detect your location. Type a place instead.'),
    { timeout: 10000 });
}

/* ==========================================================
   EVENTS + INIT
   ========================================================== */
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
function clearFilters() {
  Object.assign(state, { cat: 'all', query: '', relevantOnly: false });
  $('centreSearch').value = ''; $('relevantOnly').checked = false;
  document.querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', x.dataset.cat === 'all'));
}
function setView(v) {
  document.querySelector('.layout').dataset.view = v;
  document.querySelectorAll('.view-toggle button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  if (v === 'map' && map) setTimeout(() => map.invalidateSize(), 50);
}
function bindEvents() {
  $('scheme').addEventListener('change', e => { state.scheme = e.target.value; $('schemeHelp').textContent = currentScheme().help; render(); });
  $('searchBtn').addEventListener('click', runSearch);
  $('status').addEventListener('click', e => {
    if (e.target.closest('[data-retry-search]')) loadCentres(true);
  });
  $('place').addEventListener('keydown', e => { if (e.key === 'Enter') runSearch(); });      // searches run on Enter/click only, never per keystroke
  $('useLoc').addEventListener('click', useMyLocation);
  $('radius').addEventListener('change', () => { state.radius = +$('radius').value; if (state.loc) loadCentres(true); });
  $('centreSearch').addEventListener('input', debounce(e => { state.query = e.target.value; render(); }, 200));
  $('sort').addEventListener('change', e => { state.sort = e.target.value; render(); });
  $('relevantOnly').addEventListener('change', e => { state.relevantOnly = e.target.checked; render(); });
  $('fitBtn').addEventListener('click', fitResults);
  $('lang').addEventListener('change', () => toast('Language switching will be handled by the main website.'));
  $('choices').addEventListener('click', e => {
    const b = e.target.closest('[data-choice]'); if (!b) return;
    setLocation($('choices')._options[+b.dataset.choice]); loadCentres(true);
  });
  $('chips').addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    state.cat = b.dataset.cat; document.querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', x === b)); render({ fit: true });
  });
  $('cards').addEventListener('click', e => {
    const card = e.target.closest('.card');
    if (card) { selectCentre(card.dataset.id); if (matchMedia('(max-width:760px)').matches) setView('map'); return; }
    if (e.target.id === 'retryLoad') return state.loc ? loadCentres(true) : runSearch();
    const r = e.target.dataset.recover;
    if (r === 'filters') { clearFilters(); render({ fit: true }); }
    if (r === 'radius') { const sel = $('radius'), i = Math.min(sel.selectedIndex + 1, sel.options.length - 1); sel.selectedIndex = i; state.radius = +sel.value; loadCentres(true); }
  });
  document.addEventListener('click', e => { const v = e.target.closest('[data-view-id]'); if (v) { selectCentre(v.dataset.viewId, { pan: false }); map?.closePopup(); } });
  $('details').addEventListener('click', e => {
    if (e.target.id === 'closeDetails') { state.selectedId = null; render(); return; }
    const act = e.target.closest('[data-act]')?.dataset.act; if (act) centreAction(act);
  });
  document.querySelectorAll('.view-toggle button').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
}
async function centreAction(act) {
  const c = visibleCentres().find(x => x.id === state.selectedId); if (!c) return;
  if (act === 'directions') { const url = directionsUrl(c); return url ? window.open(url, '_blank', 'noopener') : toast('No location or address is available for directions.'); }
  if (act === 'call') return validPhone(c.phone) ? (location.href = `tel:${c.phone.replace(/[^\d+]/g, '')}`) : toast('No valid phone number available.');
  const text = act === 'copy' ? c.address : `${c.name}${c.address ? ', ' + c.address : ''}\n${directionsUrl(c) || ''}`.trim();
  if (act === 'share' && navigator.share) { try { await navigator.share({ title: c.name, text }); } catch { /* cancelled */ } return; }
  try { await navigator.clipboard.writeText(text); toast(act === 'copy' ? 'Address copied' : 'Centre details copied'); }
  catch { toast('Could not copy. Please select and copy the text manually.'); }
}
function init() {
  $('scheme').innerHTML = SCHEMES.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  $('schemeHelp').textContent = currentScheme().help;
  $('chips').innerHTML = [['all', 'All'], ...Object.entries(CATEGORIES).map(([k, v]) => [k, v.short])]
    .map(([k, l]) => `<button class="chip" data-cat="${k}" aria-pressed="${k === 'all'}">${l}</button>`).join('');
  setStatus('', '<b>Live data search</b> · Source: OpenStreetMap · Listings are not officially verified.');
  initMap(); bindEvents(); render();
}
document.addEventListener('DOMContentLoaded', init);