'use strict';

/* ==========================================================
   CONFIG — set API_BASE_URL to your FastAPI server to leave demo mode.
   Leave it empty ('') to run on the demo data below.
   ========================================================== */
const CONFIG = {
  API_BASE_URL: '',                       // e.g. 'http://localhost:8000'
  GEOCODER_URL: 'https://nominatim.openstreetmap.org/search',
  DEFAULT_VIEW: [26.8467, 80.9462],       // map starting view only (not the user's location)
  DEMO_LOCATION: { lat: 26.8467, lng: 80.9462, label: 'Demo location: Hazratganj, Lucknow (sample, not your location)' }
};

/* ==========================================================
   REFERENCE DATA
   ========================================================== */
const SCHEMES = [
  { id: 'pmkisan', name: 'PM-KISAN Samman Nidhi', help: 'Registration, e-KYC, Aadhaar seeding and document support.' },
  { id: 'pmjay', name: 'Ayushman Bharat PM-JAY', help: 'Card enrolment help and health-scheme guidance.' },
  { id: 'pmay', name: 'Pradhan Mantri Awas Yojana', help: 'Housing application and document assistance.' },
  { id: 'pmfby', name: 'PM Fasal Bima Yojana', help: 'Crop-insurance enrolment and claim guidance.' },
  { id: 'ssy', name: 'Sukanya Samriddhi Yojana', help: 'Account-opening and KYC guidance.' }
];

const CATEGORIES = {
  csc:    { label: 'CSC Centre',        short: 'CSC',         color: '#157a53', glyph: 'C' },
  agri:   { label: 'Agriculture Office', short: 'Agriculture', color: '#6a9a1f', glyph: 'A' },
  govt:   { label: 'Government Office',  short: 'Govt Office', color: '#d9791a', glyph: 'G' },
  health: { label: 'Healthcare Centre',  short: 'Healthcare',  color: '#c0345c', glyph: '+' }
};

/* ==========================================================
   DEMO DATA — illustrative only. Names, places, services and hours
   are NOT verified and are not real government records.
   Replace with the result of GET /api/centres.
   ========================================================== */
const H = (days, open, close, dayNums) => ({ days, open, close, dayNums });
const MON_SAT = H('Mon–Sat', '09:00', '18:00', [1, 2, 3, 4, 5, 6]);
const MON_FRI = H('Mon–Fri', '10:00', '17:00', [1, 2, 3, 4, 5]);

