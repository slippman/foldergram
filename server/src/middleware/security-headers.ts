import type express from 'express';

import { appConfig } from '../config/env.js';

export const applySecurityHeaders: express.RequestHandler = (_request, response, next) => {
  response.setHeader('Content-Security-Policy', "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'");
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  // Browsers honor HSTS only over HTTPS. Do not extend this policy to sibling hosts.
  if (appConfig.nodeEnv === 'production') {
    response.setHeader('Strict-Transport-Security', 'max-age=31536000');
  }
  next();
};
