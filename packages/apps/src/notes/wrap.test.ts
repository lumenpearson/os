import { describe, expect, it } from 'vitest';
import {
  type EditResult,
  insertLink,
  lineSpan,
  type Selection,
  setHeading,
  toggleInline,
  toggleList,
} from './wrap';

/** The result with the selection spelled out as the text it covers. */
function shown(result: EditResult): { text: string; selected: string; caret: number } {
  return {
    text: result.text,
    selected: result.text.slice(result.selection.start, result.selection.end),
    caret: result.selection.start,
  };
}

const at = (start: number, end = start): Selection => ({ start, end });

describe('toggleInline', () => {
  it('wraps the selection and keeps it selected', () => {
    expect(shown(toggleInline('hello world', at(0, 5), 'bold'))).toEqual({
      text: '**hello** world',
      selected: 'hello',
      caret: 2,
    });
    expect(shown(toggleInline('hello world', at(0, 5), 'italic'))).toEqual({
      text: '*hello* world',
      selected: 'hello',
      caret: 1,
    });
    expect(shown(toggleInline('hello world', at(6, 11), 'code'))).toEqual({
      text: 'hello `world`',
      selected: 'world',
      caret: 7,
    });
    expect(shown(toggleInline('hello world', at(0, 5), 'strike'))).toEqual({
      text: '~~hello~~ world',
      selected: 'hello',
      caret: 2,
    });
  });

  it('unwraps when the markers are inside the selection', () => {
    expect(shown(toggleInline('**hello** world', at(0, 9), 'bold'))).toEqual({
      text: 'hello world',
      selected: 'hello',
      caret: 0,
    });
    expect(shown(toggleInline('*hello*', at(0, 7), 'italic'))).toEqual({
      text: 'hello',
      selected: 'hello',
      caret: 0,
    });
  });

  it('unwraps when the markers sit just outside the selection', () => {
    expect(shown(toggleInline('**hello** world', at(2, 7), 'bold'))).toEqual({
      text: 'hello world',
      selected: 'hello',
      caret: 0,
    });
    expect(shown(toggleInline('a ~~gone~~ b', at(4, 8), 'strike'))).toEqual({
      text: 'a gone b',
      selected: 'gone',
      caret: 2,
    });
  });

  it('reads a lone asterisk beside a bold run as part of that run', () => {
    // Italic over the text of `**bold**` must not read the neighbouring `*`
    // as its own marker; it adds a third pair instead.
    expect(shown(toggleInline('**bold**', at(2, 6), 'italic'))).toEqual({
      text: '***bold***',
      selected: 'bold',
      caret: 3,
    });
  });

  it('puts the caret between fresh markers when nothing is selected', () => {
    const result = toggleInline('ab', at(1), 'bold');
    expect(result.text).toBe('a****b');
    expect(result.selection).toEqual({ start: 3, end: 3 });
    expect(toggleInline('', at(0), 'code').selection).toEqual({ start: 1, end: 1 });
  });

  it('leaves whitespace at the edges of the selection outside the markers', () => {
    expect(shown(toggleInline('one two ', at(0, 4), 'bold'))).toEqual({
      text: '**one** two ',
      selected: 'one',
      caret: 2,
    });
    expect(shown(toggleInline('a b c', at(1, 4), 'italic'))).toEqual({
      text: 'a *b* c',
      selected: 'b',
      caret: 3,
    });
  });

  it('wraps a selection that is only whitespace as it stands', () => {
    expect(toggleInline('a  b', at(1, 3), 'code').text).toBe('a`  `b');
  });

  it('accepts a selection made backwards', () => {
    expect(toggleInline('hello', at(5, 0), 'bold')).toEqual(
      toggleInline('hello', at(0, 5), 'bold'),
    );
  });

  it('comes back to the text it started from', () => {
    const source = 'round trip';
    for (const format of ['bold', 'italic', 'code', 'strike'] as const) {
      const wrapped = toggleInline(source, at(0, 5), format);
      expect(toggleInline(wrapped.text, wrapped.selection, format).text).toBe(source);
    }
  });
});

describe('insertLink', () => {
  it('turns a selected URL into the target and selects the label', () => {
    expect(shown(insertLink('see https://a.test', at(4, 18)))).toEqual({
      text: 'see [link](https://a.test)',
      selected: 'link',
      caret: 5,
    });
    expect(shown(insertLink('mailto:ada@lumen.test', at(0, 21))).selected).toBe('link');
  });

  it('turns selected words into the label and selects the target', () => {
    expect(shown(insertLink('read the docs', at(9, 13)))).toEqual({
      text: 'read the [docs](url)',
      selected: 'url',
      caret: 16,
    });
  });

  it('inserts a whole placeholder when nothing is selected', () => {
    expect(shown(insertLink('', at(0)))).toEqual({
      text: '[link](url)',
      selected: 'url',
      caret: 7,
    });
  });
});