const DEMO_CENTRES = [
  { id: 'c1', name: 'Pragati Seva CSC Kendra', category: 'csc', latitude: 26.8512, longitude: 80.9395,
    address: 'Main Bazaar Road, Near Tehsil Office', openingHours: MON_SAT, phone: null,
    services: { pmkisan: ['New registration support', 'e-KYC assistance', 'Aadhaar seeding guidance', 'Document scanning and upload', 'Application status guidance'],
                pmay: ['Application form help', 'Document scanning'], ssy: ['KYC document guidance'] } },
  { id: 'c2', name: 'Krishi Seva Kendra', category: 'agri', latitude: 26.8601, longitude: 80.9553,
    address: 'Collectorate Complex, Block B', openingHours: MON_FRI, phone: null,
    services: { pmkisan: ['Farmer registration help', 'Land record guidance', 'Beneficiary status guidance'],
                pmfby: ['Crop-insurance enrolment help', 'Claim form guidance'] } },
  { id: 'c3', name: 'Tehsil Sahayata Kendra', category: 'govt', latitude: 26.8379, longitude: 80.9301,
    address: 'Tehsil Road, Hazratganj', openingHours: MON_FRI, phone: null,
    services: { pmkisan: ['Land record verification help'], pmay: ['Housing application guidance', 'Income certificate help'] } },
  { id: 'c4', name: 'District Hospital Help Desk', category: 'health', latitude: 26.8723, longitude: 80.9210,
    address: 'Civil Lines', openingHours: H('Every day', '08:00', '20:00', [0, 1, 2, 3, 4, 5, 6]), phone: null,
    services: { pmjay: ['Card enrolment guidance', 'Eligible hospital information', 'Document checklist'] } },
  { id: 'c5', name: 'Jan Seva Kendra', category: 'csc', latitude: 26.8294, longitude: 80.9716,
    address: 'Panchayat Bhawan, Aliganj', openingHours: MON_SAT, phone: null,
    services: { pmkisan: ['e-KYC assistance'], pmjay: ['Card print and e-KYC help'], pmay: ['Online application help'], ssy: ['Account form help', 'Document upload'] } },
  { id: 'c6', name: 'Gramin Bima Sahayata Desk', category: 'agri', latitude: 26.8049, longitude: 80.9188,
    address: 'Krishi Bhawan Road, Aminabad', openingHours: MON_FRI, phone: null,
    services: { pmfby: ['Crop-insurance enrolment help', 'Premium information'], pmkisan: ['Registration support'] } },
  { id: 'c7', name: 'Nagar Awas Sahayata Kendra', category: 'govt', latitude: 26.8890, longitude: 80.9820,
    address: 'Municipal Office, Indira Nagar', openingHours: null, phone: null,
    services: { pmay: ['Beneficiary list guidance', 'Application status help', 'Document checklist'] } },
  { id: 'c8', name: 'Samriddhi Seva Point', category: 'csc', latitude: 26.8180, longitude: 80.9890,
    address: 'Gomti Nagar Market', openingHours: MON_SAT, phone: null,
    services: { ssy: ['Account-opening guidance', 'KYC document help'], pmay: ['Form filling help'] } },
  { id: 'c9', name: 'Community Health Help Point', category: 'health', latitude: 26.8410, longitude: 80.9005,
    address: 'Near Bus Stand, Charbagh', openingHours: H('Mon–Sat', '09:00', '17:00', [1, 2, 3, 4, 5, 6]), phone: null,
    services: { pmjay: ['Enrolment help', 'Health-card status guidance'] } },
  { id: 'c10', name: 'Kisan Suvidha Kendra', category: 'agri', latitude: 26.9150, longitude: 81.0300,
    address: 'Mandi Samiti, Outer Ring Road', openingHours: MON_SAT, phone: null,
    services: { pmkisan: ['Registration support', 'e-KYC assistance'], pmfby: ['Enrolment help'] } }
].map(c => ({ ...c, verificationStatus: 'unverified', dataSource: 'Demo data (illustrative sample)' }));

/* ==========================================================
   API SERVICE LAYER
   Proposed contracts (NOT confirmed routes):
     GET /api/schemes
     GET /api/centres?scheme_id=&latitude=&longitude=&radius_km=
     GET /api/centres/{centre_id}
   Expected centre shape = the demo record shape above.
   ========================================================== */
const api = {
  isDemo: () => !CONFIG.API_BASE_URL,
  async getCentres({ schemeId, latitude, longitude, radiusKm }) {
    if (api.isDemo()) return DEMO_CENTRES;          // demo mode only; live failures are never hidden
    const q = new URLSearchParams({ scheme_id: schemeId, radius_km: radiusKm });
    if (latitude != null) { q.set('latitude', latitude); q.set('longitude', longitude); }
    const res = await fetch(`${CONFIG.API_BASE_URL}/api/centres?${q}`);
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    return res.json();
  }
};

/* ==========================================================
   STATE + HELPERS
   ========================================================== */
const state = { scheme: SCHEMES[0].id, loc: null, radius: 5, cat: 'all', query: '', sort: 'near', openNow: false,
                all: [], error: null, loading: false, selectedId: null };
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const hasCoords = c => Number.isFinite(c.latitude) && Number.isFinite(c.longitude);

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371, rad = d => d * Math.PI / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
const formatDistance = km => km == null ? '' : km < 1 ? `${Math.round(km * 1000 / 10) * 10} m` : `${km.toFixed(1)} km`;
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fmtTime = t => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };

function openStatus(c) {
  const h = c.openingHours;
  if (!h) return null;
  const now = new Date(), mins = now.getHours() * 60 + now.getMinutes();
  const open = h.dayNums.includes(now.getDay()) && mins >= toMin(h.open) && mins < toMin(h.close);
  return { open, text: open ? `Open · closes ${fmtTime(h.close)}` : `Closed now · ${h.days} ${fmtTime(h.open)}` };
}
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2800);
}
const currentScheme = () => SCHEMES.find(s => s.id === state.scheme);
const servicesFor = c => c.services?.[state.scheme] || [];

