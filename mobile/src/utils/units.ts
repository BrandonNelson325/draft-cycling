import type { Athlete } from '../types/shared';

export type UnitSystem = 'metric' | 'imperial';

export interface ConversionUtils {
  formatDistance: (meters: number) => string;
  formatDistanceValue: (meters: number) => number;
  distanceUnit: string;
  distanceUnitShort: string;
  formatWeight: (kg: number) => string;
  formatWeightValue: (kg: number) => number;
  weightUnit: string;
  weightUnitShort: string;
  formatElevation: (meters: number) => string;
  formatElevationValue: (meters: number) => number;
  elevationUnit: string;
  elevationUnitShort: string;
  formatSpeed: (metersPerSecond: number) => string;
  formatSpeedValue: (metersPerSecond: number) => number;
  speedUnit: string;
}

export function getConversionUtils(user: Athlete | null): ConversionUtils {
  const isImperial = user?.unit_system === 'imperial';

  return {
    formatDistance: (meters: number) => {
      if (meters == null) return '0.0';
      const value = isImperial ? meters * 0.000621371 : meters / 1000;
      return value.toFixed(1);
    },
    formatDistanceValue: (meters: number) => {
      if (meters == null) return 0;
      return isImperial ? meters * 0.000621371 : meters / 1000;
    },
    distanceUnit: isImperial ? 'miles' : 'kilometers',
    distanceUnitShort: isImperial ? 'mi' : 'km',

    formatWeight: (kg: number) => {
      if (kg == null) return '0';
      const value = isImperial ? kg * 2.20462 : kg;
      return value.toFixed(1);
    },
    formatWeightValue: (kg: number) => {
      if (kg == null) return 0;
      return isImperial ? kg * 2.20462 : kg;
    },
    weightUnit: isImperial ? 'pounds' : 'kilograms',
    weightUnitShort: isImperial ? 'lbs' : 'kg',

    formatElevation: (meters: number) => {
      if (meters == null) return '0';
      const value = isImperial ? meters * 3.28084 : meters;
      return Math.round(value).toString();
    },
    formatElevationValue: (meters: number) => {
      if (meters == null) return 0;
      return isImperial ? meters * 3.28084 : meters;
    },
    elevationUnit: isImperial ? 'feet' : 'meters',
    elevationUnitShort: isImperial ? 'ft' : 'm',

    formatSpeed: (metersPerSecond: number) => {
      if (metersPerSecond == null) return '0.0';
      const value = isImperial ? metersPerSecond * 2.23694 : metersPerSecond * 3.6;
      return value.toFixed(1);
    },
    formatSpeedValue: (metersPerSecond: number) => {
      if (metersPerSecond == null) return 0;
      return isImperial ? metersPerSecond * 2.23694 : metersPerSecond * 3.6;
    },
    speedUnit: isImperial ? 'mph' : 'km/h',
  };
}

export function convertToMetric(
  value: number,
  unitSystem: UnitSystem,
  type: 'distance' | 'weight' | 'elevation'
): number {
  if (unitSystem === 'metric') return value;
  switch (type) {
    case 'distance': return value / 0.621371;
    case 'weight': return value / 2.20462;
    case 'elevation': return value / 3.28084;
    default: return value;
  }
}
