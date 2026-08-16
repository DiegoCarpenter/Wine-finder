const EARTH_RADIUS_MILES = 3958.8;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function haversineDistanceMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_MILES * c;
}

/**
 * Computes the initial bearing (forward azimuth) from point 1 to point 2
 * along the great-circle path connecting them, using the standard
 * spherical bearing formula:
 *
 *   θ = atan2( sin(Δλ)·cos(φ2), cos(φ1)·sin(φ2) − sin(φ1)·cos(φ2)·cos(Δλ) )
 *
 * where φ1/φ2 are the latitudes and Δλ is the difference in longitude.
 * atan2 gives a signed angle in (-180, 180], which is normalized here to
 * a compass bearing in [0, 360): 0 = north, 90 = east, 180 = south, 270 = west.
 *
 * Note this is the *initial* bearing — on a great-circle route the bearing
 * changes continuously, but for the short winery-scale distances here that
 * drift is negligible.
 */
export function getBearing(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const deltaLng = toRadians(lng2 - lng1);

  const y = Math.sin(deltaLng) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLng);
  const theta = Math.atan2(y, x);

  return ((theta * 180) / Math.PI + 360) % 360;
}

const OPEN_ELEVATION_URL = "https://api.open-elevation.com/api/v1/lookup";
const BLOCKED_ELEVATION_BUFFER_METERS = 20;
const SIGHTLINE_SAMPLE_FRACTIONS = [0.25, 0.5, 0.75];

/**
 * Rough, best-effort check for whether terrain likely blocks the sightline
 * from the user to a target (e.g. a winery). Samples real elevation at a
 * few points along the straight line between the two, in a single batched
 * Open-Elevation request, and compares each against the elevation a
 * straight, unobstructed sightline would have at that point (simple linear
 * interpolation between the user's and target's elevation — no earth
 * curvature correction, since that's negligible at these distances).
 *
 * If any sampled point's real elevation exceeds the expected sightline
 * height by more than a small buffer, the target is considered likely
 * blocked. This is intentionally rough — it's meant to dim distant/hidden
 * wineries, not to be a precise line-of-sight calculation.
 *
 * Fails open: if the elevation lookup fails for any reason, returns false
 * (not blocked) rather than retrying or throwing.
 */
export async function isLikelyBlocked(
  userLat: number,
  userLng: number,
  userElevation: number,
  targetLat: number,
  targetLng: number,
  targetElevation: number
): Promise<boolean> {
  const samplePoints = SIGHTLINE_SAMPLE_FRACTIONS.map((fraction) => ({
    fraction,
    latitude: userLat + (targetLat - userLat) * fraction,
    longitude: userLng + (targetLng - userLng) * fraction,
  }));

  try {
    const response = await fetch(OPEN_ELEVATION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locations: samplePoints.map(({ latitude, longitude }) => ({
          latitude,
          longitude,
        })),
      }),
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    const elevations: number[] = data.results.map(
      (result: { elevation: number }) => result.elevation
    );

    return samplePoints.some(({ fraction }, index) => {
      const expectedElevation =
        userElevation + (targetElevation - userElevation) * fraction;
      return elevations[index] > expectedElevation + BLOCKED_ELEVATION_BUFFER_METERS;
    });
  } catch {
    return false;
  }
}
