import { readFileSync } from 'node:fs';
import { compileStyle, parse } from 'vue/compiler-sfc';
import { describe, expect, it } from 'vitest';

describe('compiled email branding styles', () => {
  it.each([
    ['src/components/EmailSignIn.vue', 'email-sign-in__logo'],
    ['src/views/EmailAccessReviewView.vue', 'review-logo']
  ])('restricts dark-mode inversion to the logo in %s', (filename, logoClass) => {
    const { descriptor } = parse(readFileSync(filename, 'utf8'));
    const style = descriptor.styles.find(style => style.scoped)!;
    const result = compileStyle({ source: style.content, filename, id: 'data-v-branding-test', scoped: true });
    expect(result.errors).toEqual([]);
    const declarations = [...result.code.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(match => /filter\s*:\s*invert\(/.test(match[2]));
    expect(declarations).toHaveLength(1);
    expect(declarations[0][1].trim()).toBe(`:root[data-theme="dark"] .${logoClass}[data-v-branding-test]`);
  });
});
