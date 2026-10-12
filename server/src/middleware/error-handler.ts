import type express from 'express';
import { ZodError } from 'zod';
import { log } from '../services/log-service.js';

export const handleRequestError: express.ErrorRequestHandler = (error: unknown, _request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }
  // Validation details describe the request; filesystem and decoder errors can
  // contain private source paths and belong only in server logs.
  const message = error instanceof ZodError ? error.message : 'Unable to complete request.';
  if (!(error instanceof ZodError)) log.error('Request failed', error);
  response.status(400).json({ message });
};
