import { Workout, WorkoutInterval } from '../../types/workout';

export const zwoGenerator = {
  /**
   * Generate a Zwift .zwo workout file
   */
  generate(workout: Workout, ftp: number): string {
    const intervals = this.intervalsToXML(workout.intervals, ftp);

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<workout_file>
  <author>AI Cycling Coach</author>
  <name>${this.escapeXML(workout.name)}</name>
  <description>${this.escapeXML(workout.description || '')}</description>
  <sportType>bike</sportType>
  <tags/>
  <workout>
${intervals}
  </workout>
</workout_file>`;

    return xml;
  },

  /**
   * Convert workout intervals to Zwift XML format
   */
  intervalsToXML(intervals: WorkoutInterval[], ftp: number): string {
    const xmlParts: string[] = [];

    for (const interval of intervals) {
      const repeat = interval.repeat || 1;

      // If repeat > 1 and it's a work/rest pattern, use IntervalsT
      if (repeat > 1 && interval.type === 'work') {
        xmlParts.push(this.createIntervalsT(interval, ftp));
      } else {
        // Generate the interval XML (repeated if necessary)
        for (let i = 0; i < repeat; i++) {
          xmlParts.push(this.intervalToXML(interval, ftp));
        }
      }
    }

    return xmlParts.join('\n');
  },

  /**
   * Convert a single interval to Zwift XML element
   */
  intervalToXML(interval: WorkoutInterval, ftp: number): string {
    const duration = interval.duration;

    switch (interval.type) {
      case 'warmup': {
        const powerLow = (interval.power_low || 50) / 100;
        const powerHigh = (interval.power_high || interval.power || 70) / 100;
        const cadence = interval.cadence ? ` Cadence="${interval.cadence}"` : '';
        return `    <Warmup Duration="${duration}" PowerLow="${powerLow.toFixed(2)}" PowerHigh="${powerHigh.toFixed(2)}"${cadence}/>`;
      }

      case 'cooldown': {
        const powerHigh = (interval.power_high || interval.power || 70) / 100;
        const powerLow = (interval.power_low || 40) / 100;
        const cadence = interval.cadence ? ` Cadence="${interval.cadence}"` : '';
        return `    <Cooldown Duration="${duration}" PowerLow="${powerLow.toFixed(2)}" PowerHigh="${powerHigh.toFixed(2)}"${cadence}/>`;
      }

      case 'ramp': {
        const powerLow = (interval.power_low || 50) / 100;
        const powerHigh = (interval.power_high || 100) / 100;
        const cadence = interval.cadence ? ` Cadence="${interval.cadence}"` : '';
        return `    <Ramp Duration="${duration}" PowerLow="${powerLow.toFixed(2)}" PowerHigh="${powerHigh.toFixed(2)}"${cadence}/>`;
      }

      case 'work':
      case 'rest':
      default: {
        const power = (interval.power || (interval.type === 'rest' ? 50 : 100)) / 100;
        const cadence = interval.cadence ? ` Cadence="${interval.cadence}"` : '';
        return `    <SteadyState Duration="${duration}" Power="${power.toFixed(2)}"${cadence}/>`;
      }
    }
  },

  /**
   * Create IntervalsT element for repeating work intervals
   * This is used for structured intervals with on/off periods
   */
  createIntervalsT(interval: WorkoutInterval, ftp: number): string {
    // For IntervalsT, we need separate on and off durations
    // This assumes the next interval is the rest period
    // For now, we'll just repeat the interval
    const repeat = interval.repeat || 1;
    const power = (interval.power || 100) / 100;
    const cadence = interval.cadence ? ` Cadence="${interval.cadence}"` : '';

    return `    <IntervalsT Repeat="${repeat}" OnDuration="${interval.duration}" OffDuration="0" OnPower="${power.toFixed(2)}" OffPower="${power.toFixed(2)}"${cadence}/>`;
  },

  /**
   * Escape XML special characters
   */
  escapeXML(text: string): string {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  },
};
