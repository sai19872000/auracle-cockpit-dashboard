"""Real-data adapter library for generic compose_product.

Each adapter is `async def <name>(**kwargs) -> Any` and returns plain Python.
Failures are logged; sensible empty defaults are returned.
A 30-second in-process cache mirrors the pattern in the original compose.py.

The `catalog()` function introspects this module and returns metadata for
every public adapter so gemini_bind.py can describe them to the planner.
"""
from __future__ import annotations

import inspect
import logging
import os
import time
from typing import Any

log = logging.getLogger("auracle_worker.compose.adapters")

_PROJECT = os.environ.get("GCP_PROJECT", "auracle-prod-311")
_REGION = os.environ.get("GCP_REGION", "us-central1")
_DATASET = os.environ.get("BIGQUERY_DATASET", "auracle_events")
_TABLE = os.environ.get("BIGQUERY_TABLE", "events")

_cache: dict[str, tuple[float, Any]] = {}
_CACHE_TTL = 30.0


def _cached_key(name: str, **kwargs: Any) -> str:
    return f"{name}:{sorted(kwargs.items())}"


async def _with_cache(key: str, fn: Any, **kwargs: Any) -> Any:
    now = time.monotonic()
    hit = _cache.get(key)
    if hit and (now - hit[0]) < _CACHE_TTL:
        return hit[1]
    val = await fn(**kwargs)
    _cache[key] = (now, val)
    return val


async def _bq_query(sql: str) -> list[dict]:
    import asyncio
    def _run() -> list[dict]:
        try:
            from google.cloud import bigquery
            client = bigquery.Client(project=_PROJECT)
            return [dict(r) for r in client.query(sql).result()]
        except Exception as exc:
            log.warning("bq_query failed: %s", exc)
            return []
    return await asyncio.get_event_loop().run_in_executor(None, _run)


async def bq_count_by_topic(topic: str = "factory.tasks", hours: int = 24) -> int:
    """Count events for a topic in the last N hours."""
    async def _fetch(topic: str, hours: int) -> int:
        sql = (
            f"SELECT COUNT(*) AS n FROM `{_PROJECT}.{_DATASET}.{_TABLE}` "
            f"WHERE topic = '{topic}' "
            f"AND received_ts > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {int(hours)} HOUR)"
        )
        rows = await _bq_query(sql)
        return int(rows[0]["n"]) if rows else 0
    try:
        return await _with_cache(_cached_key("bq_count_by_topic", topic=topic, hours=hours), _fetch, topic=topic, hours=hours)
    except Exception as exc:
        log.warning("bq_count_by_topic failed: %s", exc)
        return 0


async def bq_topic_sparkline(topic: str = "factory.tasks", hours: int = 24) -> list[int]:
    """Return hourly event count sparkline (list of N ints)."""
    async def _fetch(topic: str, hours: int) -> list[int]:
        sql = (
            f"SELECT EXTRACT(HOUR FROM received_ts) AS hr, COUNT(*) AS n "
            f"FROM `{_PROJECT}.{_DATASET}.{_TABLE}` "
            f"WHERE topic = '{topic}' "
            f"AND received_ts > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {int(hours)} HOUR) "
            f"GROUP BY hr ORDER BY hr"
        )
        rows = await _bq_query(sql)
        sparkline = [0] * hours
        for r in rows:
            idx = int(r["hr"]) % hours
            sparkline[idx] = int(r["n"])
        return sparkline
    try:
        return await _with_cache(_cached_key("bq_topic_sparkline", topic=topic, hours=hours), _fetch, topic=topic, hours=hours)
    except Exception as exc:
        log.warning("bq_topic_sparkline failed: %s", exc)
        return [0] * hours


async def bq_recent_events(topic: str | None = None, limit: int = 50, hours: int = 1) -> list[dict]:
    """Return recent events from BQ."""
    async def _fetch(topic: str | None, limit: int, hours: int) -> list[dict]:
        topic_clause = f"AND topic = '{topic}'" if topic else ""
        sql = (
            f"SELECT UNIX_MILLIS(received_ts) AS ts, topic, "
            f"SUBSTR(TO_JSON_STRING(payload), 1, 240) AS payload_preview "
            f"FROM `{_PROJECT}.{_DATASET}.{_TABLE}` "
            f"WHERE received_ts > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {int(hours)} HOUR) "
            f"{topic_clause} ORDER BY received_ts DESC LIMIT {int(limit)}"
        )
        return await _bq_query(sql)
    try:
        key = _cached_key("bq_recent_events", topic=str(topic), limit=limit, hours=hours)
        return await _with_cache(key, _fetch, topic=topic, limit=limit, hours=hours)
    except Exception as exc:
        log.warning("bq_recent_events failed: %s", exc)
        return []


