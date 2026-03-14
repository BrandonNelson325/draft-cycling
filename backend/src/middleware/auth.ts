import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
}

/**
 * Verify the Supabase JWT locally using the JWT secret.
 *
 * Previous implementation called supabaseAdmin.auth.getUser(token) on every
 * request — a network round-trip to Supabase's auth server. This caused:
 *   1. Latency on every API call
 *   2. Rate-limit failures when many requests fire at once (app open)
 *   3. Total auth failure if Supabase auth is slow/down
 *
 * Local verification is instant, offline, and can't be rate-limited.
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

    // Verify JWT locally — no network call needed
    const decoded = jwt.verify(token, config.jwtSecret, {
      algorithms: ['HS256'],
    }) as jwt.JwtPayload;

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
      console.error('Authentication error:', error);
      res.status(500).json({ error: 'Authentication failed' });
    }
  }
};