describe('lineSpan', () => {
  it('grows a caret to the whole line it sits on', () => {
    expect(lineSpan('one\ntwo\nthree', at(5))).toEqual({ from: 4, to: 7, lines: ['two'] });
  });

  it('covers every line a selection touches', () => {
    expect(lineSpan('one\ntwo\nthree', at(2, 9)).lines).toEqual(['one', 'two', 'three']);
  });

  it('handles a caret at the very start of a document that opens with a blank line', () => {
    expect(lineSpan('\nsecond', at(0))).toEqual({ from: 0, to: 0, lines: [''] });
    expect(setHeading('\nsecond', at(0), 1).text).toBe('# \nsecond');
  });
});

describe('setHeading', () => {
  it('sets the level of every touched line', () => {
    expect(shown(setHeading('one\ntwo', at(0, 7), 2))).toEqual({
      text: '## one\n## two',
      selected: '## one\n## two',
      caret: 0,
    });
  });

  it('replaces a level rather than stacking hashes', () => {
    expect(setHeading('### deep', at(0), 1).text).toBe('# deep');
  });

  it('turns the line back into body text when it already has that level', () => {
    expect(setHeading('## two', at(0), 2).text).toBe('two');
    expect(setHeading('## a\n## b', at(0, 9), 2).text).toBe('a\nb');
    expect(setHeading('## a\n# b', at(0, 8), 2).text).toBe('## a\n## b');
  });

  it('strips the heading with level 0 and leaves plain text alone', () => {
    expect(setHeading('# heading', at(0), 0).text).toBe('heading');
    expect(setHeading('plain', at(0), 0).text).toBe('plain');
  });

  it('keeps the indent and leaves blank lines in a multi-line span', () => {
    expect(setHeading('  indented', at(0), 3).text).toBe('  ### indented');
    expect(setHeading('a\n\nb', at(0, 4), 1).text).toBe('# a\n\n# b');
  });

  it('leaves the rest of the document untouched', () => {
    expect(setHeading('before\ntarget\nafter', at(7, 7), 1).text).toBe('before\n# target\nafter');
  });
});

describe('toggleList', () => {
  it('marks every touched line', () => {
    expect(toggleList('a\nb', at(0, 3), 'bullet').text).toBe('- a\n- b');
    expect(toggleList('a\nb\nc', at(0, 5), 'number').text).toBe('1. a\n2. b\n3. c');
    expect(toggleList('a\nb', at(0, 3), 'task').text).toBe('- [ ] a\n- [ ] b');
  });

  it('selects the lines it rewrote', () => {
    expect(shown(toggleList('a\nb', at(0, 3), 'bullet')).selected).toBe('- a\n- b');
  });

  it('takes the marker away when every line already has it', () => {
    expect(toggleList('- a\n- b', at(0, 7), 'bullet').text).toBe('a\nb');
    expect(toggleList('1. a\n2. b', at(0, 9), 'number').text).toBe('a\nb');
    expect(toggleList('- [x] a', at(0, 7), 'task').text).toBe('a');
  });

  it('converts one style to another instead of doubling the marker', () => {
    expect(toggleList('- a\n- b', at(0, 7), 'task').text).toBe('- [ ] a\n- [ ] b');
    expect(toggleList('- [ ] a', at(0), 'number').text).toBe('1. a');
    expect(toggleList('1. a', at(0), 'bullet').text).toBe('- a');
  });

  it('does not read a task as a plain bullet', () => {
    expect(toggleList('- [ ] a', at(0), 'bullet').text).toBe('- a');
  });

  it('renumbers from one and keeps the indent', () => {
    expect(toggleList('  a\n  b', at(0, 7), 'number').text).toBe('  1. a\n  2. b');
    expect(toggleList('7. a\n9. b', at(0, 9), 'bullet').text).toBe('- a\n- b');
  });

  it('leaves blank lines inside the span alone', () => {
    expect(toggleList('a\n\nb', at(0, 4), 'bullet').text).toBe('- a\n\n- b');
  });

  it('comes back to the text it started from', () => {
    for (const style of ['bullet', 'number', 'task'] as const) {
      const on = toggleList('a\nb', at(0, 3), style);
      expect(toggleList(on.text, on.selection, style).text).toBe('a\nb');
    }
  });
});