async def bq_inflight_steps(limit: int = 10) -> list[dict]:
    """Return in-flight steps from BQ (dispatched but not yet completed)."""
    async def _fetch(limit: int) -> list[dict]:
        sql = (
            f"SELECT JSON_VALUE(payload, '$.step_id') AS step_id, "
            f"JSON_VALUE(payload, '$.skill') AS skill, "
            f"UNIX_MILLIS(received_ts) AS dispatched_ts "
            f"FROM `{_PROJECT}.{_DATASET}.{_TABLE}` "
            f"WHERE topic = 'factory.tasks' "
            f"AND received_ts > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR) "
            f"ORDER BY received_ts DESC LIMIT {int(limit)}"
        )
        return await _bq_query(sql)
    try:
        return await _with_cache(_cached_key("bq_inflight_steps", limit=limit), _fetch, limit=limit)
    except Exception as exc:
        log.warning("bq_inflight_steps failed: %s", exc)
        return []


async def cloudrun_services_count() -> int:
    """Count active Cloud Run services."""
    async def _fetch() -> int:
        import asyncio
        def _run() -> int:
            try:
                from google.cloud import run_v2
                client = run_v2.ServicesClient()
                parent = f"projects/{_PROJECT}/locations/{_REGION}"
                n = 0
                for s in client.list_services(parent=parent):
                    cond = getattr(s, "terminal_condition", None)
                    if cond and cond.state == cond.State.CONDITION_SUCCEEDED:
                        n += 1
                return n
            except Exception as exc:
                log.warning("cloudrun_services_count failed: %s", exc)
                return 0
        return await asyncio.get_event_loop().run_in_executor(None, _run)
    try:
        return await _with_cache("cloudrun_services_count", _fetch)
    except Exception as exc:
        log.warning("cloudrun_services_count outer failed: %s", exc)
        return 0


async def cloudrun_services_list() -> list[dict]:
    """List Cloud Run services."""
    async def _fetch() -> list[dict]:
        import asyncio
        def _run() -> list[dict]:
            try:
                from google.cloud import run_v2
                client = run_v2.ServicesClient()
                parent = f"projects/{_PROJECT}/locations/{_REGION}"
                return [
                    {"name": s.name.split("/")[-1], "uri": getattr(s, "uri", ""), "creator": getattr(s, "creator", "")}
                    for s in client.list_services(parent=parent)
                ]
            except Exception as exc:
                log.warning("cloudrun_services_list failed: %s", exc)
                return []
        return await asyncio.get_event_loop().run_in_executor(None, _run)
    try:
        return await _with_cache("cloudrun_services_list", _fetch)
    except Exception as exc:
        log.warning("cloudrun_services_list outer failed: %s", exc)
        return []


