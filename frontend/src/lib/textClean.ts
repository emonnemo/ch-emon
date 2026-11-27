// Strips book/textbook footnote citations and line markers such as:
// [1], [5], [1-2], ［1］, 【2】, 〔3〕, (5), (10), （3）, ①-⑳, and superscript digits,
// while preserving real 4-digit years like 1996 or (1996).
const BRACKET_CITATION_RE = /[\[［〔【]\s*\d{1,4}(?:\s*[-–—,，]\s*\d{1,4})*\s*[\]］〕】]/g;
const PAREN_INDEX_RE = /[（(]\s*\d{1,3}\s*[）)]/g;
const CIRCLED_AND_SUPERSCRIPT_RE = /[①-⑳⁰¹²³⁴⁵⁶⁷⁸⁹]+/g;

export function stripCitations(text: string): string {
  return text
    .replace(BRACKET_CITATION_RE, "")
    .replace(PAREN_INDEX_RE, "")
    .replace(CIRCLED_AND_SUPERSCRIPT_RE, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([，。！？；：、”’》）】])/g, "$1")
    .trim();
}
