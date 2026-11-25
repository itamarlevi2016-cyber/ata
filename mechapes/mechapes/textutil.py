"""Tokenizing and normalizing text (Hebrew-aware)."""
import re
from array import array

# Hebrew points and cantillation marks (but not the punctuation inside the
# same Unicode block: maqaf U+05BE, paseq U+05C0, sof pasuq U+05C3,
# nun hafukha U+05C6).
_MARKS = "֑-ׇֽֿׁׂׅׄ"
# Quote-like characters that may appear inside a word: רמב"ם, ז'
_INNER_QUOTES = "'\"׳״’”"

TOKEN_RE = re.compile(
    rf"[\w{_MARKS}]+(?:[{_INNER_QUOTES}][\w{_MARKS}]+)*", re.UNICODE
)
_STRIP_RE = re.compile(rf"[{_MARKS}{_INNER_QUOTES}_]")

HEB_PREFIX_LETTERS = "והבכלמש"
MAX_PREFIX_LEN = 3
MAX_TOKEN_LEN = 60


def normalize_word(word: str) -> str:
    """Lower-case, remove niqqud/cantillation and inner quote marks."""
    return _STRIP_RE.sub("", word).lower()


def tokenize(text: str):
    """Return (terms, starts, ends): normalized words and their char offsets."""
    terms = []
    starts = array("I")
    ends = array("I")
    for m in TOKEN_RE.finditer(text):
        t = normalize_word(m.group())
        if not t or len(t) > MAX_TOKEN_LEN:
            continue
        terms.append(t)
        starts.append(m.start())
        ends.append(m.end())
    return terms, starts, ends


def is_hebrew_word(word: str) -> bool:
    return bool(word) and all("א" <= c <= "ת" for c in word)


def strip_prefix_ok(term: str, base_len: int) -> bool:
    """True if term = (0..3 Hebrew prefix letters) + something of base_len."""
    plen = len(term) - base_len
    if plen < 0 or plen > MAX_PREFIX_LEN:
        return False
    return all(c in HEB_PREFIX_LETTERS for c in term[:plen])


def prefix_variants(word: str):
    """All forms of a Hebrew word with up to 3 prefix letters (והבכלמש)."""
    out = [word]
    level = [""]
    for _ in range(MAX_PREFIX_LEN):
        level = [p + c for p in level for c in HEB_PREFIX_LETTERS]
        out.extend(p + word for p in level)
    return out


_FINALS_START = set("ךםןףץ")


def fix_reversed_hebrew(text: str) -> str:
    """Some PDFs store Hebrew in visual (reversed) order. Detect that by
    counting words that *start* with a final letter (impossible in normal
    Hebrew) and, if so, reverse each line."""
    words = re.findall(r"[א-ת]{2,}", text)
    if len(words) < 5:
        return text
    starts_final = sum(1 for w in words if w[0] in _FINALS_START)
    ends_final = sum(1 for w in words if w[-1] in _FINALS_START)
    if starts_final > ends_final and starts_final >= 3:
        return "\n".join(line[::-1] for line in text.split("\n"))
    return text