/* Scheme matching: a centre is shown when its OWN listed services include the scheme.
   This is relevance only — it never implies official authorisation. */
function visibleCentres() {
  const q = state.query.trim().toLowerCase();
  const list = state.all
    .filter(c => servicesFor(c).length > 0)
    .map(c => ({ ...c, dist: state.loc && hasCoords(c) ? haversineKm(state.loc.lat, state.loc.lng, c.latitude, c.longitude) : null }))
    .filter(c => c.dist == null || c.dist <= state.radius)
    .filter(c => state.cat === 'all' || c.category === state.cat)
    .filter(c => !q || `${c.name} ${c.address}`.toLowerCase().includes(q))
    .filter(c => !state.openNow || openStatus(c)?.open);
  return list.sort((a, b) => state.sort === 'name' || (a.dist == null && b.dist == null)
    ? a.name.localeCompare(b.name) : (a.dist ?? 1e9) - (b.dist ?? 1e9));
}

/* ==========================================================
   MAP
   ========================================================== */
let map, markerLayer, youMarker, markers = {}, tileOk = 0, tileFail = 0;

function pinIcon(cat, selected) {
  const c = CATEGORIES[cat] || { color: '#6d5acd', glyph: '•' };
  return L.divIcon({ className: '', iconSize: selected ? [38, 38] : [30, 30], iconAnchor: selected ? [19, 38] : [15, 30], popupAnchor: [0, -30],
    html: `<div class="pin ${selected ? 'sel' : ''}" style="background:${c.color}"><span>${c.glyph}</span></div>` });
}
function showMapMessage(html) { const m = $('mapMsg'); m.innerHTML = html; m.hidden = false; }

function initMap() {
  if (typeof L === 'undefined') {
    showMapMessage('<b>The map library could not be loaded.</b><p>Check your internet connection. The centre list still works.</p><button class="btn primary" onclick="location.reload()">Retry</button>');
    return;
  }
  map = L.map('map', { zoomControl: true }).setView(CONFIG.DEFAULT_VIEW, 12);
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  tiles.on('tileload', () => { tileOk++; $('mapMsg').hidden = true; });
  tiles.on('tileerror', () => {
    tileFail++;
    if (tileFail >= 4 && tileOk === 0) showMapMessage('<b>Map tiles could not be loaded.</b><p>Map tiles need an internet connection.</p><button class="btn primary" id="retryTiles">Retry</button>');
  });
  document.addEventListener('click', e => { if (e.target.id === 'retryTiles') { tileFail = 0; tiles.redraw(); $('mapMsg').hidden = true; } });
  markerLayer = L.layerGroup().addTo(map);
  $('legend').innerHTML = Object.values(CATEGORIES).map(c => `<span><i style="background:${c.color}"></i>${c.short}</span>`).join('');
}

function drawMarkers(list) {
  if (!map) return;
  markerLayer.clearLayers(); markers = {};
  list.filter(hasCoords).forEach(c => {
    const m = L.marker([c.latitude, c.longitude], { icon: pinIcon(c.category, c.id === state.selectedId), title: c.name, keyboard: true });
    m.bindPopup(`<div class="pop"><b>${esc(c.name)}</b>${c.dist != null ? esc(formatDistance(c.dist)) + ' away (straight line)<br>' : ''}<button type="button" data-view-id="${esc(c.id)}">View Details</button></div>`);
    m.on('click', () => selectCentre(c.id, { pan: false }));
    m.addTo(markerLayer); markers[c.id] = m;
  });
}
function fitResults() {
  if (!map) return;
  const pts = Object.values(markers).map(m => m.getLatLng());
  if (state.loc) pts.push([state.loc.lat, state.loc.lng]);
  if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.2), { maxZoom: 15 });
}
function drawYou() {
  if (!map) return;
  if (youMarker) youMarker.remove();
  if (state.loc) youMarker = L.marker([state.loc.lat, state.loc.lng], { icon: L.divIcon({ className: '', html: '<div class="you"></div>', iconSize: [16, 16] }), interactive: false, keyboard: false }).addTo(map);
}

