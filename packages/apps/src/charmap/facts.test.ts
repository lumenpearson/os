import { describe, expect, it } from 'vitest';
import { characterFacts } from './facts';

const values = (codePoint: number) =>
  Object.fromEntries(characterFacts(codePoint).map((fact) => [fact.id, fact.value]));

describe('characterFacts', () => {
  it('states everything derivable about the em dash', () => {
    expect(values(0x2014)).toEqual({
      'code-point': 'U+2014',
      decimal: '8212',
      'utf-8': 'E2 80 94',
      'utf-16': '2014',
      html: '&#8212;',
      'html-named': '&mdash;',
      javascript: '\\u2014',
      css: '\\002014',
    });
  });

  it('leaves out the named entity when it has none to give', () => {
    const facts = characterFacts(0x2500);
    expect(facts.map((fact) => fact.id)).not.toContain('html-named');
    expect(values(0x2500)['utf-8']).toBe('E2 94 80');
  });

  it('handles a character above the BMP', () => {
    expect(values(0x1d400)).toMatchObject({
      'code-point': 'U+1D400',
      decimal: '119808',
      'utf-16': 'D835 DC00',
      javascript: '\\u{1D400}',
      css: '\\01D400',
    });
  });

  it('labels every row and gives each an id of its own', () => {
    const facts = characterFacts(0x00a9);
    expect(new Set(facts.map((f) => f.id)).size).toBe(facts.length);
    for (const fact of facts) {
      expect(fact.label.length).toBeGreaterThan(0);
      expect(fact.value.length).toBeGreaterThan(0);
    }
  });
});
