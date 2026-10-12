import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { handleRequestError } from '../src/middleware/error-handler.js';

describe('request error privacy', () => {
  it('hides private paths but preserves request validation errors', () => {
    const response = { headersSent: false, status: vi.fn().mockReturnThis(), json: vi.fn() };
    handleRequestError(new Error('ENOENT /private/family/photo.jpg'), {} as any, response as any, vi.fn());
    expect(response.json).toHaveBeenLastCalledWith({ message: 'Unable to complete request.' });
    const result = z.number().safeParse('invalid');
    if (result.success) throw new Error('Expected validation failure');
    handleRequestError(result.error, {} as any, response as any, vi.fn());
    expect(response.json).toHaveBeenLastCalledWith({ message: result.error.message });
  });
  it('forwards errors after a response has started', () => {
    const next = vi.fn();
    const error = new Error('connection closed');
    handleRequestError(error, {} as any, { headersSent: true } as any, next);
    expect(next).toHaveBeenCalledWith(error);
  });
});
