import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
}

/**
 * JWKS cache with stale-while-revalidate and mutex to prevent thundering herd.
 *
 * - Only ONE fetch runs at a time (mutex). Concurrent requests wait for the result.
 * - If the cache is stale but a refresh fails, the old keys are still served.
 * - Fetch retries up to 3 times with backoff before giving up.
 */
let jwksCache: Map<string, string> | null = null;
let jwksFetchedAt = 0;
let jwksFetchPromise: Promise<Map<string, string>> | null = null;
const JWKS_CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function fetchJwksWithRetry(): Promise<Map<string, string>> {
  const jwksUrl = `${config.supabase.url}/auth/v1/.well-known/jwks.json`;

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(jwksUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`JWKS fetch failed: ${response.status}`);
      }
      const jwks = await response.json() as { keys: any[] };

      const keys = new Map<string, string>();
      for (const key of jwks.keys) {
        const publicKey = crypto.createPublicKey({ key, format: 'jwk' });
        const pem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
        keys.set(key.kid || 'default', pem);
      }

      jwksCache = keys;
      jwksFetchedAt = Date.now();
      logger.debug(`JWKS loaded: ${keys.size} keys`);
      return keys;
    } catch (err: any) {
      lastError = err;
      logger.warn(`JWKS fetch attempt ${attempt + 1}/3 failed: ${err.message}`);
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, (attempt + 1) * 1000));
      }
    }
  }

  // All retries failed — return stale cache if available
  if (jwksCache) {
    logger.warn('JWKS refresh failed after 3 attempts, serving stale keys');
    return jwksCache;
  }

  throw lastError || new Error('JWKS fetch failed after 3 attempts');
}

async function getJwksPublicKeys(): Promise<Map<string, string>> {
  // Cache is fresh — return immediately
  if (jwksCache && Date.now() - jwksFetchedAt < JWKS_CACHE_TTL) {
    return jwksCache;
  }

  // Mutex: if a fetch is already in progress, wait for it instead of starting another
  if (jwksFetchPromise) {
    return jwksFetchPromise;
  }

  // Start the fetch and let concurrent callers share the same promise
  jwksFetchPromise = fetchJwksWithRetry().finally(() => {
    jwksFetchPromise = null;
  });

  return jwksFetchPromise;
}

/**
 * Pre-warm the JWKS cache at server startup so the first user request
 * doesn't trigger a cold fetch.
 */
export async function warmJwksCache(): Promise<void> {
  try {
    await getJwksPublicKeys();
    logger.info('JWKS cache warmed successfully');
  } catch (err: any) {
    logger.error('Failed to warm JWKS cache (will retry on first request):', err.message);
  }
}

/**
 * Verify Supabase JWT locally — supports both legacy HS256 and new ES256 keys.
 *
 * Strategy:
 * 1. Decode the token header to check the algorithm
 * 2. HS256 → verify with JWT_SECRET (legacy, instant)
 * 3. ES256 → verify with Supabase JWKS public key (new, one-time fetch)
 *
 * This is instant, offline (after initial JWKS fetch), and can't be rate-limited.
 */
export const authenticateJWT = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid authorization header' });
      return;
    }

    const token = authHeader.split(' ')[1];

    // Decode the header to determine algorithm (without verifying yet)
    const headerB64 = token.split('.')[0];
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());

    let decoded: jwt.JwtPayload;

    if (header.alg === 'HS256') {
      // Legacy token — verify with shared secret
      decoded = jwt.verify(token, config.jwtSecret, {
        algorithms: ['HS256'],
      }) as jwt.JwtPayload;
    } else if (header.alg === 'ES256') {
      // New ECC token — verify with Supabase JWKS public key
      const keys = await getJwksPublicKeys();
      const pem = header.kid ? keys.get(header.kid) : keys.values().next().value;
      if (!pem) {
        // Force refresh JWKS in case keys rotated
        jwksCache = null;
        const refreshedKeys = await getJwksPublicKeys();
        const refreshedPem = header.kid ? refreshedKeys.get(header.kid) : refreshedKeys.values().next().value;
        if (!refreshedPem) {
          res.status(401).json({ error: 'No matching signing key found' });
          return;
        }
        decoded = jwt.verify(token, refreshedPem, {
          algorithms: ['ES256'],
        }) as jwt.JwtPayload;
      } else {
        decoded = jwt.verify(token, pem, {
          algorithms: ['ES256'],
        }) as jwt.JwtPayload;
      }
    } else {
      res.status(401).json({ error: `Unsupported token algorithm: ${header.alg}` });
      return;
    }

    if (!decoded.sub || !decoded.email) {
      res.status(401).json({ error: 'Invalid token payload' });
      return;
    }

    // Attach user to request
    req.user = {
      id: decoded.sub,
      email: decoded.email as string,
    };

    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      res.status(401).json({ error: 'Token expired' });
    } else if (error.name === 'JsonWebTokenError') {
      res.status(401).json({ error: 'Invalid token' });
    } else {
      logger.error('Authentication error:', error);
      res.status(500).json({ error: 'Authentication failed' });
    }
  }
};
