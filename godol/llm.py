"""Model access. `ClaudeLLM` calls the Anthropic API (vision in, structured JSON out, prompt caching on
the guide). `MockLLM` is a deterministic stand-in so that the pipeline can be exercised without a key."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

from . import config
from .schema import TRANSLATION_SCHEMA, VERIFY_SCHEMA


class LLMError(Exception):
    def __init__(self, kind: str, message: str, retryable: bool = False):
        super().__init__(message)
        self.kind = kind
        self.retryable = retryable


@dataclass
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read: int = 0
    cache_write: int = 0

    def add(self, o: "Usage") -> None:
        self.input_tokens += o.input_tokens
        self.output_tokens += o.output_tokens
        self.cache_read += o.cache_read
        self.cache_write += o.cache_write

    def to_dict(self) -> dict:
        return self.__dict__.copy()


@dataclass
class Reply:
    data: dict
    usage: Usage = field(default_factory=Usage)
    raw: str = ""


class ClaudeLLM:
    def __init__(self, model: str | None = None):
        import anthropic

        self.anthropic = anthropic
        self.client = anthropic.Anthropic()  # key from ANTHROPIC_API_KEY or an `ant auth login` profile
        self.model = model or config.MODEL

    def _call(self, system, content, schema, max_tokens: int, model: str | None = None) -> Reply:
        a = self.anthropic
        try:
            with self.client.messages.stream(
                model=model or self.model,
                max_tokens=max_tokens,
                system=system,
                thinking={"type": "adaptive"},
                output_config={"effort": config.EFFORT, "format": {"type": "json_schema", "schema": schema}},
                messages=[{"role": "user", "content": content}],
            ) as stream:
                msg = stream.get_final_message()
        except a.RateLimitError as e:
            raise LLMError("rate_limited", f"מגבלת קצב: {e}", retryable=True)
        except a.APIConnectionError as e:
            raise LLMError("connection", f"שגיאת רשת: {e}", retryable=True)
        except a.APIStatusError as e:
            code = getattr(e, "status_code", 0)
            raise LLMError("api_error", f"שגיאת API {code}: {e}", retryable=code >= 500 or code == 429)
        if msg.stop_reason == "refusal":
            raise LLMError("refusal", "המודל סירב לעבד את העמוד", retryable=False)
        if msg.stop_reason == "max_tokens":
            raise LLMError("truncated", "התשובה נחתכה (max_tokens). אפשר להקטין את מספר העמודים בקריאה.", retryable=False)
        text = next((b.text for b in msg.content if b.type == "text"), "")
        try:
            data = json.loads(text)
        except json.JSONDecodeError as e:
            raise LLMError("bad_json", f"JSON לא תקין מהמודל: {e}", retryable=True)
        u = msg.usage
        usage = Usage(u.input_tokens or 0, u.output_tokens or 0,
                      getattr(u, "cache_read_input_tokens", 0) or 0, getattr(u, "cache_creation_input_tokens", 0) or 0)
        return Reply(data, usage, text)

    def translate(self, system, content) -> Reply:
        return self._call(system, content, TRANSLATION_SCHEMA, config.MAX_OUTPUT_TOKENS)

    def verify(self, system, content) -> Reply:
        return self._call(system, content, VERIFY_SCHEMA, 8000, model=config.VERIFIER_MODEL)


class MockLLM:
    """Builds a plausible page result from the text layer. For plumbing tests and demos only."""

    def __init__(self):
        self.calls = 0

    @staticmethod
    def _el(**k):
        base = dict(type="body_paragraph", id="", text="", region="text", marker="", number=0, letter="", ref="",
                    continues_prev=False, continues_next=False, reason="", words="", target="", page=0)
        base.update(k)
        return base

    def translate(self, system, content) -> Reply:
        self.calls += 1
        text = "\n".join(b["text"] for b in content if b["type"] == "text")
        pages = sorted({int(x) for x in re.findall(r"--- PAGE (\d+) IMAGE", text)})
        out = []
        for n in pages:
            m = re.search(rf"PAGE {n} TEXT LAYER[^\n]*\n(.*?)(?=\n--- |\nReturn the JSON now|\Z)", text, re.S)
            layer = (m.group(1) if m else "").strip()
            lines = [l.strip() for l in layer.splitlines() if l.strip()]
            els, k = [], 0
            if lines and lines[0].startswith("CHAPTER"):
                els.append(self._el(type="heading_chapter", id=f"h{n}", text="פרק שלישי\nשם הפרק", page=n))
                lines = lines[1:]
            paras = [l for l in lines if not l.startswith("NOTE") and not l.startswith("FN")]
            for i, l in enumerate(paras):
                pid = f"p{n}-{i + 1}"
                t = f"תרגום לדוגמה של: {l[:60]}"
                if i == 0:
                    t += " ⟦fn:f%d-a⟧" % n
                if i == 1:
                    t += " ⟦nn:%d⟧" % (n % 100)
                els.append(self._el(type="body_paragraph", id=pid, text=t, region="frame", page=n,
                                    continues_next=(i == len(paras) - 1 and l.endswith(","))))
            els.append(self._el(type="footnote_source", id=f"f{n}-a", text="הערת שוליים לדוגמה", marker="a", page=n))
            els.append(self._el(type="numbered_note", id=f"n{n}", text="הערה ממוספרת לדוגמה", number=n % 100, region="notes", page=n))
            first_he = paras[0] if paras else ""
            out.append(dict(page=n, elements=els,
                            counts=dict(source_footnotes=1, asterisk_footnotes=0, numbered_notes=1, excursus_headings=0),
                            first_sentence_src=first_he[:60], last_sentence_src=(paras[-1] if paras else "")[:60],
                            first_sentence_he=f"תרגום לדוגמה של: {first_he[:60]}", last_sentence_he=f"תרגום לדוגמה של: {(paras[-1] if paras else '')[:60]}",
                            dropped_artifacts=["כותרת עמוד"],
                            new_names=[dict(en="Zalman Test", he="זלמן טסט", note="mock")] if n % 2 == 0 else []))
        return Reply({"pages": out}, Usage(100, 100), "")

    def verify(self, system, content) -> Reply:
        self.calls += 1
        m = re.search(r"Page (\d+)", content[0]["text"])
        return Reply({"page": int(m.group(1)) if m else 0, "differences": []}, Usage(10, 10), "")


def make_llm():
    if config.USE_MOCK:
        return MockLLM()
    return ClaudeLLM()
