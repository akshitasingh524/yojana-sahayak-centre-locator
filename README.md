# Yojana Sahayak Centre Locator

A responsive locator for nearby assistance-related places. The active application geocodes a place, searches OpenStreetMap data within the selected radius, and displays returned records in a list and on a Leaflet map. It does not create fallback centre records.

## Features

- Search by city, locality, or Indian PIN code.
- View live OpenStreetMap place results with distance, category, available address and contact information.
- Select a result from the list or map to see its details and directions.
- Filter and sort results, adjust the search radius, and use the responsive map/list layout.
- Show provider errors and empty results without substituting sample centres.

## Technology

- HTML, CSS, and browser JavaScript
- Node.js built-in HTTP server and `fetch` (no npm packages)
- Leaflet 1.9.4 for maps
- Nominatim for geocoding
- Overpass API for OpenStreetMap place data
- OpenStreetMap map tiles and Inter font, loaded from public CDNs

## Project structure

```text
mapwork/
├── index.html    # Active live locator page
├── script.js     # Active frontend: geocoding/search UI, filters and map
├── style.css     # Shared page styling
├── server.js     # Local static server and Nominatim/Overpass API proxy
├── main.html     # Separate legacy/demo page; not used by index.html
├── style.js      # Legacy/demo page logic; loaded by main.html
├── style1.css    # Currently unreferenced; retained, not used by either page
├── README.md
└── .gitignore
```

`index.html` loads `style.css`, Leaflet, and `script.js`. The backend serves the active page and its assets. `main.html` is a separate legacy/demo page that loads `style.css`, Leaflet, and `style.js`; it is not part of the active live search flow. `style1.css` has no references in the project. These legacy files are retained and can be moved to an archive in a later cleanup if they are no longer needed.

## Prerequisites

- Node.js 18 or newer (the server uses Node's built-in `fetch`).
- Internet access for the geocoder, Overpass, map tiles, and CDN assets.
- No `package.json`, lockfile, dependency installation, API key, or external runtime package is required for the active app.

## Run locally

1. Open this project folder in VS Code.
2. Open a terminal in the folder containing `server.js` and start the backend:

   ```powershell
   node .\server.js
   ```

3. Keep the terminal running and open **http://127.0.0.1:3000/** in a browser.

The backend serves the active frontend and API on port 3000. Alternatively, with the backend running, use the VS Code Live Server extension to open `index.html` at its default `http://127.0.0.1:5500/index.html` address. The frontend is configured to call the backend at port 3000, and the backend allows the default `localhost:5500` and `127.0.0.1:5500` origins. If Live Server uses a different origin, set `CORS_ORIGINS` to a comma-separated list of the exact permitted origins before starting the backend. Stop the backend with `Ctrl+C`.

## API and data sources

The active frontend calls the local backend:

- `GET /api/geocode?q=...` — queries Nominatim. PIN searches are filtered to exact postcode matches.
- `GET /api/centres?latitude=...&longitude=...&radius_km=...` — queries Overpass for mapped healthcare facilities, post offices, government offices, town halls, and agriculture offices near the selected coordinates.

The default Overpass endpoint is `https://overpass.openstreetmap.fr/api/interpreter`. It can be changed with the `OVERPASS_ENDPOINT` environment variable. The backend identifies requests as Yojana Sahayak, serializes and spaces upstream requests, caches responses, applies timeouts, and limits retries. Check the chosen provider's current access and usage policy before deploying or increasing usage. Nominatim and Overpass are public services, not guaranteed-availability production APIs.

Place records and map tiles are from OpenStreetMap contributors; geocoding is by Nominatim. Review the applicable attribution and usage policies when sharing or deploying this project. Results are community-maintained map data, not official verification of an office, service, or CSC authorization.

## Known limitations

- OpenStreetMap coverage varies by location; missing results do not prove that no centre exists.
- The Overpass query caps raw responses at 300 elements, so dense areas can be truncated before the frontend filters or deduplicates entries.
- CSC matching is limited to recognizable names among the records returned by the queried tags. It is not a directory of all CSCs and does not establish authorization.
- Public geocoding, Overpass, map tile, and CDN services can rate-limit, restrict, or temporarily fail. The app reports failures rather than inventing results.
- `main.html` and `style.js` are retained as a separate legacy/demo flow; use `index.html` for the live locator.

## Sharing safely

The source scan found no apparent hardcoded API keys, passwords, tokens, or private-key material in the current project files. This is a source review, not a guarantee about future edits. Do not add credentials to source control; keep local environment files and credentials out of commits using `.gitignore`.
