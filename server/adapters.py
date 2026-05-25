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


async def static_value(value: Any = None) -> Any:
    """Echo helper — returns whatever is passed. Used for shape leaves we can't map."""
    return value


# ── catalog introspection ─────────────────────────────────────────────────

_ADAPTER_DOCS: dict[str, str] = {
    # iter-34: catalog descriptions made discriminative for Gemini. Each
    # entry describes (a) what the primitive returns, (b) the SHAPE of
    # the result, (c) which consumer shapes it MATCHES. Gemini reads
    # these when picking an adapter per top-level mock key.
    "bq_count_by_topic": (
        "INTEGER count of factory.* Pub/Sub events on a given topic in the last N hours. "
        "Args: topic (str, e.g. 'factory.tasks', 'factory.deploy', 'factory.incident'), hours (int). "
        "Returns: int. "
        "Match consumer keys: KPI scalar values like services_up, intents_24h, deploys_24h, "
        "p0_incidents_24h, errors_today — anything whose value is a single non-negative count."
    ),
    "bq_topic_sparkline": (
        "Per-hour bucketed count of factory.* events as a sparkline list. "
        "Args: topic (str), hours (int, typically 24). "
        "Returns: list[int] of length `hours` with one count per bucket. "
        "Match consumer keys: spark / sparkline / trend / history fields next to a KPI val."
    ),
    "bq_recent_events": (
        "Recent factory.* Pub/Sub events from BigQuery audit sink. "
        "Args: topic (str|None for all topics), limit (int, e.g. 50), hours (int). "
        "Returns: list[dict] with fields {ts (epoch ms), topic, skill, step_id, status, intent_id, payload_preview}. "
        "Match consumer keys: events / event_stream / activity / audit_log / feed — anything that's "
        "an array of recent factory events with timestamps."
    ),
    "bq_inflight_steps": (
        "Currently-running factory steps from BigQuery: rows on factory.tasks with no matching factory.eval terminal status. "
        "Args: limit (int). "
        "Returns: list[dict] with fields {step_id, skill, slug, dispatched_ts (epoch ms)}. "
        "Match consumer keys: inflight / running / in_progress / live_tasks / active_jobs."
    ),
    "cloudrun_services_count": (
        "INTEGER count of healthy Cloud Run services in the project (terminal_condition=CONDITION_SUCCEEDED). "
        "No args. Returns: int. "
        "Match consumer keys: services_up, services_count, fleet_size, running_services — any "
        "scalar count of services / runtime instances / agents."
    ),
    "cloudrun_services_list": (
        "All Cloud Run services in the project as a list of dicts. "
        "No args. "
        "Returns: list[dict] with fields {name (e.g. 'auracle-worker'), uri, latest_ready_revision, "
        "terminal_condition_state (e.g. 'CONDITION_SUCCEEDED'), update_time}. "
        "Match consumer keys: services / agents / fleet / runtime_instances / runners — any "
        "array of Cloud-Run-deployed services, including agent-like rows with id/name/health/uri."
    ),
    "gh_recent_repos": (
        "Recently updated GitHub repos under a user/org. "
        "Args: owner (str), limit (int). "
        "Returns: list[dict] with fields {name, full_name, updated_at}. "
        "Match consumer keys: repos / repositories / git_projects — when consumer wants a list "
        "of code repos with names + last-update timestamps."
    ),
    "memory_bank_recall": (
        "Items from the auracle Memory Bank scoped to a prefix. "
        "Args: scope (str, e.g. 'agent:worker' or 'project:posy' or '' for all), limit (int). "
        "Returns: list[dict] with fields {memory_id, scope, content_preview, last_recalled_at (epoch ms), score}. "
        "Match consumer keys: memory / memory_entries / recall / context / saved_facts."
    ),
    "project_registry_list": (
        "All projects from the local memory/seed/projects.json registry. "
        "No args. "
        "Returns: list[dict] with fields {slug, repo, url, status, description}. "
        "Match consumer keys: projects / registered_projects / portfolio — when consumer wants the "
        "factory's product catalog with slugs + repos. (Note: requires the seed file shipped in image.)"
    ),
    "static_value": (
        "Echo helper — returns whatever literal you pass via args.value. "
        "Use as LAST RESORT when no other primitive matches the consumer shape. "
        "Prefer real primitives even if they need shape rewriting downstream."
    ),
}

_ADAPTER_SAMPLES: dict[str, Any] = {
    "bq_count_by_topic": 42,
    "bq_topic_sparkline": [0, 1, 3, 0, 2, 5, 0] * 3 + [0] * 3,
    "bq_recent_events": [{
        "ts": 1716000000000, "topic": "factory.tasks",
        "skill": "lint", "step_id": "auto-ship-lint",
        "status": "success", "intent_id": "intent-abc",
        "payload_preview": "{}",
    }],
    "bq_inflight_steps": [{
        "step_id": "stp_b400", "skill": "docker_build",
        "slug": "auracle-worker", "dispatched_ts": 1716000000000,
    }],
    "cloudrun_services_count": 11,
    "cloudrun_services_list": [{
        "name": "auracle-worker", "uri": "https://auracle-worker.run.app",
        "latest_ready_revision": "auracle-worker-00109-tnf",
        "terminal_condition_state": "CONDITION_SUCCEEDED",
        "update_time": 1716000000,
    }],
    "gh_recent_repos": [{"name": "auracle", "full_name": "sai19872000/auracle", "updated_at": "2026-05-18T00:00:00Z"}],
    "memory_bank_recall": [{
        "memory_id": "mem_07a1", "scope": "agent:worker",
        "content_preview": "...", "last_recalled_at": 1716000000000, "score": 0.85,
    }],
    "project_registry_list": [{
        "slug": "auracle-cockpit-dashboard", "repo": "sai19872000/auracle-cockpit-dashboard",
        "url": "https://auracle-cockpit-dashboard.run.app", "status": "live",
        "description": "factory live cockpit",
    }],
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
