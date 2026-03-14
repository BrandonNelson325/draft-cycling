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
 * Cache for Supabase JWKS public keys.
 * Fetched once on first request, refreshed every hour.
 */
let jwksCache: Map<string, string> | null = null;
let jwksFetchedAt = 0;
const JWKS_CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function getJwksPublicKeys(): Promise<Map<string, string>> {
  if (jwksCache && Date.now() - jwksFetchedAt < JWKS_CACHE_TTL) {
    return jwksCache;
  }

  const jwksUrl = `${config.supabase.url}/auth/v1/.well-known/jwks.json`;
  const response = await fetch(jwksUrl);
  if (!response.ok) {
    throw new Error(`JWKS fetch failed: ${response.status}`);
  }
  const jwks = await response.json() as { keys: any[] };

  const keys = new Map<string, string>();
  for (const key of jwks.keys) {
    // Convert JWK to PEM public key
    const publicKey = crypto.createPublicKey({ key, format: 'jwk' });
    const pem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
    keys.set(key.kid || 'default', pem);
  }

  jwksCache = keys;
  jwksFetchedAt = Date.now();
  logger.debug(`JWKS loaded: ${keys.size} keys`);
  return keys;
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
