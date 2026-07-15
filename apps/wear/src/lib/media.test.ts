import { describe, expect, it } from 'vitest';
import {
  MAX_IMAGE_SIZE,
  detectMediaKind,
  isUploadScope,
  mediaExtension,
  scopeFolder,
  validateMediaMeta,
} from './media';

describe('detectMediaKind', () => {
  it('accepts the four allow-listed image types', () => {
    for (const t of ['image/jpeg', 'image/png', 'image/gif', 'image/webp']) {
      expect(detectMediaKind(t)).toBe('image');
    }
  });

  it('rejects svg (stored-XSS vector) and non-images', () => {
    expect(detectMediaKind('image/svg+xml')).toBeNull();
    expect(detectMediaKind('video/mp4')).toBeNull();
    expect(detectMediaKind('application/pdf')).toBeNull();
    expect(detectMediaKind('')).toBeNull();
  });
});

describe('validateMediaMeta', () => {
  it('passes a normal jpeg under the cap', () => {
    expect(validateMediaMeta('image/png', 1024)).toBeNull();
  });

  it('rejects unsupported types with a friendly message', () => {
    expect(validateMediaMeta('image/svg+xml', 1024)).toMatch(/JPG, PNG, GIF, or WebP/);
    expect(validateMediaMeta('video/mp4', 1024)).toMatch(/JPG, PNG, GIF, or WebP/);
  });

  it('rejects zero/negative/NaN sizes', () => {
    expect(validateMediaMeta('image/png', 0)).toBe('No file provided.');
    expect(validateMediaMeta('image/png', -1)).toBe('No file provided.');
    expect(validateMediaMeta('image/png', Number.NaN)).toBe('No file provided.');
  });

  it('rejects oversize images at the 15 MB boundary', () => {
    expect(validateMediaMeta('image/png', MAX_IMAGE_SIZE)).toBeNull();
    expect(validateMediaMeta('image/png', MAX_IMAGE_SIZE + 1)).toMatch(/smaller than 15 MB/);
  });
});

describe('mediaExtension', () => {
  it('derives the extension from the MIME type, never the filename', () => {
    expect(mediaExtension('image/jpeg')).toBe('jpg');
    expect(mediaExtension('image/png')).toBe('png');
    expect(mediaExtension('image/gif')).toBe('gif');
    expect(mediaExtension('image/webp')).toBe('webp');
  });

  it('falls back to bin for anything unknown', () => {
    expect(mediaExtension('application/x-httpd-php')).toBe('bin');
  });
});

describe('isUploadScope', () => {
  it('accepts the four supported scopes', () => {
    for (const s of ['post', 'story', 'brand-logo', 'concept']) {
      expect(isUploadScope(s)).toBe(true);
    }
  });

  it('rejects unknown/foreign values', () => {
    expect(isUploadScope('avatar')).toBe(false);
    expect(isUploadScope('')).toBe(false);
    expect(isUploadScope(null)).toBe(false);
    expect(isUploadScope(42)).toBe(false);
  });
});

describe('scopeFolder', () => {
  it('maps each scope to a stable subfolder', () => {
    expect(scopeFolder('post')).toBe('posts');
    expect(scopeFolder('story')).toBe('stories');
    expect(scopeFolder('brand-logo')).toBe('brands');
    expect(scopeFolder('concept')).toBe('concepts');
  });
});
