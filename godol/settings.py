"""Settings chosen in the app (model, effort, independent checker, budget). Stored in work/settings.json."""
from __future__ import annotations

import json
import os

from . import config, costs

DEFAULTS = {"model": os.environ.get("GODOL_MODEL", "claude-sonnet-5-5"), "effort": os.environ.get("GODOL_EFFORT", "high"),
            "verify": os.environ.get("GODOL_VERIFY", "0") == "1", "budget_usd": 0.0}
EFFORTS = ["low", "medium", "high"]


def _path():
    return config.WORK / "settings.json"


def get() -> dict:
    s = dict(DEFAULTS)
    try:
        s.update(json.loads(_path().read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError):
        pass
    return s


def save(new: dict) -> dict:
    s = get()
    if new.get("model") in costs.MODELS or (isinstance(new.get("model"), str) and new["model"] in costs.PRICES):
        s["model"] = new["model"]
    if new.get("effort") in EFFORTS:
        s["effort"] = new["effort"]
    if "verify" in new:
        s["verify"] = bool(new["verify"])
    if "budget_usd" in new:
        try:
            s["budget_usd"] = max(0.0, float(new["budget_usd"]))
        except (TypeError, ValueError):
            pass
    config.ensure_dirs()
    _path().write_text(json.dumps(s, ensure_ascii=False), encoding="utf-8")
    return s


def apply() -> dict:
    """Puts the chosen model and effort where the rest of the code reads them."""
    s = get()
    config.MODEL = s["model"]
    config.VERIFIER_MODEL = s["model"]
    config.EFFORT = s["effort"]
    return s


class BudgetReached(Exception):
    pass


def check_budget() -> None:
    b = get()["budget_usd"]
    if b and costs.summary()["spent"] >= b:
        raise BudgetReached(f"הגעתם לתקרת התקציב ({b:g}$). ההוצאה המוערכת עד כה {costs.summary()['spent']:.2f}$. אפשר להעלות את התקרה במסך ההגדרות.")
