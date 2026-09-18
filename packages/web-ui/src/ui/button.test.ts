import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button } from './button';
import { SubmitButton } from './submit-button';

const html = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el);

describe('Button type', () => {
  it('is inert by default, so it cannot submit a form it happens to sit in', () => {
    // A typeless <button> is type=submit in HTML. That default sent the
    // assistant's message whenever attach / pick / mic / Stop was clicked.
    expect(html(createElement(Button, null, 'Attach'))).toContain('type="button"');
  });

  it('submits only when it says so', () => {
    expect(html(createElement(Button, { type: 'submit' }, 'Send'))).toContain('type="submit"');
    expect(html(createElement(SubmitButton, null, 'Save'))).toContain('type="submit"');
  });

  it('does not stamp a button type onto an asChild link', () => {
    const out = html(
      createElement(Button, { asChild: true }, createElement('a', { href: '/x' }, 'Go')),
    );
    expect(out).toContain('<a ');
    expect(out).not.toContain('type=');
  });
});
