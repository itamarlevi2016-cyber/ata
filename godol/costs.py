"""What a run costs, from the token counts the API reports. Prices are per million tokens (first-party API list
prices) and the result is an estimate: the Console is the authority on what is billed."""
from __future__ import annotations

import json
import time
from pathlib import Path

from . import config

# model: (input, output, cache read); a cache write costs 1.25x the input price
PRICES = {
    "claude-opus-5-5": (4.0, 20.0, 0.20),
    "claude-sonnet-5-5": (2.0, 10.0, 0.20),
    "claude-haiku-5-5": (0.10, 0.50, 0.01),
    "claude-opus-5": (5.0, 25.0, 0.50),
    "claude-opus-4-8": (5.0, 25.0, 0.50),
}
MODELS = {"claude-sonnet-5-5": "Sonnet 5.5 (זול)", "claude-opus-5-5": "Opus 5.5 (איכות גבוהה)"}


def cost_usd(model: str, usage: dict) -> float:
    pin, pout, pread = PRICES.get(model) or PRICES["claude-opus-5-5"]   # unknown model: price it like Opus, never lower
    return (usage.get("input_tokens", 0) * pin + usage.get("output_tokens", 0) * pout
            + usage.get("cache_read", 0) * pread + usage.get("cache_write", 0) * pin * 1.25) / 1e6


def _ledger() -> Path:
    return config.WORK / "ledger.jsonl"


def record(book_id: str, kind: str, model: str, usage: dict, page: int | None = None) -> float:
    config.ensure_dirs()
    c = cost_usd(model, usage)
    with _ledger().open("a", encoding="utf-8") as f:
        f.write(json.dumps({"ts": time.time(), "book": book_id, "kind": kind, "model": model, "page": page, "usage": usage, "usd": c}, ensure_ascii=False) + "\n")
    return c


def entries() -> list[dict]:
    p = _ledger()
    if not p.exists():
        return []
    out = []
    for line in p.read_text(encoding="utf-8").splitlines():
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            pass
    return out


def summary() -> dict:
    es = entries()
    by_kind: dict[str, float] = {}
    by_book: dict[str, float] = {}
    pages_tr = set()
    for e in es:
        by_kind[e["kind"]] = by_kind.get(e["kind"], 0) + e["usd"]
        by_book[e["book"]] = by_book.get(e["book"], 0) + e["usd"]
        if e["kind"] == "translate" and e.get("page") is not None:
            pages_tr.add((e["book"], e["page"]))
    spent = sum(e["usd"] for e in es)
    tr_total = by_kind.get("translate", 0) + by_kind.get("verify", 0)
    avg = tr_total / len(pages_tr) if pages_tr else None
    return {"spent": round(spent, 4), "by_kind": {k: round(v, 4) for k, v in by_kind.items()}, "by_book": {k: round(v, 4) for k, v in by_book.items()},
            "pages": len(pages_tr), "avg_per_page": round(avg, 4) if avg else None}