/* ==========================================================
   RENDERING
   ========================================================== */
function render({ fit = false } = {}) {
  const list = visibleCentres();
  if (state.selectedId && !list.some(c => c.id === state.selectedId)) state.selectedId = null;
  $('count').textContent = state.loading ? 'Loading…' : `${list.length} centre${list.length === 1 ? '' : 's'} found`;
  renderCards(list); drawMarkers(list); renderDetails(list.find(c => c.id === state.selectedId));
  if (fit) fitResults();
}

function renderCards(list) {
  const ul = $('cards');
  if (state.loading) { ul.innerHTML = '<li class="empty">Loading centres…</li>'; return; }
  if (state.error) { ul.innerHTML = `<li class="empty"><b>Could not load centres</b>${esc(state.error)}<br><button class="btn primary" id="retryLoad">Retry</button></li>`; return; }
  if (!list.length) {
    ul.innerHTML = `<li class="empty"><b>No centres match</b>No centre listing ${esc(currentScheme().name)} services was found within ${state.radius} km with these filters.<br><button class="btn" id="resetFilters">Reset filters</button></li>`;
    return;
  }
  ul.innerHTML = list.map(c => {
    const cat = CATEGORIES[c.category] || { label: 'Other', color: '#6d5acd', glyph: '•' };
    return `<li><button class="card ${c.id === state.selectedId ? 'sel' : ''}" data-id="${esc(c.id)}" aria-pressed="${c.id === state.selectedId}">
      <span class="glyph" style="background:${cat.color}">${cat.glyph}</span>
      <span class="txt"><span class="row"><b>${esc(c.name)}</b><span class="dist">${esc(formatDistance(c.dist))}</span></span>
      <small>${esc(c.address)}</small><small class="meta">${esc(cat.label)} · ${esc(servicesFor(c)[0] || '')}</small></span>
      <span class="arrow" aria-hidden="true">›</span></button></li>`;
  }).join('');
}

function directionsUrl(c) {
  const dest = hasCoords(c) ? `${c.latitude},${c.longitude}` : (c.address ? encodeURIComponent(c.address) : null);
  return dest ? `https://www.google.com/maps/dir/?api=1&destination=${dest}` : null;
}
const validPhone = p => typeof p === 'string' && /^\+?[0-9\s-]{8,15}$/.test(p.trim());

function renderDetails(c) {
  const d = $('details');
  if (!c) { d.innerHTML = '<p class="ph">Select a centre on the map or from the list to see details.</p>'; d.classList.remove('open'); return; }
  const cat = CATEGORIES[c.category] || { label: 'Other', color: '#6d5acd', glyph: '•' };
  const st = openStatus(c), h = c.openingHours;
  const verif = c.verificationStatus === 'verified' ? 'Verified listing' : 'Verification status unknown';
  d.innerHTML = `
    <div class="d-top"><span class="glyph" style="background:${cat.color}">${cat.glyph}</span>
      <div><h2>${esc(c.name)}</h2><span class="tag">${esc(cat.label)}</span></div>
      <button class="close" id="closeDetails" aria-label="Close details">✕</button></div>
    <p class="addr">${esc(c.address)}${c.dist != null ? `<br><b>${esc(formatDistance(c.dist))}</b> straight-line distance` : ''}</p>
    <div class="acts">
      <button class="btn primary" data-act="directions">Get Directions</button>
      ${validPhone(c.phone) ? '<button class="btn" data-act="call">Call</button>' : ''}
      <button class="btn" data-act="share">Share Centre</button>
      <button class="btn" data-act="copy">Copy Address</button></div>
    <div class="sec"><h3>Services for ${esc(currentScheme().name)}</h3>
      <ul>${servicesFor(c).map(s => `<li>${esc(s)}</li>`).join('')}</ul>
      <p class="note" style="margin-top:8px">Listed services only. This does not confirm the centre is officially authorised for this scheme.</p></div>
    <div class="sec"><h3>Timings</h3>${h ? `<div class="kv"><span>${esc(h.days)}</span><span>${fmtTime(h.open)} – ${fmtTime(h.close)}</span></div>
      <p class="${st.open ? 'status-open' : 'status-closed'}" style="margin-top:6px">${esc(st.text)}</p>` : '<p class="addr">Opening hours not available.</p>'}</div>
    <div class="sec"><h3>Source</h3><div class="kv"><span>Status</span><span>${verif}</span><span>Data</span><span>${esc(c.dataSource || 'Unknown')}</span></div></div>`;
  d.classList.add('open');
}

