import { afterEach, describe, expect, it } from 'vitest';
import { createDocumentTitleUpdater } from './document-title';

afterEach(() => {
  delete document.documentElement.dataset.cinemaEntry;
  document.title = 'Foldergram';
});

describe('Cinema document titles', () => {
  it.each(['UnReeled Photos', 'Family | UnReeled Photos'])('preserves legitimate Classic album title %s', (name) => {
    document.title = name;
    const update = createDocumentTitleUpdater();
    update(null);
    expect(document.title).toBe(name);
    update(false);
    expect(document.title).toBe(name);
    update(true, 'Another album');
    expect(document.title).toBe('Another album | UnReeled Photos');
    update(false);
    expect(document.title).toBe(name);
  });

  it('updates albums and home during navigation and restores the original title', () => {
    document.title = 'Foldergram';
    const update = createDocumentTitleUpdater();
    update(true, 'Sarah’s 50th Birthday Party');
    expect(document.title).toBe('Sarah’s 50th Birthday Party | UnReeled Photos');
    update(true, 'Casa Bonita');
    expect(document.title).toBe('Casa Bonita | UnReeled Photos');
    update(true);
    expect(document.title).toBe('UnReeled Photos');
    update(false);
    expect(document.title).toBe('Foldergram');
  });

  it('uses the explicit server theme marker to restore the Classic default', () => {
    document.title = 'Shared album | UnReeled Photos';
    document.documentElement.dataset.cinemaEntry = 'true';
    const update = createDocumentTitleUpdater();
    update(null);
    expect(document.title).toBe('Shared album | UnReeled Photos');
    update(false);
    expect(document.title).toBe('Foldergram');
  });
});
