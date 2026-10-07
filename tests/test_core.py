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
    monkeypatch.setattr(transcriber, "transcribe", lambda audio, cb=None, beam_size=None: {
        "duration": 2.0, "language": "he", "model": "fake",
        "segments": [_seg(0, 2, [(0, 1, " שלום", 0.95), (1, 2, " עולם", 0.3)])]})
    jobs._jobs.clear()
    with TestClient(main.app) as c:
        yield c


def test_upload_transcribe_edit_export(client):
    r = client.post("/api/jobs", files={"file": ("הקלטה.mp3", b"fake", "audio/mpeg")}, data={"quality": "fast"})
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
    assert client.post("/api/jobs", data={"url": "https://x.y", "quality": "bad"}).status_code == 400


def test_cloud_maps_timestamps_back_to_original(monkeypatch):
    from types import SimpleNamespace as NS

    from app import cloud

    sr = 16000
    audio = np.zeros(sr * 30, dtype=np.float32)
    # דיבור ב-5–7 שניות וב-20–22 שניות; בין לבין שקט
    monkeypatch.setattr(cloud, "speech_chunks", lambda a: [
        {"start": 5 * sr, "end": 7 * sr}, {"start": 20 * sr, "end": 22 * sr}])
    monkeypatch.setattr(cloud, "_get_model", lambda: object())
    sent = []

    def fake_remote(model, blob, on_fraction):
        sent.append(len(blob))
        on_fraction(0.5)
        w1 = NS(word=" שלום", start=0.5, end=1.0, probability=0.9)
        w2 = NS(word=" עולם", start=2.5, end=3.0, probability=None)
        return [NS(text=" שלום עולם", start=0.5, end=3.0, words=[w1, w2],
                   extra_data={"avg_logprob": -0.2, "no_speech_prob": 0.01})]

    monkeypatch.setattr(cloud, "_remote_segments", fake_remote)
    progress = []
    r = cloud.transcribe(audio, progress.append)
    assert len(sent) == 1
    seg = r["segments"][0]
    assert (seg["words"][0]["start"], seg["words"][1]["start"]) == (5.5, 20.5)
    assert seg["words"][1]["p"] is None
    assert r["duration"] == 30 and progress[-1] == 1.0


def test_cloud_rejected_when_not_configured(client):
    r = client.post("/api/jobs", data={"url": "https://x.y", "engine": "cloud"})
    assert r.status_code == 400
