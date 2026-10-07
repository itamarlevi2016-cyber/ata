import time

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import diarizer, exporters


def _seg(start, end, words):
    ws = [{"start": s, "end": e, "word": w, "p": p} for s, e, w, p in words]
    return {"start": start, "end": end, "text": "".join(w["word"] for w in ws).strip(),
            "words": ws, "speaker": None}


def test_assign_speakers_splits_on_speaker_change():
    segs = [_seg(0, 4, [(0, 1, " שלום", 0.9), (1, 2, " לך", 0.9), (2.5, 3, " היי", 0.9), (3, 4, " גם", 0.4)])]
    turns = [{"start": 0, "end": 2.2, "speaker": "A"}, {"start": 2.3, "end": 4, "speaker": "B"}]
    out = diarizer.assign_speakers(segs, turns)
    assert [(s["speaker"], s["text"]) for s in out] == [("A", "שלום לך"), ("B", "היי גם")]
    assert diarizer.speaker_names(out) == {"A": "דובר 1", "B": "דובר 2"}


def test_assign_speakers_merges_same_speaker():
    segs = [_seg(0, 1, [(0, 1, " א", 1)]), _seg(1.2, 2, [(1.2, 2, " ב", 1)])]
    out = diarizer.assign_speakers(segs, [{"start": 0, "end": 2, "speaker": "A"}])
    assert len(out) == 1 and out[0]["text"] == "א ב"


def test_exporters():
    result = {"segments": [_seg(3661.5, 3663, [(3661.5, 3663, " בדיקה", 1)])], "speakers": {}}
    result["segments"][0]["speaker"] = "S"
    result["speakers"] = {"S": "דנה"}
    assert exporters.to_txt(result).strip() == "[01:01:01] דנה: בדיקה"
    assert "01:01:01,500 --> 01:01:03,000" in exporters.to_srt(result)
    assert exporters.to_docx(result, "כותרת")[:2] == b"PK"


@pytest.fixture
def client(tmp_path, monkeypatch):
    from app import config, jobs, main, transcriber

    monkeypatch.setattr(config, "JOBS_DIR", tmp_path / "jobs")
    monkeypatch.setattr(transcriber, "load_audio", lambda p: np.zeros(16000 * 2, dtype=np.float32))
    monkeypatch.setattr(transcriber, "get_model", lambda: None)
    monkeypatch.setattr(transcriber, "transcribe", lambda audio, cb=None: {
        "duration": 2.0, "language": "he", "model": "fake",
        "segments": [_seg(0, 2, [(0, 1, " שלום", 0.95), (1, 2, " עולם", 0.3)])]})
    jobs._jobs.clear()
    with TestClient(main.app) as c:
        yield c


def test_upload_transcribe_edit_export(client):
    r = client.post("/api/jobs", files={"file": ("הקלטה.mp3", b"fake", "audio/mpeg")})
    assert r.status_code == 200, r.text
    job_id = r.json()["id"]
    for _ in range(50):
        job = client.get(f"/api/jobs/{job_id}").json()
        if job["status"] in ("done", "error"):
            break
        time.sleep(0.05)
    assert job["status"] == "done", job
    assert job["title"] == "הקלטה"

    res = client.get(f"/api/jobs/{job_id}/result").json()
    assert res["segments"][0]["text"] == "שלום עולם"

    r = client.put(f"/api/jobs/{job_id}/result", json={"edits": [{"i": 0, "text": "שלום עולם!"}]})
    assert r.json()["segments"][0]["edited"] is True
    assert client.get(f"/api/jobs/{job_id}/export/txt").text.strip() == "[00:00:00] שלום עולם!"
    assert client.get(f"/api/jobs/{job_id}/audio").content == b"fake"
    assert client.delete(f"/api/jobs/{job_id}").status_code == 200


def test_requires_input(client):
    assert client.post("/api/jobs", data={"url": ""}).status_code == 400