/* ==========================================================
   SELECTION
   ========================================================== */
function selectCentre(id, { pan = true } = {}) {
  const prev = state.selectedId; state.selectedId = id;
  const list = visibleCentres(), c = list.find(x => x.id === id);
  if (prev && markers[prev]) markers[prev].setIcon(pinIcon(list.find(x => x.id === prev)?.category, false));
  if (c && markers[id]) { markers[id].setIcon(pinIcon(c.category, true)); if (pan && map) { map.flyTo(markers[id].getLatLng(), Math.max(map.getZoom(), 14), { duration: .5 }); markers[id].openPopup(); } }
  renderCards(list); renderDetails(c);
  document.querySelector('.card.sel')?.scrollIntoView({ block: 'nearest' });
}

/* ==========================================================
   LOCATION
   ========================================================== */
function setLocation(loc, kind) {
  state.loc = loc;
  const el = $('locStatus'); el.className = 'loc-status ' + (kind === 'warn' ? 'warn' : 'ok');
  $('locText').textContent = loc.label; drawYou();
}
function setLocationNote(text) { $('locStatus').className = 'loc-status warn'; $('locText').textContent = text; }

const geoCache = new Map(); let lastGeoCall = 0;
async function geocode(text) {
  const key = text.trim().toLowerCase();
  if (geoCache.has(key)) return geoCache.get(key);
  const wait = 1100 - (Date.now() - lastGeoCall);           // Nominatim policy: max 1 request/second
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastGeoCall = Date.now();
  const res = await fetch(`${CONFIG.GEOCODER_URL}?${new URLSearchParams({ q: text, format: 'jsonv2', limit: 1, countrycodes: 'in' })}`);
  if (!res.ok) throw new Error('Geocoder unavailable');
  const hit = (await res.json())[0];
  const out = hit ? { lat: +hit.lat, lng: +hit.lon, label: `Searching near: ${hit.display_name.split(',').slice(0, 3).join(',')}` } : null;
  geoCache.set(key, out); return out;
}

function useMyLocation() {
  if (!navigator.geolocation) { setLocationNote('This browser does not support location. Search a place instead.'); return; }
  setLocationNote('Waiting for location permission…');
  navigator.geolocation.getCurrentPosition(
    p => { setLocation({ lat: p.coords.latitude, lng: p.coords.longitude, label: 'Using your current location' }); runSearch(true); },
    err => setLocationNote(err.code === 1 ? 'Location permission was denied. Type a locality, city or PIN code instead.' : 'Could not detect your location. Type a place instead.'),
    { enableHighAccuracy: false, timeout: 10000 });
}

/* ==========================================================
   SEARCH FLOW
   ========================================================== */
async function runSearch(fit = true) {
  const btn = $('searchBtn'); btn.disabled = true;
  const text = $('place').value.trim();
  if (text && (!state.loc || state.loc.typed !== text)) {
    try {
      const loc = await geocode(text);
      if (loc) setLocation({ ...loc, typed: text });
      else setLocationNote('Place not found. Try a nearby locality or a PIN code, or use the demo location.');
    } catch { setLocationNote('Place search is unavailable right now. Use the demo location to continue.'); }
  }
  state.radius = +$('radius').value;
  await loadCentres(fit); btn.disabled = false;
}

async function loadCentres(fit) {
  state.loading = true; state.error = null; render();
  try {
    state.all = await api.getCentres({ schemeId: state.scheme, latitude: state.loc?.lat, longitude: state.loc?.lng, radiusKm: state.radius });
  } catch (e) { state.all = []; state.error = e.message; }
  state.loading = false; render({ fit });
}

/* ==========================================================
   EVENTS + INIT
   ========================================================== */
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

