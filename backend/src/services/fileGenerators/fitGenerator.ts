import { FitWriter } from '@markw65/fit-file-writer';
import { Workout, WorkoutInterval } from '../../types/workout';

export const fitGenerator = {
  /**
   * Generate a Garmin .fit workout file
   */
  generate(workout: Workout, ftp: number): Buffer {
    const writer = new FitWriter();

    // Write file_id record
    const timeCreated = writer.time(new Date());
    writer.writeMessage('file_id', {
      type: 'workout',
      manufacturer: 'development',
      product: 0,
      time_created: timeCreated,
      serial_number: 0,
    });

    // Write workout record
    const numSteps = this.countSteps(workout.intervals);
    writer.writeMessage('workout', {
      sport: 'cycling' as any,
      capabilities: 0x00000020 as any,
      num_valid_steps: numSteps as any,
      wkt_name: workout.name,
    });

    // Write workout steps
    let messageIndex = 0;
    for (const interval of workout.intervals) {
      const repeat = interval.repeat || 1;

      // If we have repeats, create a repeat step
      if (repeat > 1) {
        // Create the work interval step
        this.writeWorkoutStep(writer, messageIndex++, interval, ftp);

        // Create repeat step
        writer.writeMessage('workout_step', {
          message_index: { value: messageIndex++ },
          wkt_step_name: `Repeat ${repeat}x`,
          duration_type: 'repeat_until_steps_cmplt' as any,
          duration_value: repeat as any,
          target_type: 'open' as any,
          intensity: 'active' as any,
        });
      } else {
        // Single interval
        this.writeWorkoutStep(writer, messageIndex++, interval, ftp);
      }
    }

    // Finalize and get buffer
    const dataView = writer.finish();
    return Buffer.from(dataView.buffer);
  },

  /**
   * Write a single workout step
   */
  writeWorkoutStep(
    writer: FitWriter,
    messageIndex: number,
    interval: WorkoutInterval,
    ftp: number
  ): void {
    const stepName = this.getStepName(interval);
    const intensity = this.getIntensity(interval);
    const durationType = 'time';
    const durationValue = interval.duration * 1000; // Convert to milliseconds

    let targetType: string;
    let targetValue: number;
    let customTargetValueLow: number | undefined;
    let customTargetValueHigh: number | undefined;

    // Determine target type and values based on interval type
    if (interval.type === 'ramp' && interval.power_low && interval.power_high) {
      targetType = 'power';
      customTargetValueLow = Math.round(ftp * (interval.power_low / 100));
      customTargetValueHigh = Math.round(ftp * (interval.power_high / 100));
      targetValue = customTargetValueLow; // Required field
    } else if (interval.power) {
      targetType = 'power';
      const powerWatts = Math.round(ftp * (interval.power / 100));
      targetValue = powerWatts;
      // Set range (+/- 5% for zones)
      customTargetValueLow = Math.round(powerWatts * 0.95);
      customTargetValueHigh = Math.round(powerWatts * 1.05);
    } else {
      targetType = 'open';
      targetValue = 0;
    }

    const record: any = {
      message_index: { value: messageIndex },
      wkt_step_name: stepName,
      duration_type: durationType as any,
      duration_value: durationValue as any,
      target_type: targetType as any,
      target_value: targetValue as any,
      intensity: intensity as any,
    };

    // Add custom target values for power zones
    if (customTargetValueLow !== undefined) {
      record.custom_target_value_low = customTargetValueLow;
    }
    if (customTargetValueHigh !== undefined) {
      record.custom_target_value_high = customTargetValueHigh;
    }

    // Add cadence if specified
    if (interval.cadence) {
      record.target_type = 'cadence';
      record.target_value = interval.cadence;
      record.custom_target_value_low = interval.cadence - 5;
      record.custom_target_value_high = interval.cadence + 5;
    }

    writer.writeMessage('workout_step', record);
  },

  /**
   * Get step name based on interval type
   */
  getStepName(interval: WorkoutInterval): string {
    switch (interval.type) {
      case 'warmup':
        return 'Warmup';
      case 'cooldown':
        return 'Cooldown';
      case 'work':
        return `Work @ ${interval.power}%`;
      case 'rest':
        return `Rest @ ${interval.power || 50}%`;
      case 'ramp':
        return `Ramp ${interval.power_low}%-${interval.power_high}%`;
      default:
        return 'Interval';
    }
  },

  /**
   * Get intensity level based on interval type
   */
  getIntensity(interval: WorkoutInterval): string {
    switch (interval.type) {
      case 'warmup':
        return 'warmup';
      case 'cooldown':
        return 'cooldown';
      case 'rest':
        return 'rest';
      case 'work':
      case 'ramp':
      default:
        return 'active';
    }
  },

  /**
   * Count total number of steps (including repeats)
   */
  countSteps(intervals: WorkoutInterval[]): number {
    let count = 0;
    for (const interval of intervals) {
      if (interval.repeat && interval.repeat > 1) {
        count += 2; // One for the interval, one for the repeat instruction
      } else {
        count += 1;
      }
    }
    return count;
  },
};
