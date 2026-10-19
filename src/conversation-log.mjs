import { MATH_SPANS } from '../shared/board-rich-text.mjs';

// Code-like words in what is said or typed show as code on the page: hex and binary literals, registers with a
// digit (x10, a0, t1, s11), and identifiers with _ or (). Never bare mnemonics or sp/ra/zero: they are English words
// too ("add", "and", "or", "zero"). The words never change; text already in backticks or math ($…$, $$…$$, \(…\),
// \[…\], read just as BoardRichText reads them: "$5 and $10" is money) is left as it is.
const KEPT = new RegExp(`(\`[^\`]*\`|${MATH_SPANS.source})`);
const CODE = /(?<![\w`$])(?:0x[0-9a-fA-F]+|0b[01]+|[xast]\d{1,2}|[A-Za-z_]\w*_\w*|[A-Za-z_]\w*\(\))(?![\w`])/g;

/** The text as markdown for BoardRichText inline, with code-like words in backticks. */
export const codeify = text => String(text ?? '').split(KEPT).map((part, i) => i % 2 ? part : part.replace(CODE, '`$&`')).join('');
// A note-to-self tag the voice model sometimes copies from its context ("[focused]") is never shown; code such as
// `a[i]` (a bracket right after a name) and markdown links stay.
export const untag = text => String(text ?? '').replace(/(^|[^\w\]])\[[A-Za-z][A-Za-z' ]{1,28}\](?!\()\s*/g, '$1').trim();