function bindEvents() {
  $('scheme').addEventListener('change', e => { state.scheme = e.target.value; $('schemeHelp').textContent = currentScheme().help; state.selectedId = null; loadCentres(true); });
  $('searchBtn').addEventListener('click', () => runSearch(true));
  $('place').addEventListener('keydown', e => { if (e.key === 'Enter') runSearch(true); });
  $('useLoc').addEventListener('click', useMyLocation);
  $('useDemo').addEventListener('click', () => { $('place').value = ''; setLocation(CONFIG.DEMO_LOCATION, 'warn'); runSearch(true); });
  $('radius').addEventListener('change', () => { state.radius = +$('radius').value; render({ fit: true }); });
  $('centreSearch').addEventListener('input', debounce(e => { state.query = e.target.value; render(); }, 200));
  $('sort').addEventListener('change', e => { state.sort = e.target.value; render(); });
  $('openNow').addEventListener('change', e => { state.openNow = e.target.checked; render(); });
  $('fitBtn').addEventListener('click', fitResults);
  $('lang').addEventListener('change', () => toast('Language switching will be handled by the main website.'));

  $('chips').addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    state.cat = b.dataset.cat;
    document.querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', x === b));
    render({ fit: true });
  });
  $('cards').addEventListener('click', e => {
    const card = e.target.closest('.card');
    if (card) { selectCentre(card.dataset.id); if (matchMedia('(max-width:760px)').matches) setView('map'); return; }
    if (e.target.id === 'retryLoad') loadCentres(true);
    if (e.target.id === 'resetFilters') resetFilters();
  });
  document.addEventListener('click', e => {
    const v = e.target.closest('[data-view-id]');
    if (v) { selectCentre(v.dataset.viewId, { pan: false }); map?.closePopup(); }
  });
  $('details').addEventListener('click', e => {
    if (e.target.id === 'closeDetails') { state.selectedId = null; render(); return; }
    const act = e.target.closest('[data-act]')?.dataset.act; if (act) centreAction(act);
  });
  document.querySelectorAll('.view-toggle button').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
}

function setView(v) {
  document.querySelector('.layout').dataset.view = v;
  document.querySelectorAll('.view-toggle button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  if (v === 'map' && map) setTimeout(() => map.invalidateSize(), 50);
}
function resetFilters() {
  Object.assign(state, { cat: 'all', query: '', openNow: false }); state.radius = 25; $('radius').value = '25';
  $('centreSearch').value = ''; $('openNow').checked = false;
  document.querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', x.dataset.cat === 'all'));
  render({ fit: true });
}

async function centreAction(act) {
  const c = visibleCentres().find(x => x.id === state.selectedId); if (!c) return;
  if (act === 'directions') {
    const url = directionsUrl(c);
    return url ? window.open(url, '_blank', 'noopener') : toast('No location or address is available for directions.');
  }
  if (act === 'call') return validPhone(c.phone) ? (location.href = `tel:${c.phone.replace(/[^\d+]/g, '')}`) : toast('No valid phone number available.');
  if (act === 'copy' || act === 'share') {
    const text = act === 'copy' ? c.address : `${c.name}, ${c.address}${directionsUrl(c) ? '\n' + directionsUrl(c) : ''}`;
    if (act === 'share' && navigator.share) { try { await navigator.share({ title: c.name, text }); } catch { /* user cancelled */ } return; }
    try { await navigator.clipboard.writeText(text); toast(act === 'copy' ? 'Address copied' : 'Centre details copied to share'); }
    catch { toast('Could not copy. Please select and copy the text manually.'); }
  }
}

function init() {
  $('scheme').innerHTML = SCHEMES.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  $('schemeHelp').textContent = currentScheme().help;
  $('chips').innerHTML = [['all', 'All'], ...Object.entries(CATEGORIES).map(([k, v]) => [k, v.short])]
    .map(([k, l]) => `<button class="chip" data-cat="${k}" aria-pressed="${k === 'all'}">${l}</button>`).join('');
  const note = $('modeNote');
  if (!api.isDemo()) { note.className = 'demo-note live'; note.innerHTML = 'Live mode — results come from the configured API.'; }
  initMap(); bindEvents(); renderDetails(null);
  state.all = []; render();
  if (api.isDemo()) { state.all = DEMO_CENTRES; render(); }   // list is available before a location is chosen
}
document.addEventListener('DOMContentLoaded', init);