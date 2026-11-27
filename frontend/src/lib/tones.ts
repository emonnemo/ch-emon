const TONE_1 = /[āēīōūǖĀĒĪŌŪǕ]/;
const TONE_2 = /[áéíóúǘÁÉÍÓÚǗ]/;
const TONE_3 = /[ǎěǐǒǔǚǍĚǏǑǓǙ]/;
const TONE_4 = /[àèìòùǜÀÈÌÒÙǛ]/;

export type MandarinTone = 1 | 2 | 3 | 4 | 5;

export function detectSyllableTone(syllable: string): MandarinTone {
  if (TONE_1.test(syllable)) return 1;
  if (TONE_2.test(syllable)) return 2;
  if (TONE_3.test(syllable)) return 3;
  if (TONE_4.test(syllable)) return 4;
  return 5;
}

export const TONE_TEXT_CLASS: Record<MandarinTone, string> = {
  1: "text-red-600",
  2: "text-emerald-700",
  3: "text-blue-700",
  4: "text-purple-700",
  5: "text-stone-500",
};

export interface ColoredUnit {
  hanzi: string;
  pinyin: string;
  tone: MandarinTone;
}

/**
 * Pairs characters of a grouped Chinese word with its space-separated pinyin syllables
 * so each character/syllable can be colored by its Mandarin tone.
 */
export function splitWordToneUnits(word: string, pinyin?: string): ColoredUnit[] | null {
  if (!pinyin) return null;
  const chars = Array.from(word);
  const syllables = pinyin.trim().split(/\s+/).filter(Boolean);
  if (chars.length !== syllables.length) return null;

  return chars.map((ch, idx) => ({
    hanzi: ch,
    pinyin: syllables[idx],
    tone: detectSyllableTone(syllables[idx]),
  }));
}
