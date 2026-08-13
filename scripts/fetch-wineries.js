// One-time data bootstrap script: run several text queries against the
// Places API (New) to cover wineries around Paso Robles, CA, de-dupe the
// combined results by place id, and dump them to data/wineries-raw.json.
//
// Usage: node scripts/fetch-wineries.js
// Requires GOOGLE_PLACES_API_KEY in a .env file at the project root.

require("dotenv").config();
const fs = require("fs");
const path = require("path");

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const QUERIES = [
  "winery in Paso Robles, CA",
  "winery west side Paso Robles",
  "winery east side Paso Robles",
  "winery Highway 46 Paso Robles",
  "tasting room Paso Robles",
];
const SEARCH_TEXT_URL = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = "places.displayName,places.location,places.id,nextPageToken";
const OUTPUT_PATH = path.join(__dirname, "..", "data", "wineries-raw.json");

// A freshly issued pageToken isn't valid until it "activates", which takes
// a couple of seconds; requesting too early returns an error.
const NEXT_PAGE_DELAY_MS = 2000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(query, pageToken) {
  const body = pageToken
    ? { textQuery: query, pageToken }
    : { textQuery: query };

  const response = await fetch(SEARCH_TEXT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": API_KEY,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `Places API error: ${response.status} ${data.error?.message || ""}`.trim()
    );
  }

  return data;
}

async function fetchWineriesForQuery(query) {
  const wineries = [];
  let pageToken;

  do {
    if (pageToken) {
      await sleep(NEXT_PAGE_DELAY_MS);
    }

    const data = await fetchPage(query, pageToken);

    for (const place of data.places || []) {
      wineries.push({
        name: place.displayName?.text,
        lat: place.location?.latitude,
        lng: place.location?.longitude,
        id: place.id,
      });
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return wineries;
}

async function fetchAllWineries() {
  const byId = new Map();

  for (const query of QUERIES) {
    const results = await fetchWineriesForQuery(query);
    for (const winery of results) {
      byId.set(winery.id, winery);
    }
  }

  return [...byId.values()];
}

async function main() {
  if (!API_KEY) {
    throw new Error("Missing GOOGLE_PLACES_API_KEY in .env");
  }

  const wineries = await fetchAllWineries();

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(wineries, null, 2));

  console.log(`Found ${wineries.length} unique wineries. Wrote ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
