import { LINK_CODE_SCRIPT } from '@/lib/link-code';

/**
 * The inline script a page with a link code renders FIRST (/client-signin,
 * /invite): it takes the code out of the address while the document is still
 * parsing, before the brand image or any bundle loads (lib/link-code.ts).
 */
export function LinkCodeScript() {
  return <script dangerouslySetInnerHTML={{ __html: LINK_CODE_SCRIPT }} />;
}
