import { describe, expect, it } from 'vitest';
import { createRouter } from '../src/lib/router';

describe('fixture router', () => {
  it('lists its routes', () => {
    const router = createRouter(['/health']);
    expect(router.list()).toEqual(['/health']);
  });
});
