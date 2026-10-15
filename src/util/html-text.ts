// Linear-time HTML text helpers for fetched pages (up to 25 MB, attacker
// controlled). They replace regex chains such as `<[^>]+>` and
// `<script[\s\S]*?</script>`, which backtrack quadratically on input with many
// unclosed '<' or '<script'. Every scan here only moves forward, and gives up
// on the remainder as soon as the closing delimiter is absent (an indexOf miss
// is final: nothing later can close either).

// Lowercases ASCII letters only, so indices into the result stay valid for the
// original text (String#toLowerCase can change the length of some characters).
function asciiLower(text: string): string {
  return text.replace(/[A-Z]+/g, (m) => m.toLowerCase());
}

/**
 * Replaces every `<...>` span with `replace(inner)` (default a single space).
 * Same tag shape as the regex `<[^>]+>`: a '<' up to the next '>', with at
 * least one character between. A '<' with no later '>' is left as plain text.
 * `inner` is the text between the brackets.
 */
export function stripHtmlTags(text: string, replace: (inner: string) => string = () => ' '): string {
  let open = text.indexOf('<');
  if (open < 0) return text;
  const parts: string[] = [];
  let pos = 0;
  while (open >= 0) {
    const close = text.indexOf('>', open + 1);
    if (close < 0) break;
    if (close === open + 1) {
      // "<>" is not a tag; carry on from the '>'.
      open = text.indexOf('<', close);
      continue;
    }
    parts.push(text.slice(pos, open), replace(text.slice(open + 1, close)));
    pos = close + 1;
    open = text.indexOf('<', pos);
  }
  parts.push(text.slice(pos));
  return parts.join('');
}

/**
 * Replaces each `<name ...</name>` block (case-insensitive) with a space, for
 * each element name in turn. A block with no closing tag is left in place as
 * text, as the regex `<name[\s\S]*?</name>` it replaces did.
 */
export function removeHtmlElements(text: string, names: readonly string[]): string {
  let out = text;
  for (const name of names) {
    const openTag = '<' + name;
    const closeTag = '</' + name + '>';
    const lower = asciiLower(out);
    const parts: string[] = [];
    let pos = 0;
    for (;;) {
      const start = lower.indexOf(openTag, pos);
      if (start < 0) break;
      const end = lower.indexOf(closeTag, start + openTag.length);
      if (end < 0) break;
      parts.push(out.slice(pos, start), ' ');
      pos = end + closeTag.length;
    }
    if (pos > 0) {
      parts.push(out.slice(pos));
      out = parts.join('');
    }
  }
  return out;
}
