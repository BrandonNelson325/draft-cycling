import { parseStringPromise } from 'xml2js';
import { logger } from '../utils/logger';

/**
 * A single track point parsed from a GPX file.
 */
interface TrackPoint {
  lat: number;
  lon: number;
  ele: number | null;
  distanceFromStart: number; // meters, cumulative
}

/**
 * A detected significant climb on the route.
 */
export interface ClimbSegment {
  startKm: number;       // distance from route start
  lengthKm: number;
  avgGradientPct: number;
  elevationGainM: number;
  category: 'HC' | 'Cat 1' | 'Cat 2' | 'Cat 3' | 'Cat 4';
}

export interface RouteAnalysis {
  filename?: string;
  distanceKm: number;
  distanceMiles: number;
  elevationGainM: number;
  elevationGainFt: number;
  maxElevationM: number;
  minElevationM: number;
  climbs: ClimbSegment[];
  pointCount: number;
  /**
   * AI-readable narrative — designed to be inlined into a chat message so
   * the coach can reason about the route without parsing structured data.
   */
  summary: string;
}

const EARTH_RADIUS_M = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Haversine distance in meters between two lat/lon points.
 */
function distanceMeters(a: TrackPoint, b: TrackPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(x));
}

/**
 * Parse a GPX XML string into an array of TrackPoint with cumulative distance.
 * Accepts both <trkpt> (tracks) and <rtept> (routes).
 */
async function parseGpxToPoints(gpxXml: string): Promise<TrackPoint[]> {
  const parsed = await parseStringPromise(gpxXml, { explicitArray: false });
  const gpx = parsed?.gpx;
  if (!gpx) throw new Error('Invalid GPX: missing <gpx> root element');

  const rawPoints: { lat: number; lon: number; ele: number | null }[] = [];

  // Tracks: <trk> → <trkseg> → <trkpt>
  const tracks = gpx.trk ? (Array.isArray(gpx.trk) ? gpx.trk : [gpx.trk]) : [];
  for (const trk of tracks) {
    const segs = trk.trkseg ? (Array.isArray(trk.trkseg) ? trk.trkseg : [trk.trkseg]) : [];
    for (const seg of segs) {
      const pts = seg.trkpt ? (Array.isArray(seg.trkpt) ? seg.trkpt : [seg.trkpt]) : [];
      for (const pt of pts) {
        const lat = parseFloat(pt?.$?.lat);
        const lon = parseFloat(pt?.$?.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        const eleRaw = pt.ele;
        const ele = eleRaw != null ? parseFloat(eleRaw) : null;
        rawPoints.push({ lat, lon, ele: Number.isFinite(ele) ? ele : null });
      }
    }
  }

  // Routes (waypoint-based): <rte> → <rtept>
  if (rawPoints.length === 0) {
    const routes = gpx.rte ? (Array.isArray(gpx.rte) ? gpx.rte : [gpx.rte]) : [];
    for (const rte of routes) {
      const pts = rte.rtept ? (Array.isArray(rte.rtept) ? rte.rtept : [rte.rtept]) : [];
      for (const pt of pts) {
        const lat = parseFloat(pt?.$?.lat);
        const lon = parseFloat(pt?.$?.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        const eleRaw = pt.ele;
        const ele = eleRaw != null ? parseFloat(eleRaw) : null;
        rawPoints.push({ lat, lon, ele: Number.isFinite(ele) ? ele : null });
      }
    }
  }

  if (rawPoints.length < 2) {
    throw new Error('GPX contains fewer than 2 track points');
  }

  // Compute cumulative distance
  const points: TrackPoint[] = [];
  let cumulative = 0;
  for (let i = 0; i < rawPoints.length; i++) {
    const prev = rawPoints[i - 1];
    const curr = rawPoints[i];
    if (i > 0 && prev) {
      cumulative += distanceMeters(
        { ...prev, distanceFromStart: 0 },
        { ...curr, distanceFromStart: 0 }
      );
    }
    points.push({ ...curr, distanceFromStart: cumulative });
  }

  return points;
}

/**
 * Smooth the elevation series with a simple moving average to mute GPS noise.
 * Without this, climb detection picks up every 1m jitter.
 */
function smoothElevation(points: TrackPoint[], windowSize = 5): TrackPoint[] {
  const eles = points.map(p => p.ele);
  const smoothed: (number | null)[] = [];
  for (let i = 0; i < eles.length; i++) {
    const start = Math.max(0, i - windowSize);
    const end = Math.min(eles.length, i + windowSize + 1);
    const window = eles.slice(start, end).filter((v): v is number => v != null);
    smoothed.push(window.length > 0 ? window.reduce((a, b) => a + b, 0) / window.length : null);
  }
  return points.map((p, i) => ({ ...p, ele: smoothed[i] }));
}

/**
 * Detect significant climbs. A climb is a continuous segment where the
 * smoothed gradient stays >= MIN_GRADIENT for at least MIN_LENGTH meters.
 * Short flat dips inside a climb don't break it (we tolerate a tiny rolling
 * descent so a single GPS dip doesn't cut a real climb into halves).
 */
function detectClimbs(points: TrackPoint[]): ClimbSegment[] {
  const MIN_GRADIENT = 0.03; // 3% sustained
  const MIN_LENGTH = 500;    // meters
  const TOLERANCE_M = 8;     // allow up to 8m drop before ending a climb

  const climbs: ClimbSegment[] = [];
  let climbStartIdx: number | null = null;
  let climbPeakEle = -Infinity;

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a.ele == null || b.ele == null) continue;

    const segLen = b.distanceFromStart - a.distanceFromStart;
    if (segLen <= 0) continue;
    const grade = (b.ele - a.ele) / segLen;

    if (climbStartIdx === null) {
      // Not currently in a climb. Start one if we're going up at >= MIN_GRADIENT.
      if (grade >= MIN_GRADIENT) {
        climbStartIdx = i - 1;
        climbPeakEle = a.ele;
      }
    } else {
      // In a climb. Track peak elevation; end climb if we drop too far.
      if (b.ele > climbPeakEle) climbPeakEle = b.ele;
      if (climbPeakEle - b.ele > TOLERANCE_M) {
        // Climb is over (at the peak). Close it out using the peak.
        const start = points[climbStartIdx];
        // Find the index of the peak
        let peakIdx = climbStartIdx;
        for (let j = climbStartIdx; j <= i; j++) {
          if (points[j].ele != null && points[j].ele! >= climbPeakEle - 0.5) peakIdx = j;
        }
        const end = points[peakIdx];
        const lengthM = end.distanceFromStart - start.distanceFromStart;
        const gain = (end.ele ?? 0) - (start.ele ?? 0);
        if (lengthM >= MIN_LENGTH && gain > 0) {
          climbs.push(buildClimb(start.distanceFromStart, lengthM, gain));
        }
        climbStartIdx = null;
        climbPeakEle = -Infinity;
      }
    }
  }

  // Close out an open climb at the end of the route
  if (climbStartIdx !== null) {
    const start = points[climbStartIdx];
    const end = points[points.length - 1];
    const lengthM = end.distanceFromStart - start.distanceFromStart;
    const gain = (end.ele ?? 0) - (start.ele ?? 0);
    if (lengthM >= MIN_LENGTH && gain > 0) {
      climbs.push(buildClimb(start.distanceFromStart, lengthM, gain));
    }
  }

  return climbs;
}

