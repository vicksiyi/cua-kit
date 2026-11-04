import MarkdownIt from "markdown-it";
import { createTextPaste, textMarkdownOptions } from "./text_paste";
/** Original N9 uses markdown-it with these exact options; CUA owns whitespace and clipboard policy. */
export const markdownTextPaste = createTextPaste(
  new MarkdownIt(textMarkdownOptions),
);
