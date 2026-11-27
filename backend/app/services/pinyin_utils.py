import re

TONE_MARKS: dict[str, tuple[str, str, str, str]] = {
    "a": ("ā", "á", "ǎ", "à"),
    "e": ("ē", "é", "ě", "è"),
    "i": ("ī", "í", "ǐ", "ì"),
    "o": ("ō", "ó", "ǒ", "ò"),
    "u": ("ū", "ú", "ǔ", "ù"),
    "ü": ("ǖ", "ǘ", "ǚ", "ǜ"),
    "A": ("Ā", "Á", "Ǎ", "À"),
    "E": ("Ē", "É", "Ě", "È"),
    "I": ("Ī", "Í", "Ǐ", "Ì"),
    "O": ("Ō", "Ó", "Ǒ", "Ò"),
    "U": ("Ū", "Ú", "Ǔ", "Ù"),
    "Ü": ("Ǖ", "Ǘ", "Ǚ", "Ǜ"),
}

VOWELS = set("aeiouüAEIOUÜ")
_SYLLABLE_RE = re.compile(r"^([a-zA-ZüÜ:]+)([1-5])$")


def convert_syllable(syllable: str) -> str:
    """Convert a single numbered pinyin syllable (e.g. 'bing1', 'lu:4') to tone-marked pinyin."""
    cleaned = syllable.replace("u:", "ü").replace("U:", "Ü")
    match = _SYLLABLE_RE.match(cleaned)
    if not match:
        return cleaned

    base, tone_str = match.group(1), match.group(2)
    tone = int(tone_str)
    if tone == 5:
        return base

    tone_idx = tone - 1
    lower = base.lower()

    # Standard pinyin tone placement rules:
    # 1. 'a' or 'e' always takes the tone mark.
    for target in ("a", "e"):
        pos = lower.find(target)
        if pos != -1:
            ch = base[pos]
            return base[:pos] + TONE_MARKS[ch][tone_idx] + base[pos + 1 :]

    # 2. In 'ou', 'o' takes the tone mark.
    ou_pos = lower.find("ou")
    if ou_pos != -1:
        ch = base[ou_pos]
        return base[:ou_pos] + TONE_MARKS[ch][tone_idx] + base[ou_pos + 1 :]

    # 3. Otherwise, the last vowel takes the tone mark (handles 'iu', 'ui', single vowels).
    for pos in range(len(base) - 1, -1, -1):
        ch = base[pos]
        if ch in VOWELS:
            return base[:pos] + TONE_MARKS[ch][tone_idx] + base[pos + 1 :]

    return base


def numbered_to_toned_pinyin(pinyin_num: str) -> str:
    """Convert space-separated numbered pinyin (e.g. 'bing1 ji1 ling2') to 'bīng jī líng'."""
    parts = pinyin_num.strip().split()
    return " ".join(convert_syllable(part) for part in parts)


def normalize_pinyin_key(pinyin: str) -> str:
    """Normalize tone-marked pinyin for matching (lowercase, collapsed spaces)."""
    return "".join(pinyin.lower().split())
