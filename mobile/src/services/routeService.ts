import apiClient from '../api/client';

export interface ClimbSegment {
  startKm: number;
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
  /** AI-readable narrative summary — inline this into a chat message. */
  summary: string;
}

export const routeService = {
  async analyzeGpx(gpxContent: string, filename?: string): Promise<RouteAnalysis> {
    const { data } = await apiClient.post<RouteAnalysis>('/api/routes/analyze', {
      gpx_content: gpxContent,
      filename,
    });
    return data;
  },
};
