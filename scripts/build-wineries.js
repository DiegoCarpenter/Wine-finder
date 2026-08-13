// Data bootstrap script: enrich data/wineries-raw.json with elevation from
// the Open-Elevation API and write data/wineries.json with empty
// description/tags placeholders ready for manual fill-in.
//
// Safe to rerun: existing entries in data/wineries.json (including manual
// edits and hand-added wineries not present in wineries-raw.json) are kept
// untouched. Only wineries not already present get fetched and appended.
//
// Usage: node scripts/build-wineries.js

const fs = require("fs");
const path = require("path");

const ELEVATION_URL = "https://api.open-elevation.com/api/v1/lookup";
const INPUT_PATH = path.join(__dirname, "..", "data", "wineries-raw.json");
const OUTPUT_PATH = path.join(__dirname, "..", "data", "wineries.json");

// Keep requests reasonably sized so the API doesn't time out.
const BATCH_SIZE = 100;

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function fetchElevations(wineries) {
  const response = await fetch(ELEVATION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      locations: wineries.map((winery) => ({
        latitude: winery.lat,
        longitude: winery.lng,
      })),
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `Open-Elevation API error: ${response.status} ${JSON.stringify(data)}`
    );
  }

  return data.results.map((result) => result.elevation);
}

function loadExisting() {
  if (!fs.existsSync(OUTPUT_PATH)) {
    return new Map();
  }

  const existing = JSON.parse(fs.readFileSync(OUTPUT_PATH, "utf8"));
  return new Map(existing.map((winery) => [winery.id, winery]));
}

async function main() {
  const raw = JSON.parse(fs.readFileSync(INPUT_PATH, "utf8"));
  const existingById = loadExisting();

  const newWineries = raw.filter((winery) => !existingById.has(winery.id));
  const batches = chunk(newWineries, BATCH_SIZE);
  const added = [];

  for (const batch of batches) {
    const elevations = await fetchElevations(batch);

    batch.forEach((winery, i) => {
      added.push({
        id: winery.id,
        name: winery.name,
        lat: winery.lat,
        lng: winery.lng,
        elevation: elevations[i],
        description: "",
        tags: [],
      });
    });
  }

  const output = [...existingById.values(), ...added];

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));

  console.log(
    `Added ${added.length} new wineries, preserved ${existingById.size} existing entries unchanged. Wrote ${OUTPUT_PATH}`
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
