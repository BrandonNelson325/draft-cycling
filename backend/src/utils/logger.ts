/**
 * Simple logger utility
 * In production, only logs errors
 * In development, logs everything
 */

const isProduction = process.env.NODE_ENV === 'production';

export const logger = {
  /**
   * Debug logs - only in development
   */
  debug: (...args: any[]) => {
    if (!isProduction) {
      console.log('[DEBUG]', ...args);
    }
  },

  /**
   * Info logs - only in development
   */
  info: (...args: any[]) => {
    if (!isProduction) {
      console.log('[INFO]', ...args);
    }
  },

  /**
   * Warning logs - always logged
   */
  warn: (...args: any[]) => {
    console.warn('[WARN]', ...args);
  },

  /**
   * Error logs - always logged
   */
  error: (...args: any[]) => {
    console.error('[ERROR]', ...args);
  },

  /**
   * Success logs - only in development
   */
  success: (...args: any[]) => {
    if (!isProduction) {
      console.log('[SUCCESS]', ...args);
    }
  },
};