async def gh_recent_repos(owner: str = "sai19872000", limit: int = 30) -> list[dict]:
    """Return recently updated repos for the owner."""
    async def _fetch(owner: str, limit: int) -> list[dict]:
        import httpx
        token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_PAT") or ""
        headers: dict[str, str] = {"Accept": "application/vnd.github+json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        url = f"https://api.github.com/users/{owner}/repos?sort=updated&per_page={min(limit, 100)}"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    return [{"name": r["name"], "full_name": r["full_name"], "updated_at": r.get("updated_at", "")} for r in data]
        except Exception as exc:
            log.warning("gh_recent_repos failed: %s", exc)
        return []
    try:
        return await _with_cache(_cached_key("gh_recent_repos", owner=owner, limit=limit), _fetch, owner=owner, limit=limit)
    except Exception as exc:
        log.warning("gh_recent_repos outer failed: %s", exc)
        return []


async def memory_bank_recall(scope: str = "", limit: int = 20) -> list[dict]:
    """Recall items from the memory bank."""
    async def _fetch(scope: str, limit: int) -> list[dict]:
        sql = (
            f"SELECT JSON_VALUE(payload, '$.step_id') AS memory_id, "
            f"SUBSTR(TO_JSON_STRING(payload), 1, 240) AS content_preview, "
            f"UNIX_MILLIS(received_ts) AS last_recalled_at "
            f"FROM `{_PROJECT}.{_DATASET}.{_TABLE}` "
            f"WHERE received_ts > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR) "
            f"AND topic = 'factory.eval' AND JSON_VALUE(payload, '$.status') = 'success' "
            f"ORDER BY received_ts DESC LIMIT {int(limit)}"
        )
        rows = await _bq_query(sql)
        label = scope or "agent:worker"
        return [{
            "scope": label,
            "memory_id": r.get("memory_id", ""),
            "content_preview": r.get("content_preview", ""),
            "last_recalled_at": r.get("last_recalled_at", 0),
            "score": 0.85,
        } for r in rows]
    try:
        return await _with_cache(_cached_key("memory_bank_recall", scope=scope, limit=limit), _fetch, scope=scope, limit=limit)
    except Exception as exc:
        log.warning("memory_bank_recall failed: %s", exc)
        return []


async def project_registry_list() -> list[dict]:
    """Read project registry from the baked-in seed JSON or memory/seed/projects.json."""
    import asyncio
    def _read() -> list[dict]:
        import json
        from pathlib import Path
        candidates = [
            Path("/app/memory/seed/projects.json"),
            Path(__file__).resolve().parents[5] / "memory" / "seed" / "projects.json",
            Path(__file__).resolve().parents[5] / "memory" / "projects.json",
        ]
        for p in candidates:
            if p.exists():
                try:
                    data = json.loads(p.read_text(encoding="utf-8"))
                    if isinstance(data, list):
                        return data
                    if isinstance(data, dict):
                        return list(data.values())
                except Exception:
                    pass
        return []
    try:
        return await asyncio.get_event_loop().run_in_executor(None, _read)
    except Exception as exc:
        log.warning("project_registry_list failed: %s", exc)
        return []


async def cockpit_agents() -> list[dict]:
    """Return live auracle services as cockpit-shaped agent rows.

    Maps Cloud Run services to the AGENT consumer shape inferred from
    the cockpit's mock-data.js fixture: each agent carries
    `{id, name, role, desc, model, tier, health, lastActive, opsPerMin,
    config, invocations}`. Unknown fields are filled with empty values
    rather than the fake fixture so the UI shows real auracle state
    (services_up, names, recency) even when individual auracle services
    don't expose every detail.
    """
    async def _fetch() -> list[dict]:
        import asyncio
        def _run() -> list[dict]:
            try:
                from google.cloud import run_v2
                client = run_v2.ServicesClient()
                parent = f"projects/{_PROJECT}/locations/{_REGION}"
                rows: list[dict] = []
                for s in client.list_services(parent=parent):
                    name = s.name.split("/")[-1]
                    short = name.replace("auracle-", "")
                    cond = getattr(s, "terminal_condition", None)
                    state = getattr(cond, "state", None) if cond else None
                    healthy = state == cond.State.CONDITION_SUCCEEDED if cond else False
                    rev = getattr(s, "latest_ready_revision", "") or ""
                    update_ts = getattr(s, "update_time", None)
                    last_active_ms = int(update_ts.timestamp() * 1000) if update_ts else 0
                    rows.append({
                        "id": short or name,
                        "name": short or name,
                        "role": "",
                        "desc": "",
                        "model": "",
                        "tier": "core",
                        "health": "healthy" if healthy else "warming",
                        "lastActive": last_active_ms,
                        "opsPerMin": [],
                        "config": {
                            "model": "",
                            "promptSha": "",
                            "version": rev.split("-")[-1] if rev else "",
                            "tools": [],
                        },
                        "invocations": [],
                    })
                return rows
            except Exception as exc:
                log.warning("cockpit_agents failed: %s", exc)
                return []
        return await asyncio.get_event_loop().run_in_executor(None, _run)
    try:
        return await _with_cache("cockpit_agents", _fetch)
    except Exception as exc:
        log.warning("cockpit_agents outer failed: %s", exc)
        return []


async def cockpit_events(limit: int = 50) -> list[dict]:
    """Return recent BQ events in cockpit-shaped event rows.

    Maps factory.eval / factory.tasks events to the EVENTS consumer
    shape inferred from cockpit fixtures: `{id, ts, topic, skill,
    stepId, status}`. Pulls the most recent N rows from the audit sink.
    """
    async def _fetch(limit: int) -> list[dict]:
        sql = (
            f"SELECT received_ts, topic, "
            f"  JSON_VALUE(payload, '$.skill') AS skill, "
            f"  JSON_VALUE(payload, '$.step_id') AS step_id, "
            f"  JSON_VALUE(payload, '$.status') AS status, "
            f"  JSON_VALUE(payload, '$.intent_id') AS intent_id "
            f"FROM `{_PROJECT}.{_DATASET}.{_TABLE}` "
            f"WHERE received_ts > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 2 HOUR) "
            f"  AND JSON_VALUE(payload, '$.skill') IS NOT NULL "
            f"ORDER BY received_ts DESC LIMIT {int(limit)}"
        )
        rows = await _bq_query(sql)
        out: list[dict] = []
        for r in rows:
            ts = r.get("received_ts")
            if hasattr(ts, "timestamp"):
                ts_ms = int(ts.timestamp() * 1000)
            elif isinstance(ts, (int, float)):
                ts_ms = int(ts)
            else:
                ts_ms = 0
            sid = r.get("step_id") or ""
            out.append({
                "id": "evt_" + (sid or str(ts_ms))[:18],
                "ts": ts_ms,
                "topic": r.get("topic") or "",
                "skill": r.get("skill") or "",
                "stepId": sid,
                "status": r.get("status") or "",
            })
        return out
    try:
        return await _with_cache(_cached_key("cockpit_events", limit=limit), _fetch, limit=limit)
    except Exception as exc:
        log.warning("cockpit_events failed: %s", exc)
        return []


async def static_value(value: Any = None) -> Any:
    """Echo helper — returns whatever is passed. Used for shape leaves we can't map."""
    return value


# ── catalog introspection ─────────────────────────────────────────────────

_ADAPTER_DOCS: dict[str, str] = {
    "bq_count_by_topic": "Count BQ events by topic in last N hours. Args: topic (str), hours (int). Returns: int.",
    "bq_topic_sparkline": "Hourly event count sparkline. Args: topic (str), hours (int). Returns: list[int].",
    "bq_recent_events": "Recent events from BQ. Args: topic (str|None), limit (int), hours (int). Returns: list[dict].",
    "bq_inflight_steps": "In-flight steps from BQ. Args: limit (int). Returns: list[dict].",
    "cloudrun_services_count": "Count active Cloud Run services. No args. Returns: int.",
    "cloudrun_services_list": "List Cloud Run services. No args. Returns: list[dict].",
    "cockpit_agents": "Real auracle services in cockpit agent-row shape (id, name, health, lastActive, opsPerMin, config). No args. Returns: list[dict].",
    "cockpit_events": "Recent BQ events in cockpit event-row shape (id, ts, topic, skill, stepId, status). Args: limit (int). Returns: list[dict].",
    "gh_recent_repos": "Recently updated GitHub repos. Args: owner (str), limit (int). Returns: list[dict].",
    "memory_bank_recall": "Recall items from Memory Bank. Args: scope (str), limit (int). Returns: list[dict].",
    "project_registry_list": "List all registered projects. No args. Returns: list[dict].",
    "static_value": "Echo any value unchanged. Args: value (Any). Returns: Any.",
}

_ADAPTER_SAMPLES: dict[str, Any] = {
    "bq_count_by_topic": 42,
    "bq_topic_sparkline": [0, 1, 3, 0, 2, 5, 0] * 3 + [0] * 3,
    "bq_recent_events": [{"ts": 1716000000000, "topic": "factory.tasks", "payload_preview": "{}"}],
    "bq_inflight_steps": [{"step_id": "abc", "skill": "docker_build", "dispatched_ts": 1716000000000}],
    "cloudrun_services_count": 11,
    "cloudrun_services_list": [{"name": "auracle-worker", "uri": "https://auracle-worker.run.app", "creator": ""}],
    "cockpit_agents": [{"id": "worker", "name": "worker", "role": "", "desc": "", "model": "", "tier": "core", "health": "healthy", "lastActive": 1716000000000, "opsPerMin": [], "config": {"model": "", "promptSha": "", "version": "00050", "tools": []}, "invocations": []}],
    "cockpit_events": [{"id": "evt_x", "ts": 1716000000000, "topic": "factory.eval", "skill": "lint", "stepId": "auto-ship-lint", "status": "success"}],
    "gh_recent_repos": [{"name": "auracle", "full_name": "sai19872000/auracle", "updated_at": "2026-05-18T00:00:00Z"}],
    "memory_bank_recall": [{"scope": "agent:worker", "memory_id": "m1", "content_preview": "...", "last_recalled_at": 0, "score": 0.85}],
    "project_registry_list": [{"slug": "cockpit", "repo": "sai19872000/cockpit", "status": "live"}],
    "static_value": None,
}


def catalog() -> list[dict]:
    """Return metadata list for every public adapter in this module.

    Each entry: {name, description, sample_output, signature}
    Used by gemini_bind.py to build the planner prompt.
    """
    import sys
    this = sys.modules[__name__]
    out: list[dict] = []
    for name, fn in inspect.getmembers(this, inspect.iscoroutinefunction):
        if name.startswith("_"):
            continue
        sig = str(inspect.signature(fn))
        out.append({
            "name": name,
            "description": _ADAPTER_DOCS.get(name, ""),
            "signature": f"async def {name}{sig}",
            "sample_output": _ADAPTER_SAMPLES.get(name),
        })
    return out
