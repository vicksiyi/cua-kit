import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { Parser } from 'htmlparser2';
import { assert } from './errors.js';
import type { ClipboardContent } from './clipboard.js';
import type { PasteOptions } from './types.js';

export function plainTextFromHtml(html: string): string {
  let plain = '';
  const parser = new Parser({ontext: value => { plain += value; }});
  parser.end(html);
  return plain;
}

/** Host-side format handling, independent of a browser realm or an agent runtime. */
export function preparePasteContent(text: string, format: PasteOptions['format'] = 'text'): ClipboardContent {
  assert(typeof text === 'string' && text.length <= 200000,'INVALID_ARGUMENT','Paste input exceeds size budget.');
  assert(['text','md','html'].includes(format),'INVALID_ARGUMENT','Unsupported paste format.');
  if (format === 'text') return {text};
  const html = sanitizeHtml(format === 'md' ? marked.parse(text,{async:false}) : text);
  const plain = plainTextFromHtml(html);
  // Original Markdown is the fallback for plain-text editors; HTML is for rich editors.
  return {text:format === 'md' ? text : plain,html};
}