/**
 * Tour-de-France style climb categorization based on the "Bartali index"
 * (length × avg gradient). These thresholds are widely used by Strava et al.
 */
function categorize(lengthKm: number, avgGradePct: number): ClimbSegment['category'] {
  const score = lengthKm * 1000 * avgGradePct; // length_m × gradient as percent
  if (score >= 80_000) return 'HC';
  if (score >= 64_000) return 'Cat 1';
  if (score >= 32_000) return 'Cat 2';
  if (score >= 16_000) return 'Cat 3';
  return 'Cat 4';
}

function buildClimb(startM: number, lengthM: number, gainM: number): ClimbSegment {
  const lengthKm = lengthM / 1000;
  const avgGradePct = (gainM / lengthM) * 100;
  return {
    startKm: Math.round((startM / 1000) * 10) / 10,
    lengthKm: Math.round(lengthKm * 10) / 10,
    avgGradientPct: Math.round(avgGradePct * 10) / 10,
    elevationGainM: Math.round(gainM),
    category: categorize(lengthKm, avgGradePct),
  };
}

/**
 * Total elevation gain over a track — sum of positive deltas.
 */
function totalElevationGain(points: TrackPoint[]): number {
  let gain = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1].ele;
    const b = points[i].ele;
    if (a == null || b == null) continue;
    const diff = b - a;
    if (diff > 0) gain += diff;
  }
  return gain;
}

function buildSummary(a: Omit<RouteAnalysis, 'summary'>): string {
  const lines: string[] = [];
  lines.push(
    `📍 Route attached — ${a.distanceMiles.toFixed(1)} mi (${a.distanceKm.toFixed(1)} km), ` +
    `${a.elevationGainFt.toLocaleString()} ft (${a.elevationGainM.toLocaleString()} m) of climbing.`
  );
  if (a.climbs.length === 0) {
    lines.push('Mostly flat / rolling — no Cat 4+ climbs detected.');
  } else {
    lines.push(`${a.climbs.length} significant climb${a.climbs.length === 1 ? '' : 's'}:`);
    for (const c of a.climbs) {
      const startMi = (c.startKm / 1.609).toFixed(1);
      const lenMi = (c.lengthKm / 1.609).toFixed(1);
      lines.push(
        `  • ${c.category} — mile ${startMi}, ${lenMi} mi @ ${c.avgGradientPct.toFixed(1)}%`
      );
    }
  }
  return lines.join('\n');
}

export const routeAnalyzerService = {
  /**
   * Parse + analyze a GPX file. The input is the raw XML string.
   */
  async analyzeGpx(gpxXml: string, filename?: string): Promise<RouteAnalysis> {
    try {
      const rawPoints = await parseGpxToPoints(gpxXml);
      const points = smoothElevation(rawPoints);

      const last = points[points.length - 1];
      const distanceM = last.distanceFromStart;
      const elevationGainM = totalElevationGain(points);

      const eles = points.map(p => p.ele).filter((e): e is number => e != null);
      const maxEle = eles.length ? Math.max(...eles) : 0;
      const minEle = eles.length ? Math.min(...eles) : 0;

      const climbs = detectClimbs(points);

      const base: Omit<RouteAnalysis, 'summary'> = {
        filename,
        distanceKm: Math.round((distanceM / 1000) * 10) / 10,
        distanceMiles: Math.round((distanceM / 1609.344) * 10) / 10,
        elevationGainM: Math.round(elevationGainM),
        elevationGainFt: Math.round(elevationGainM * 3.28084),
        maxElevationM: Math.round(maxEle),
        minElevationM: Math.round(minEle),
        climbs,
        pointCount: points.length,
      };

      return { ...base, summary: buildSummary(base) };
    } catch (err: any) {
      logger.warn('[RouteAnalyzer] Failed to parse GPX:', err.message);
      throw new Error(err.message || 'Failed to parse GPX file');
    }
  },
};
