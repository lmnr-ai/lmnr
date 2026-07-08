#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""
Claude Code -> Laminar hook

Reads the Claude Code session transcript incrementally on Stop / SessionEnd
hooks, assembles conversational turns, and emits them to Laminar as
OpenTelemetry traces over OTLP/HTTP/JSON. Pure stdlib — no dependencies.
"""

import json
import logging
import os
import secrets
import sys
import threading
import time
import hashlib
import urllib.request
import urllib.error
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


# ----------------- Paths -----------------
STATE_DIR = Path.home() / ".claude" / "state"
LOG_FILE = STATE_DIR / "lmnr_hook.log"
STATE_FILE = STATE_DIR / "lmnr_state.json"
LOCK_FILE = STATE_DIR / "lmnr_state.lock"


# ----------------- Configuration -----------------
def _opt(name: str) -> str:
    """Read a plugin userConfig value (CLAUDE_PLUGIN_OPTION_<NAME>) with a fallback to a plain env var."""
    return os.environ.get(f"CLAUDE_PLUGIN_OPTION_{name}") or os.environ.get(name) or ""

DEBUG = _opt("CC_LMNR_DEBUG").lower() == "true"
SKILL_TAGS = (_opt("CC_LMNR_SKILL_TAGS") or "true").lower() == "true"
CAPTURE_SKILL_CONTENT = _opt("CC_LMNR_CAPTURE_SKILL_CONTENT").lower() == "true"
try:
    MAX_CHARS = int(_opt("CC_LMNR_MAX_CHARS") or "20000")
except ValueError:
    MAX_CHARS = 20000

# Bound for unresolved task notifications kept in the state file between runs.
MAX_PENDING_TASK_NOTIFICATIONS = 50

# Cap for a single OTLP export request (connect + response).
EXPORT_TIMEOUT_S = 5.0

@dataclass
class LaminarConfig:
    api_key: str
    base_url: str
    user_id: Optional[str]

def get_laminar_config() -> Optional[LaminarConfig]:
    api_key = _opt("LMNR_PROJECT_API_KEY") or _opt("CC_LMNR_PROJECT_API_KEY")
    base_url = (_opt("LMNR_BASE_URL") or _opt("CC_LMNR_BASE_URL") or "https://api.lmnr.ai").rstrip("/")
    user_id = _opt("LMNR_USER_ID") or _opt("CC_LMNR_USER_ID") or None

    if not api_key:
        return None

    return LaminarConfig(api_key=api_key, base_url=base_url, user_id=user_id)


# ----------------- Logging -----------------
_logger: Optional[logging.Logger] = None

def _get_logger() -> Optional[logging.Logger]:
    global _logger
    if _logger is not None:
        return _logger
    try:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        lg = logging.getLogger("lmnr_hook")
        lg.setLevel(logging.DEBUG if DEBUG else logging.INFO)
        if not lg.handlers:
            h = RotatingFileHandler(str(LOG_FILE), maxBytes=5_000_000, backupCount=3)
            h.setFormatter(logging.Formatter(
                "%(asctime)s [%(levelname)s] %(message)s",
                datefmt="%Y-%m-%d %H:%M:%S",
            ))
            lg.addHandler(h)
        _logger = lg
        return _logger
    except Exception:
        return None

def debug(msg: str) -> None:
    if not DEBUG:
        return
    lg = _get_logger()
    if lg is not None:
        try:
            lg.debug(msg)
        except Exception:
            pass

def info(msg: str) -> None:
    lg = _get_logger()
    if lg is not None:
        try:
            lg.info(msg)
        except Exception:
            pass


# ----------------- Hook payload -----------------
def read_hook_payload() -> Dict[str, Any]:
    """
    Claude Code hooks pass a JSON payload on stdin.
    This script tolerates missing/empty stdin by returning {}.
    """
    try:
        data = sys.stdin.read()
        debug(f"stdin received {len(data)} chars")
        if not data.strip():
            return {}
        parsed = json.loads(data)
        if isinstance(parsed, dict):
            debug(f"payload top-level keys: {sorted(parsed.keys())}")
            return parsed
        debug(f"payload is {type(parsed).__name__}, expected object; exiting.")
        return {}
    except Exception as e:
        debug(f"read_hook_payload exception: {e!r}")
        return {}

def extract_session_id_and_transcript_path(payload: Dict[str, Any]) -> Tuple[Optional[str], Optional[Path]]:
    """
    Tries a few plausible field names; exact keys can vary across hook types/versions.
    Prefer structured values from stdin over heuristics.
    """
    session_id = (
        payload.get("sessionId")
        or payload.get("session_id")
        or payload.get("session", {}).get("id")
    )

    transcript_path_raw = (
        payload.get("transcriptPath")
        or payload.get("transcript_path")
        or payload.get("transcript", {}).get("path")
    )

    if transcript_path_raw:
        try:
            transcript_path = Path(transcript_path_raw).expanduser().resolve()
        except Exception:
            transcript_path = None
    else:
        transcript_path = None

    return session_id, transcript_path

def get_session_id_and_transcript_path(payload: Dict[str, Any]) -> Optional[Tuple[str, Path]]:
    session_id, transcript_path = extract_session_id_and_transcript_path(payload)

    if not session_id or not transcript_path:
        # No structured payload; fail open (do not guess).
        debug("Missing session_id or transcript_path from hook payload; exiting.")
        return None

    if not transcript_path.exists():
        debug(f"Transcript path does not exist: {transcript_path}")
        return None

    return session_id, transcript_path

def is_session_end_hook_payload(payload: Dict[str, Any]) -> bool:
    hook_event_name = payload.get("hook_event_name") or payload.get("hookEventName")
    return hook_event_name == "SessionEnd"


# ----------------- State file concurrency control -----------------
class FileLock:
    def __init__(self, path: Path, timeout_s: float = 2.0):
        self.path = path
        self.timeout_s = timeout_s
        self._fh = None

    def __enter__(self):
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        self._fh = open(self.path, "a+", encoding="utf-8")
        self.acquired = False
        try:
            import fcntl  # Unix only
        except ImportError:
            # No fcntl available (e.g. Windows) — proceed without lock.
            return self
        deadline = time.time() + self.timeout_s
        try:
            while True:
                try:
                    fcntl.flock(self._fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                    self.acquired = True
                    return self
                except BlockingIOError:
                    if time.time() > deadline:
                        raise TimeoutError(
                            f"could not acquire {self.path} within {self.timeout_s}s"
                        )
                    time.sleep(0.05)
        except BaseException:
            # __exit__ is not called when __enter__ raises — close the fh
            # we just opened so it doesn't leak.
            try:
                self._fh.close()
            except Exception:
                pass
            raise

    def __exit__(self, exc_type, exc, tb):
        try:
            import fcntl
            fcntl.flock(self._fh.fileno(), fcntl.LOCK_UN)
        except Exception:
            pass
        try:
            self._fh.close()
        except Exception:
            pass


# ----------------- State file reading and writing -----------------
def load_hook_state() -> Dict[str, Any]:
    try:
        if not STATE_FILE.exists():
            return {}
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}

def get_session_state_key(session_id: str, transcript_path: str) -> str:
    # stable key even if session_id collides
    raw = f"{session_id}::{transcript_path}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()

@dataclass
class SessionState:
    offset: int = 0       # Last byte read from the transcript file.
    buffer: str = ""      # Partial JSONL line kept between hook runs.
    turn_count: int = 0   # Turns already emitted for this session.
    pending_agent_turns: List[Dict[str, Any]] = field(default_factory=list)
    # Task-notification rows whose tool_use_id could not be resolved yet
    # (task-id-only and the subagent meta.json not on disk); retried each run.
    pending_task_notifications: List[Dict[str, Any]] = field(default_factory=list)

def get_session_state(global_state: Dict[str, Any], key: str) -> SessionState:
    s = global_state.get(key, {})
    pending_agent_turns = s.get("pending_agent_turns")
    if not isinstance(pending_agent_turns, list):
        pending_agent_turns = []
    pending_task_notifications = s.get("pending_task_notifications")
    if not isinstance(pending_task_notifications, list):
        pending_task_notifications = []
    return SessionState(
        offset=int(s.get("offset", 0)),
        buffer=str(s.get("buffer", "")),
        turn_count=int(s.get("turn_count", 0)),
        pending_agent_turns=pending_agent_turns,
        pending_task_notifications=pending_task_notifications,
    )

def update_session_state(global_state: Dict[str, Any], key: str, session_state: SessionState) -> None:
    global_state[key] = {
        "offset": session_state.offset,
        "buffer": session_state.buffer,
        "turn_count": session_state.turn_count,
        "pending_agent_turns": session_state.pending_agent_turns or [],
        "pending_task_notifications": session_state.pending_task_notifications or [],
        "updated": datetime.now(timezone.utc).isoformat(),
    }

def save_hook_state(state: Dict[str, Any]) -> None:
    try:
        # Drop session entries older than 30 days to keep the file bounded.
        cutoff = datetime.now(timezone.utc) - timedelta(days=30)
        for k in list(state.keys()):
            entry = state.get(k)
            if not isinstance(entry, dict):
                continue
            updated = entry.get("updated")
            if not isinstance(updated, str):
                continue
            try:
                ts = datetime.fromisoformat(updated.replace("Z", "+00:00"))
            except Exception:
                continue
            if ts < cutoff:
                del state[k]
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        tmp = STATE_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps(state, indent=2, sort_keys=True), encoding="utf-8")
        os.replace(tmp, STATE_FILE)
    except Exception as e:
        debug(f"save_hook_state failed: {e}")

def save_session_state(global_state: Dict[str, Any], key: str, session_state: SessionState) -> None:
    update_session_state(global_state, key, session_state)
    save_hook_state(global_state)


# ----------------- Transcript row parsing -----------------
def get_content_from_row(row: Dict[str, Any]) -> Any:
    if not isinstance(row, dict):
        return None
    message = row.get("message")
    if isinstance(message, dict):
        return message.get("content")
    return row.get("content")

def get_user_or_assistant_role_from_row(row: Dict[str, Any]) -> Optional[str]:
    # Claude Code transcript row format is internal. Prefer top-level row.type
    # when it marks a chat row, then fall back to nested message.role.
    row_type = row.get("type")
    if row_type in ("user", "assistant"):
        return row_type

    message = row.get("message")
    if isinstance(message, dict):
        role = message.get("role")
        if role in ("user", "assistant"):
            return role
    return None

def get_message_id(row: Dict[str, Any]) -> Optional[str]:
    m = row.get("message")
    if isinstance(m, dict):
        mid = m.get("id")
        if isinstance(mid, str) and mid:
            return mid
    return None

def get_model(row: Dict[str, Any]) -> str:
    m = row.get("message")
    if isinstance(m, dict):
        return m.get("model") or "claude"
    return "claude"

def get_usage_details_from_row(row: Dict[str, Any]) -> Optional[Dict[str, int]]:
    """Extract Anthropic token usage from an assistant message, if present."""
    m = row.get("message")
    if not isinstance(m, dict):
        return None
    u = m.get("usage")
    if not isinstance(u, dict):
        return None
    details: Dict[str, int] = {}
    for key in (
        "input_tokens",
        "output_tokens",
        "cache_read_input_tokens",
        "cache_creation_input_tokens",
    ):
        v = u.get(key)
        if isinstance(v, int) and v > 0:
            details[key] = v
    return details or None

def parse_timestamp(value: Any) -> Optional[datetime]:
    """Parse a Claude Code jsonl row timestamp (ISO 8601 with trailing Z)."""
    if isinstance(value, dict):
        value = value.get("timestamp")
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return None

def extract_text_from_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: List[str] = []
        for x in content:
            if isinstance(x, dict) and x.get("type") == "text":
                parts.append(x.get("text", ""))
            elif isinstance(x, str):
                parts.append(x)
        return "\n".join([p for p in parts if p])
    return ""

def truncate_text(s: str, max_chars: int = MAX_CHARS) -> Tuple[str, Dict[str, Any]]:
    if s is None:
        return "", {"truncated": False, "orig_len": 0}
    orig_len = len(s)
    if orig_len <= max_chars:
        return s, {"truncated": False, "orig_len": orig_len}
    head = s[:max_chars]
    return head, {"truncated": True, "orig_len": orig_len, "kept_len": len(head), "sha256": hashlib.sha256(s.encode("utf-8")).hexdigest()}

def get_tool_use_blocks(content: Any) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    if isinstance(content, list):
        for x in content:
            if isinstance(x, dict) and x.get("type") == "tool_use":
                out.append(x)
    return out

def get_tool_result_blocks(content: Any) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    if isinstance(content, list):
        for x in content:
            if isinstance(x, dict) and x.get("type") == "tool_result":
                out.append(x)
    return out

def is_tool_result(row: Dict[str, Any]) -> bool:
    role = get_user_or_assistant_role_from_row(row)
    if role != "user":
        return False
    content = get_content_from_row(row)
    if isinstance(content, list):
        return any(isinstance(x, dict) and x.get("type") == "tool_result" for x in content)
    return False


# ----------------- Incremental transcript reading -----------------
def read_new_jsonl(transcript_path: Path, session_state: SessionState) -> Tuple[List[Dict[str, Any]], SessionState]:
    """
    Reads only new bytes since session_state.offset. Keeps session_state.buffer for partial last line.
    Returns parsed JSON lines and updated state.
    """
    if not transcript_path.exists():
        return [], session_state

    try:
        file_size = transcript_path.stat().st_size
        if file_size < session_state.offset:
            # Transcript was rotated or truncated — restart from the beginning.
            debug(f"transcript shrank ({file_size} < {session_state.offset}); restarting")
            session_state.offset = 0
            session_state.buffer = ""
        with open(transcript_path, "rb") as f:
            f.seek(session_state.offset)
            chunk = f.read()
            new_offset = f.tell()
    except Exception as e:
        debug(f"read_new_jsonl failed: {e}")
        return [], session_state

    if not chunk:
        return [], session_state

    try:
        text = chunk.decode("utf-8", errors="replace")
    except Exception:
        text = chunk.decode(errors="replace")

    combined = session_state.buffer + text
    lines = combined.split("\n")
    # last element may be incomplete
    session_state.buffer = lines[-1]
    session_state.offset = new_offset

    msgs: List[Dict[str, Any]] = []
    for line in lines[:-1]:
        line = line.strip()
        if not line:
            continue
        try:
            msgs.append(json.loads(line))
        except Exception:
            continue

    return msgs, session_state


# ----------------- Turn assembly -----------------
@dataclass
class Turn:
    user_msg: Dict[str, Any]
    assistant_msgs: List[Dict[str, Any]]
    tool_results_by_id: Dict[str, Any]
    tool_use_timestamps_by_id: Dict[str, Any]
    # Injected context (e.g. skill instructions) keyed by the tool_use id it
    # belongs to, taken from isMeta rows carrying sourceToolUseID.
    injected_by_tool_id: Dict[str, str]
    rows: List[Dict[str, Any]]

@dataclass
class TurnAssemblyState:
    current_turn_user_row: Optional[Dict[str, Any]] = None
    assistant_message_ids: List[str] = field(default_factory=list)
    assistant_rows_by_message_id: Dict[str, List[Dict[str, Any]]] = field(default_factory=dict)
    tool_results_by_id: Dict[str, Any] = field(default_factory=dict)
    tool_use_timestamps_by_id: Dict[str, Any] = field(default_factory=dict)
    injected_by_tool_id: Dict[str, str] = field(default_factory=dict)
    current_rows: List[Dict[str, Any]] = field(default_factory=list)


def _extract_xml_tag_value(text: str, tag: str) -> Optional[str]:
    start = f"<{tag}>"
    end = f"</{tag}>"
    i = text.find(start)
    if i < 0:
        return None
    j = text.find(end, i + len(start))
    if j < 0:
        return None
    return text[i + len(start):j]

def is_task_notification_row(row: Dict[str, Any]) -> bool:
    origin = row.get("origin")
    if isinstance(origin, dict) and origin.get("kind") == "task-notification":
        return True

    notification_text = extract_text_from_content(get_content_from_row(row)).lstrip()
    return notification_text.startswith("<task-notification>")

def get_tool_use_id_from_task_notification(row: Dict[str, Any]) -> Optional[str]:
    notification_text = extract_text_from_content(get_content_from_row(row))
    tool_use_id = _extract_xml_tag_value(notification_text, "tool-use-id")
    return tool_use_id.strip() if isinstance(tool_use_id, str) and tool_use_id.strip() else None

def get_task_id_from_task_notification(row: Dict[str, Any]) -> Optional[str]:
    notification_text = extract_text_from_content(get_content_from_row(row))
    task_id = _extract_xml_tag_value(notification_text, "task-id")
    return task_id.strip() if isinstance(task_id, str) and task_id.strip() else None

def get_tool_use_id_for_task_notification(
    row: Dict[str, Any],
    task_id_to_tool_use_id: Optional[Dict[str, str]] = None,
) -> Optional[str]:
    if not is_task_notification_row(row):
        return None

    tool_use_id = get_tool_use_id_from_task_notification(row)
    if tool_use_id:
        return tool_use_id

    task_id = get_task_id_from_task_notification(row)
    if task_id and task_id_to_tool_use_id:
        return task_id_to_tool_use_id.get(task_id)
    return None

def get_result_from_task_notification(row: Dict[str, Any]) -> str:
    notification_text = extract_text_from_content(get_content_from_row(row))
    result = _extract_xml_tag_value(notification_text, "result")
    return result if result is not None else notification_text

def _find_pending_agent_turn(
    session_state: SessionState,
    tool_use_id: str,
) -> Optional[Dict[str, Any]]:
    for pending_turn in session_state.pending_agent_turns:
        if not isinstance(pending_turn, dict):
            continue
        if not isinstance(pending_turn.get("rows"), list):
            continue
        pending_tool_use_ids = pending_turn.get("pending_tool_use_ids")
        resolved_tool_use_ids = pending_turn.get("resolved_tool_use_ids")
        # Notifications can arrive more than once per tool_use_id, so ids that
        # already received one keep matching until the whole turn resolves.
        if isinstance(pending_tool_use_ids, list) and tool_use_id in pending_tool_use_ids:
            return pending_turn
        if isinstance(resolved_tool_use_ids, list) and tool_use_id in resolved_tool_use_ids:
            return pending_turn
    return None

def resolve_deferred_agent_turns(
    rows: List[Dict[str, Any]],
    session_state: SessionState,
    task_id_to_tool_use_id: Optional[Dict[str, str]] = None,
) -> Tuple[List[List[Dict[str, Any]]], List[Dict[str, Any]]]:
    """Move task-notification rows from the batch to their deferred turns.

    Deferred rows are never spliced into the batch (a user row mid-batch would
    cut the current turn in half); resolved turns are returned for isolated
    assembly. Notifications matching a tool_use in the batch stay there, and
    ones that cannot be attributed yet (task-id-only, subagent meta.json not
    on disk) are stashed in the session state and retried on later runs
    instead of being swallowed by the turn assembly.
    """
    remaining_rows: List[Dict[str, Any]] = []
    stashed_notifications: List[Dict[str, Any]] = []

    def route_to_pending_turn(pending_turn: Dict[str, Any], row: Dict[str, Any], tool_use_id: str) -> None:
        pending_turn["rows"].append(row)
        pending_tool_use_ids = pending_turn.get("pending_tool_use_ids")
        if isinstance(pending_tool_use_ids, list) and tool_use_id in pending_tool_use_ids:
            pending_tool_use_ids.remove(tool_use_id)
            pending_turn.setdefault("resolved_tool_use_ids", []).append(tool_use_id)

    # Retry stashed notifications from earlier runs first (they are older than
    # anything in the batch); their task-id may resolve now.
    for row in session_state.pending_task_notifications:
        tool_use_id = get_tool_use_id_for_task_notification(row, task_id_to_tool_use_id)
        if tool_use_id is None:
            stashed_notifications.append(row)
            continue
        pending_turn = _find_pending_agent_turn(session_state, tool_use_id)
        if pending_turn is None:
            debug(f"Dropping stashed task notification for {tool_use_id}: no deferred turn waits for it")
            continue
        route_to_pending_turn(pending_turn, row, tool_use_id)

    for row in rows:
        if not is_task_notification_row(row):
            remaining_rows.append(row)
            continue
        tool_use_id = get_tool_use_id_for_task_notification(row, task_id_to_tool_use_id)
        if tool_use_id is None:
            stashed_notifications.append(row)
            continue
        pending_turn = _find_pending_agent_turn(session_state, tool_use_id)
        if pending_turn is None:
            remaining_rows.append(row)
            continue
        route_to_pending_turn(pending_turn, row, tool_use_id)

    session_state.pending_task_notifications = stashed_notifications[-MAX_PENDING_TASK_NOTIFICATIONS:]

    # Pop fully resolved turns in deferral (i.e. chronological) order.
    resolved_turn_row_lists: List[List[Dict[str, Any]]] = []
    still_pending: List[Dict[str, Any]] = []
    for pending_turn in session_state.pending_agent_turns:
        if not isinstance(pending_turn, dict) or not isinstance(pending_turn.get("rows"), list):
            continue
        if pending_turn.get("pending_tool_use_ids"):
            still_pending.append(pending_turn)
            continue
        resolved_turn_row_lists.append(pending_turn["rows"])
    session_state.pending_agent_turns = still_pending

    return resolved_turn_row_lists, remaining_rows

def pop_all_deferred_agent_turn_row_lists(
    session_state: SessionState,
) -> List[List[Dict[str, Any]]]:
    row_lists: List[List[Dict[str, Any]]] = []
    for pending_turn in session_state.pending_agent_turns:
        if not isinstance(pending_turn, dict):
            continue
        rows = pending_turn.get("rows")
        if isinstance(rows, list) and rows:
            row_lists.append(rows)
    session_state.pending_agent_turns = []
    return row_lists

def get_tool_result_text(tool_result_entry: Any) -> str:
    if not isinstance(tool_result_entry, dict):
        return ""
    tool_result_content = tool_result_entry.get("content")
    if isinstance(tool_result_content, str):
        return tool_result_content
    return json.dumps(tool_result_content, ensure_ascii=False)

def get_async_launch_flag_from_row(row: Dict[str, Any]) -> Optional[bool]:
    """Read the structured async marker Claude Code puts on tool_result rows.

    Returns None when the row carries no toolUseResult (older Claude Code
    versions), so callers can fall back to the launch-text heuristic.
    """
    tool_use_result = row.get("toolUseResult")
    if not isinstance(tool_use_result, dict):
        return None
    return tool_use_result.get("status") == "async_launched" or tool_use_result.get("isAsync") is True

def is_async_agent_launch_result(tool_result_entry: Any) -> bool:
    if not isinstance(tool_result_entry, dict):
        return False
    # Prefer the structured toolUseResult marker: launch-text matching also
    # fires on tool results that merely quote it (e.g. reading this file).
    is_async_launch = tool_result_entry.get("is_async_launch")
    if is_async_launch is not None:
        return bool(is_async_launch)
    tool_result_text = get_tool_result_text(tool_result_entry)
    return (
        "Async agent launched successfully" in tool_result_text
        or (
            "agentId:" in tool_result_text
            and "output_file:" in tool_result_text
            and "You will be notified automatically" in tool_result_text
        )
    )

def get_pending_agent_tool_use_ids(turn: Turn) -> List[str]:
    tool_use_ids: List[str] = []
    for assistant_message in turn.assistant_msgs:
        for tool_use_block in get_tool_use_blocks(get_content_from_row(assistant_message)):
            if tool_use_block.get("name") not in ("Agent", "Task"):
                continue
            tool_use_id = str(tool_use_block.get("id") or "")
            if not tool_use_id:
                continue
            tool_result_entry = turn.tool_results_by_id.get(tool_use_id)
            if isinstance(tool_result_entry, dict) and tool_result_entry.get("final_content") is not None:
                continue
            # Defer only explicit async launches: sync agents also write a
            # subagent transcript but never notify, so deferring on transcript
            # existence would strand their turns.
            if is_async_agent_launch_result(tool_result_entry):
                tool_use_ids.append(tool_use_id)
    return tool_use_ids

def get_turns_to_emit(
    turns: List[Turn],
    session_state: SessionState,
    *,
    flush_deferred_agent_turns: bool = False,
) -> List[Turn]:
    turns_to_emit: List[Turn] = []
    for turn in turns:
        pending_agent_tool_use_ids = get_pending_agent_tool_use_ids(turn)
        if pending_agent_tool_use_ids:
            if flush_deferred_agent_turns:
                debug(f"Emitting async agent turn without task notification: {pending_agent_tool_use_ids}")
                turns_to_emit.append(turn)
                continue
            session_state.pending_agent_turns.append({
                "pending_tool_use_ids": pending_agent_tool_use_ids,
                "rows": turn.rows,
            })
            debug(f"Deferred agent turn until task notification: {pending_agent_tool_use_ids}")
            continue
        turns_to_emit.append(turn)
    return turns_to_emit


def add_injected_context_row(row: Dict[str, Any], state: TurnAssemblyState) -> bool:
    # Injected user rows (slash-command expansions, caveats, skill instructions)
    # carry isMeta=true. They are not real prompts, so they must not start turns.
    if not row.get("isMeta"):
        return False

    # Skill invocations link their injected instructions to the originating
    # tool_use via sourceToolUseID; keep the text so emit can optionally attach
    # it to that tool span.
    source_tool_use_id = row.get("sourceToolUseID")
    if source_tool_use_id:
        text = extract_text_from_content(get_content_from_row(row))
        if text:
            state.injected_by_tool_id[str(source_tool_use_id)] = text
            state.current_rows.append(row)
    return True

def add_tool_result_row(row: Dict[str, Any], state: TurnAssemblyState) -> bool:
    # tool_result rows show up as role=user with content blocks of type tool_result.
    if not is_tool_result(row):
        return False

    state.current_rows.append(row)
    row_timestamp = row.get("timestamp")
    is_async_launch = get_async_launch_flag_from_row(row)
    for tool_result_block in get_tool_result_blocks(get_content_from_row(row)):
        tool_use_id = tool_result_block.get("tool_use_id")
        if tool_use_id:
            tool_result_entry: Dict[str, Any] = {
                "content": tool_result_block.get("content"),
                "timestamp": row_timestamp,
            }
            if is_async_launch is not None:
                tool_result_entry["is_async_launch"] = is_async_launch
            state.tool_results_by_id[str(tool_use_id)] = tool_result_entry
    return True

def add_task_notification_row(
    row: Dict[str, Any],
    state: TurnAssemblyState,
    task_id_to_tool_use_id: Optional[Dict[str, str]] = None,
) -> bool:
    if not is_task_notification_row(row):
        return False

    if state.current_turn_user_row is None:
        return True

    tool_use_id = get_tool_use_id_for_task_notification(row, task_id_to_tool_use_id)
    if not tool_use_id:
        state.current_rows.append(row)
        return True

    existing_result = state.tool_results_by_id.get(tool_use_id)
    if isinstance(existing_result, dict):
        existing_result["final_content"] = get_result_from_task_notification(row)
        existing_result["final_timestamp"] = row.get("timestamp")
    else:
        state.tool_results_by_id[tool_use_id] = {
            "content": get_result_from_task_notification(row),
            "timestamp": row.get("timestamp"),
        }
    state.current_rows.append(row)
    return True

def merge_assistant_rows(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Claude Code can split one assistant message across multiple JSONL rows that
    share message.id. Merge them back into one logical message by concatenating
    content blocks in row order.
    """
    base: Dict[str, Any] = dict(rows[-1])
    last_message = rows[-1].get("message")
    merged_message: Dict[str, Any] = dict(last_message) if isinstance(last_message, dict) else {}

    merged_content: List[Any] = []
    for row in rows:
        message_obj = row.get("message")
        if not isinstance(message_obj, dict):
            continue

        content_blocks = message_obj.get("content")
        if isinstance(content_blocks, list):
            merged_content.extend(content_blocks)
        elif isinstance(content_blocks, str) and content_blocks:
            merged_content.append({"type": "text", "text": content_blocks})

    merged_message["content"] = merged_content
    base["message"] = merged_message
    return base

def build_turn_from_state(state: TurnAssemblyState) -> Optional[Turn]:
    if state.current_turn_user_row is None:
        return None
    if not state.assistant_rows_by_message_id:
        return None

    # Rebuild one assistant message per message.id, in the order the ids
    # first appeared. assistant_rows_by_message_id[message_id] holds all raw
    # rows that shared that id; merge_assistant_rows concatenates their content
    # blocks into one.
    merged_assistant_rows: List[Dict[str, Any]] = []
    for message_id in state.assistant_message_ids:
        rows_for_id = state.assistant_rows_by_message_id.get(message_id)
        if not rows_for_id:
            continue
        merged_assistant_rows.append(merge_assistant_rows(rows_for_id))

    return Turn(
        user_msg=state.current_turn_user_row,
        assistant_msgs=merged_assistant_rows,
        tool_results_by_id=dict(state.tool_results_by_id),
        tool_use_timestamps_by_id=dict(state.tool_use_timestamps_by_id),
        injected_by_tool_id=dict(state.injected_by_tool_id),
        rows=list(state.current_rows),
    )

def start_new_turn(row: Dict[str, Any], state: TurnAssemblyState) -> None:
    state.current_turn_user_row = row
    state.assistant_message_ids = []
    state.assistant_rows_by_message_id = {}
    state.tool_results_by_id = {}
    state.tool_use_timestamps_by_id = {}
    state.injected_by_tool_id = {}
    state.current_rows = [row]


def add_assistant_row(row: Dict[str, Any], state: TurnAssemblyState) -> None:
    if state.current_turn_user_row is None:
        # Ignore assistant rows until we see a user message.
        return

    message_id = get_message_id(row) or f"noid:{len(state.assistant_message_ids)}"
    if message_id not in state.assistant_rows_by_message_id:
        state.assistant_message_ids.append(message_id)
        state.assistant_rows_by_message_id[message_id] = []
    state.assistant_rows_by_message_id[message_id].append(row)

    for tool_use_block in get_tool_use_blocks(get_content_from_row(row)):
        tool_use_id = tool_use_block.get("id")
        if tool_use_id:
            state.tool_use_timestamps_by_id.setdefault(str(tool_use_id), row.get("timestamp"))
    state.current_rows.append(row)


def build_turns(
    rows: List[Dict[str, Any]],
    task_id_to_tool_use_id: Optional[Dict[str, str]] = None,
) -> List[Turn]:
    """
    Groups incremental transcript rows into turns:
    user (non-tool-result) -> assistant messages -> (tool_result rows, possibly interleaved)
    Uses:
    - assistant rows merged by message.id (all content blocks concatenated)
    - tool results dedupe by tool_use_id (latest wins)
    """
    turns: List[Turn] = []
    state = TurnAssemblyState()

    for row in rows:
        if add_injected_context_row(row, state):
            continue

        if add_tool_result_row(row, state):
            continue

        if add_task_notification_row(row, state, task_id_to_tool_use_id):
            continue

        role = get_user_or_assistant_role_from_row(row)

        if role == "user":
            turn = build_turn_from_state(state)
            if turn is not None:
                turns.append(turn)

            start_new_turn(row, state)
            continue

        if role == "assistant":
            add_assistant_row(row, state)
            continue

        # ignore unknown rows

    turn = build_turn_from_state(state)
    if turn is not None:
        turns.append(turn)
    return turns


def get_new_turns_from_transcript(
    transcript_path: Path,
    session_state: SessionState,
    subagent_transcripts_by_tool_use_id: Optional[Dict[str, Dict[str, Any]]] = None,
    *,
    flush_deferred_agent_turns: bool = False,
) -> Tuple[List[Turn], SessionState]:
    rows, session_state = read_new_jsonl(transcript_path, session_state)
    task_id_to_tool_use_id = get_task_id_to_tool_use_id(subagent_transcripts_by_tool_use_id)

    deferred_turn_row_lists, rows = resolve_deferred_agent_turns(rows, session_state, task_id_to_tool_use_id)

    if flush_deferred_agent_turns and session_state.pending_agent_turns:
        flushed_row_lists = pop_all_deferred_agent_turn_row_lists(session_state)
        if flushed_row_lists:
            debug(f"Flushing {len(flushed_row_lists)} deferred agent turn(s) without task notification")
            deferred_turn_row_lists = deferred_turn_row_lists + flushed_row_lists

    if flush_deferred_agent_turns and session_state.pending_task_notifications:
        debug(f"Dropping {len(session_state.pending_task_notifications)} unresolved task notification(s) at session end")
        session_state.pending_task_notifications = []

    # Each deferred row list is a complete turn from an earlier hook run, so
    # it is rebuilt in isolation and emitted before the current batch (its
    # rows are always chronologically older than anything in the batch).
    turns: List[Turn] = []
    for deferred_turn_rows in deferred_turn_row_lists:
        turns.extend(build_turns(deferred_turn_rows, task_id_to_tool_use_id))
    if rows:
        turns.extend(build_turns(rows, task_id_to_tool_use_id))

    return turns, session_state

def get_subagent_transcripts_by_tool_use_id(transcript_path: Path) -> Dict[str, Dict[str, Any]]:
    """Map launching Agent/Task tool_use ids to their subagent transcripts."""
    subagent_dir = transcript_path.with_suffix("") / "subagents"
    if not subagent_dir.is_dir():
        return {}

    subagent_transcripts_by_tool_use_id: Dict[str, Dict[str, Any]] = {}
    for meta_path in subagent_dir.glob("*.meta.json"):
        try:
            metadata = json.loads(meta_path.read_text(encoding="utf-8"))
        except Exception:
            continue

        tool_use_id = metadata.get("toolUseId")
        if not isinstance(tool_use_id, str) or not tool_use_id:
            continue

        jsonl_path = meta_path.with_name(meta_path.name[: -len(".meta.json")] + ".jsonl")
        if not jsonl_path.exists():
            continue

        agent_id = meta_path.name[: -len(".meta.json")]
        if agent_id.startswith("agent-"):
            agent_id = agent_id[len("agent-"):]

        subagent_transcripts_by_tool_use_id[tool_use_id] = {
            "path": jsonl_path,
            "agent_id": agent_id,
            "agent_type": metadata.get("agentType"),
            "description": metadata.get("description"),
        }
    return subagent_transcripts_by_tool_use_id

def get_task_id_to_tool_use_id(
    subagent_transcripts_by_tool_use_id: Optional[Dict[str, Dict[str, Any]]],
) -> Dict[str, str]:
    task_id_to_tool_use_id: Dict[str, str] = {}
    if not subagent_transcripts_by_tool_use_id:
        return task_id_to_tool_use_id

    for tool_use_id, subagent in subagent_transcripts_by_tool_use_id.items():
        agent_id = subagent.get("agent_id")
        if isinstance(agent_id, str) and agent_id:
            task_id_to_tool_use_id[agent_id] = tool_use_id
    return task_id_to_tool_use_id


# ----------------- OTLP/JSON emitter -----------------
# Spans are built as plain OTLP/HTTP/JSON structures and POSTed to
# {base_url}/v1/traces. IDs are minted locally: 16-byte trace ids and
# 8-byte span ids, hex-encoded, as expected by OTLP JSON.

SPAN_TYPE_ATTR = "lmnr.span.type"
SPAN_INPUT_ATTR = "lmnr.span.input"
SPAN_OUTPUT_ATTR = "lmnr.span.output"
SPAN_PATH_ATTR = "lmnr.span.path"
ASSOC_PREFIX = "lmnr.association.properties"

def new_trace_id() -> str:
    return secrets.token_hex(16)

def new_span_id() -> str:
    return secrets.token_hex(8)

def to_otel_nanoseconds(ts: Optional[datetime]) -> Optional[int]:
    """Convert a datetime to OTel-style nanoseconds since epoch."""
    if ts is None:
        return None
    return int(ts.timestamp() * 1_000_000_000)

def _get_latest_timestamp(*timestamps: Optional[datetime]) -> Optional[datetime]:
    present_timestamps = [timestamp for timestamp in timestamps if timestamp is not None]
    return max(present_timestamps) if present_timestamps else None

def _attr_value(value: Any) -> Optional[Dict[str, Any]]:
    if isinstance(value, bool):
        return {"boolValue": value}
    if isinstance(value, int):
        return {"intValue": str(value)}
    if isinstance(value, float):
        return {"doubleValue": value}
    if isinstance(value, str):
        return {"stringValue": value}
    if isinstance(value, list):
        values = [v for v in (_attr_value(x) for x in value) if v is not None]
        return {"arrayValue": {"values": values}}
    return None

def build_otlp_attributes(attributes: Dict[str, Any]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for key, value in attributes.items():
        if value is None:
            continue
        attr_value = _attr_value(value)
        if attr_value is None:
            continue
        out.append({"key": key, "value": attr_value})
    return out

def json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, default=str)


class OtlpSpanCollector:
    """Accumulates finished OTLP spans and exports them in one request."""

    def __init__(self, config: LaminarConfig):
        self.config = config
        self.spans: List[Dict[str, Any]] = []

    def add_span(
        self,
        *,
        trace_id: str,
        span_id: str,
        parent_span_id: str,
        name: str,
        start_time: Optional[datetime],
        end_time: Optional[datetime],
        attributes: Dict[str, Any],
    ) -> None:
        now_ns = to_otel_nanoseconds(datetime.now(timezone.utc))
        start_ns = to_otel_nanoseconds(start_time) or now_ns
        end_ns = to_otel_nanoseconds(end_time) or start_ns
        if end_ns < start_ns:
            end_ns = start_ns
        self.spans.append({
            "traceId": trace_id,
            "spanId": span_id,
            "parentSpanId": parent_span_id,
            "name": name,
            "kind": "SPAN_KIND_INTERNAL",
            "startTimeUnixNano": str(start_ns),
            "endTimeUnixNano": str(end_ns),
            "attributes": build_otlp_attributes(attributes),
            "status": {"code": "STATUS_CODE_OK"},
        })

    def export(self) -> bool:
        if not self.spans:
            return True
        payload = {
            "resourceSpans": [
                {
                    "resource": {
                        "attributes": build_otlp_attributes({
                            "service.name": "claude-code",
                            "telemetry.sdk.language": "python",
                            "telemetry.sdk.name": "lmnr-claude-code-plugin",
                        }),
                    },
                    "scopeSpans": [
                        {
                            "scope": {"name": "lmnr.claude_code"},
                            "spans": self.spans,
                        }
                    ],
                }
            ]
        }
        body = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            f"{self.config.base_url}/v1/traces",
            data=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.config.api_key}",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=EXPORT_TIMEOUT_S) as resp:
                debug(f"OTLP export: {resp.status}, {len(self.spans)} span(s)")
                exported = 200 <= resp.status < 300
        except urllib.error.HTTPError as e:
            info(f"OTLP export failed: HTTP {e.code}: {e.read(500)!r}")
            exported = False
        except Exception as e:
            info(f"OTLP export failed: {type(e).__name__}: {e}")
            exported = False
        self.spans = []
        return exported


class SpanHandle:
    """A mutable span under construction; finalized into the collector on end()."""

    def __init__(
        self,
        collector: OtlpSpanCollector,
        *,
        trace_id: str,
        span_id: str,
        parent_span_id: str,
        name: str,
        start_time: Optional[datetime],
        attributes: Dict[str, Any],
    ):
        self.collector = collector
        self.trace_id = trace_id
        self.span_id = span_id
        self.parent_span_id = parent_span_id
        self.name = name
        self.start_time = start_time
        self.attributes = attributes
        self._ended = False

    def set_attributes(self, attributes: Dict[str, Any]) -> None:
        self.attributes.update(attributes)

    def end(self, end_time: Optional[datetime]) -> None:
        if self._ended:
            return
        self._ended = True
        self.collector.add_span(
            trace_id=self.trace_id,
            span_id=self.span_id,
            parent_span_id=self.parent_span_id,
            name=self.name,
            start_time=self.start_time,
            end_time=end_time,
            attributes=self.attributes,
        )


def start_span(
    collector: OtlpSpanCollector,
    *,
    name: str,
    trace_id: str,
    parent: Optional[SpanHandle],
    start_time: Optional[datetime],
    span_type: str = "DEFAULT",
    input_value: Any = None,
    attributes: Optional[Dict[str, Any]] = None,
) -> SpanHandle:
    attrs: Dict[str, Any] = {SPAN_TYPE_ATTR: span_type}
    if input_value is not None:
        attrs[SPAN_INPUT_ATTR] = json_dumps(input_value)
    if attributes:
        attrs.update(attributes)
    return SpanHandle(
        collector,
        trace_id=trace_id,
        span_id=new_span_id(),
        parent_span_id=parent.span_id if parent is not None else "",
        name=name,
        start_time=start_time,
        attributes=attrs,
    )


# ----------------- Emission: trace naming and tags -----------------
def collect_skill_tags(turn: Turn) -> List[str]:
    """Return 'skill:<name>' tags for every Skill tool invocation in the turn."""
    names: List[str] = []
    for assistant_message in turn.assistant_msgs:
        for tool_use in get_tool_use_blocks(get_content_from_row(assistant_message)):
            if tool_use.get("name") != "Skill":
                continue
            tool_input = tool_use.get("input")
            skill = tool_input.get("skill") if isinstance(tool_input, dict) else None
            if isinstance(skill, str) and skill and f"skill:{skill}" not in names:
                names.append(f"skill:{skill}")
    return names

def short_session_label(session_id: str, max_len: int = 12) -> str:
    """Return a compact session label for trace names."""
    sid = session_id.strip()
    if not sid:
        return "unknown"
    parts = sid.split("-")
    if len(parts) == 5 and len(parts[0]) == 8:
        return parts[0]
    return sid if len(sid) <= max_len else sid[:max_len].rstrip("-")

def trace_display_name(session_id: str, turn_num: int) -> str:
    return f"Claude Code - Turn {turn_num} ({short_session_label(session_id)})"

def get_trace_tags(turn: Turn) -> List[str]:
    tags = ["claude-code"]
    if SKILL_TAGS:
        tags += collect_skill_tags(turn)
    return tags


# ----------------- Emission: generation payloads -----------------
def build_generation_input_messages(
    assistant_index: int,
    user_text: str,
    previous_tool_results: List[Dict[str, Any]],
    ready_async_tool_results: List[Dict[str, Any]],
) -> Optional[List[Dict[str, Any]]]:
    if assistant_index == 0:
        return [{"role": "user", "content": user_text}]
    # Both feed the next generation's context: results from the previous tool
    # batch AND async agent results that became ready since.
    tool_results = list(previous_tool_results)
    tool_results += [result["tool_result"] for result in ready_async_tool_results]
    if tool_results:
        return [
            {
                "role": "tool",
                "content": json_dumps(tool_result.get("output")),
                "tool_call_id": tool_result.get("tool_use_id"),
                "name": tool_result.get("tool_name"),
            }
            for tool_result in tool_results
        ]
    return None

def build_generation_output_message(assistant_text: str, tool_uses: List[Dict[str, Any]]) -> Dict[str, Any]:
    output: Dict[str, Any] = {"role": "assistant", "content": assistant_text or ""}
    if tool_uses:
        output["tool_calls"] = [
            {
                "id": tool_use.get("id"),
                "name": tool_use.get("name"),
                "arguments": tool_use.get("input") if isinstance(tool_use.get("input"), dict) else {},
            }
            for tool_use in tool_uses
        ]
    return output


# ----------------- Emission: tool spans -----------------
@dataclass
class ToolResultForObservation:
    output: Any = None
    output_meta: Optional[Dict[str, Any]] = None
    result_timestamp: Optional[datetime] = None
    final_output: Any = None
    final_result_timestamp: Optional[datetime] = None

@dataclass
class EmittedSingleToolObservation:
    handoff_timestamp: Optional[datetime]
    tool_result: Dict[str, Any]
    latest_end_timestamp: Optional[datetime]

@dataclass
class EmittedToolObservationBatch:
    result_timestamps: List[datetime]
    tool_results: List[Dict[str, Any]]
    latest_end_timestamp: Optional[datetime]

def get_tool_input_for_observation(tool_use: Dict[str, Any]) -> Tuple[Any, Optional[Dict[str, Any]]]:
    tool_input_raw = (
        tool_use.get("input")
        if isinstance(tool_use.get("input"), (dict, list, str, int, float, bool))
        else {}
    )
    if isinstance(tool_input_raw, str):
        return truncate_text(tool_input_raw)
    return tool_input_raw, None

def get_tool_result_for_observation(tool_result_entry: Any) -> ToolResultForObservation:
    if not isinstance(tool_result_entry, dict):
        return ToolResultForObservation()

    output_raw = tool_result_entry.get("content")
    output_str = output_raw if isinstance(output_raw, str) else json.dumps(output_raw, ensure_ascii=False)
    output, output_meta = truncate_text(output_str)
    result_timestamp = parse_timestamp(tool_result_entry.get("timestamp"))

    final_output_raw = tool_result_entry.get("final_content")
    if final_output_raw is None:
        return ToolResultForObservation(
            output=output,
            output_meta=output_meta,
            result_timestamp=result_timestamp,
        )

    final_output_str = (
        final_output_raw
        if isinstance(final_output_raw, str)
        else json.dumps(final_output_raw, ensure_ascii=False)
    )
    final_output, _ = truncate_text(final_output_str)
    final_result_timestamp = parse_timestamp(tool_result_entry.get("final_timestamp"))
    return ToolResultForObservation(
        output=output,
        output_meta=output_meta,
        result_timestamp=result_timestamp,
        final_output=final_output,
        final_result_timestamp=final_result_timestamp,
    )

def get_short_transcript_path_for_metadata(path: Any) -> Optional[str]:
    if isinstance(path, Path):
        return path.name
    if isinstance(path, str) and path:
        return Path(path).name
    return None

def build_tool_metadata_attributes(
    tool_name: str,
    tool_use_id: str,
    subagent: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    # Plain span attributes, NOT lmnr.association.properties.metadata.* —
    # association metadata propagates to the whole trace, so per-tool details
    # there would pollute (and race on) the trace-level metadata.
    attrs: Dict[str, Any] = {
        "claude_code.tool.name": tool_name,
        "claude_code.tool.id": tool_use_id,
    }
    if subagent:
        agent_type = subagent.get("agent_type")
        description = subagent.get("description")
        if isinstance(agent_type, str) and agent_type:
            attrs["claude_code.subagent.type"] = agent_type
        if isinstance(description, str) and description:
            attrs["claude_code.subagent.description"] = description
    return attrs

def emit_single_tool_observation(
    collector: OtlpSpanCollector,
    parent_span: SpanHandle,
    turn: Turn,
    assistant_timestamp: Optional[datetime],
    tool_use: Dict[str, Any],
    subagent_transcripts_by_tool_use_id: Optional[Dict[str, Dict[str, Any]]],
    pending_subagents: List[Dict[str, Any]],
    pending_async_tool_results: List[Dict[str, Any]],
) -> EmittedSingleToolObservation:
    tool_use_id = str(tool_use.get("id") or "")
    tool_name = tool_use.get("name") or "unknown"
    tool_input, _ = get_tool_input_for_observation(tool_use)

    tool_result_entry = turn.tool_results_by_id.get(tool_use_id) if tool_use_id else None
    tool_result = get_tool_result_for_observation(tool_result_entry)

    tool_output: Any = tool_result.output
    if CAPTURE_SKILL_CONTENT:
        injected = turn.injected_by_tool_id.get(tool_use_id) if tool_use_id else None
        if injected:
            injected_trunc, _ = truncate_text(injected)
            tool_output = {"result": tool_result.output, "injected_instructions": injected_trunc}

    subagent = (
        subagent_transcripts_by_tool_use_id.get(tool_use_id)
        if subagent_transcripts_by_tool_use_id and tool_use_id
        else None
    )

    tool_use_timestamp = parse_timestamp(turn.tool_use_timestamps_by_id.get(tool_use_id)) or assistant_timestamp
    tool_span = start_span(
        collector,
        name=tool_name,
        trace_id=parent_span.trace_id,
        parent=parent_span,
        start_time=tool_use_timestamp,
        span_type="TOOL",
        input_value=tool_input,
        attributes=build_tool_metadata_attributes(tool_name, tool_use_id, subagent),
    )
    if tool_output is not None:
        tool_span.set_attributes({SPAN_OUTPUT_ATTR: json_dumps(tool_output)})

    # Subagent subtrees nest under their launching Agent/Task tool span so the
    # frontend groups them automatically.
    subagent_end_timestamp = None
    if subagent:
        if tool_result.final_result_timestamp is not None:
            pending_subagents.append({
                "tool_use_id": tool_use_id,
                "subagent": subagent,
                "parent_span": tool_span,
                "start_timestamp": tool_use_timestamp,
                "ready_timestamp": tool_result.final_result_timestamp,
            })
        else:
            subagent_end_timestamp = emit_subagent_observations(
                collector,
                tool_span,
                subagent,
                tool_use_timestamp,
            )

    tool_end_timestamp = _get_latest_timestamp(
        tool_result.result_timestamp,
        tool_result.final_result_timestamp,
        subagent_end_timestamp,
        tool_use_timestamp,
    )
    handoff_timestamp = (
        tool_result.result_timestamp
        or tool_result.final_result_timestamp
        or subagent_end_timestamp
        or assistant_timestamp
    )
    tool_span.end(end_time=tool_end_timestamp)

    if tool_result.final_result_timestamp is not None and tool_result.final_output is not None:
        pending_async_tool_results.append({
            "timestamp": tool_result.final_result_timestamp,
            "tool_result": {
                "tool_use_id": tool_use_id,
                "tool_name": tool_name,
                "output": tool_result.final_output,
            },
        })

    return EmittedSingleToolObservation(
        handoff_timestamp=handoff_timestamp,
        tool_result={
            "tool_use_id": tool_use_id,
            "tool_name": tool_name,
            "output": tool_result.output,
        },
        latest_end_timestamp=_get_latest_timestamp(tool_end_timestamp, subagent_end_timestamp),
    )

def emit_tool_observation_batch(
    collector: OtlpSpanCollector,
    parent_span: SpanHandle,
    turn: Turn,
    assistant_message: Dict[str, Any],
    tool_uses: List[Dict[str, Any]],
    subagent_transcripts_by_tool_use_id: Optional[Dict[str, Dict[str, Any]]],
    pending_subagents: List[Dict[str, Any]],
    pending_async_tool_results: List[Dict[str, Any]],
) -> EmittedToolObservationBatch:
    assistant_timestamp = parse_timestamp(assistant_message)
    tool_result_timestamps: List[datetime] = []
    emitted_tool_results: List[Dict[str, Any]] = []
    latest_tool_end_timestamp: Optional[datetime] = None

    for tool_use in tool_uses:
        emitted_tool = emit_single_tool_observation(
            collector,
            parent_span,
            turn,
            assistant_timestamp,
            tool_use,
            subagent_transcripts_by_tool_use_id,
            pending_subagents,
            pending_async_tool_results,
        )
        if emitted_tool.handoff_timestamp is not None:
            tool_result_timestamps.append(emitted_tool.handoff_timestamp)
        emitted_tool_results.append(emitted_tool.tool_result)
        latest_tool_end_timestamp = _get_latest_timestamp(
            latest_tool_end_timestamp,
            emitted_tool.latest_end_timestamp,
        )

    return EmittedToolObservationBatch(
        result_timestamps=tool_result_timestamps,
        tool_results=emitted_tool_results,
        latest_end_timestamp=latest_tool_end_timestamp,
    )


# ----------------- Emission: turn and subagent spans -----------------
def get_ready_subagents(
    pending_subagents: List[Dict[str, Any]],
    assistant_timestamp: Optional[datetime],
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    ready_subagents: List[Dict[str, Any]] = []
    still_pending_subagents: List[Dict[str, Any]] = []
    for pending_subagent in pending_subagents:
        ready_timestamp = pending_subagent.get("ready_timestamp")
        if isinstance(ready_timestamp, datetime) and (
            assistant_timestamp is None or ready_timestamp <= assistant_timestamp
        ):
            ready_subagents.append(pending_subagent)
        else:
            still_pending_subagents.append(pending_subagent)
    return ready_subagents, still_pending_subagents

def get_ready_async_tool_results(
    pending_async_tool_results: List[Dict[str, Any]],
    assistant_timestamp: Optional[datetime],
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], Optional[datetime]]:
    ready_async_tool_results: List[Dict[str, Any]] = []
    still_pending_tool_results: List[Dict[str, Any]] = []
    for async_tool_result in pending_async_tool_results:
        async_result_timestamp = async_tool_result.get("timestamp")
        if isinstance(async_result_timestamp, datetime) and (
            assistant_timestamp is None or async_result_timestamp <= assistant_timestamp
        ):
            ready_async_tool_results.append(async_tool_result)
        else:
            still_pending_tool_results.append(async_tool_result)

    latest_ready_timestamp = _get_latest_timestamp(*[
        result.get("timestamp")
        for result in ready_async_tool_results
        if isinstance(result.get("timestamp"), datetime)
    ])
    return ready_async_tool_results, still_pending_tool_results, latest_ready_timestamp

def update_pending_subagent_display_start_after_launch_response(
    pending_subagents: List[Dict[str, Any]],
    tool_results_used_as_generation_input: List[Dict[str, Any]],
    generation_start_timestamp: Optional[datetime],
) -> None:
    if generation_start_timestamp is None:
        return

    tool_use_ids = {
        str(tool_result.get("tool_use_id"))
        for tool_result in tool_results_used_as_generation_input
        if isinstance(tool_result, dict) and tool_result.get("tool_use_id")
    }
    if not tool_use_ids:
        return

    for pending_subagent in pending_subagents:
        if pending_subagent.get("display_start_timestamp") is not None:
            continue
        if pending_subagent.get("tool_use_id") in tool_use_ids:
            pending_subagent["display_start_timestamp"] = generation_start_timestamp + timedelta(
                microseconds=1
            )

def build_generation_attributes(
    assistant_index: int,
    assistant_message: Dict[str, Any],
    user_text: str,
    previous_tool_results: List[Dict[str, Any]],
    ready_async_tool_results: List[Dict[str, Any]],
) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    assistant_text_raw = extract_text_from_content(get_content_from_row(assistant_message))
    assistant_text, _ = truncate_text(assistant_text_raw)
    tool_uses = get_tool_use_blocks(get_content_from_row(assistant_message))

    model = get_model(assistant_message)
    attrs: Dict[str, Any] = {
        "gen_ai.system": "anthropic",
        "gen_ai.request.model": model,
        "gen_ai.response.model": model,
    }

    input_messages = build_generation_input_messages(
        assistant_index,
        user_text,
        previous_tool_results,
        ready_async_tool_results,
    )
    if input_messages is not None:
        attrs["gen_ai.input.messages"] = json_dumps(input_messages)
    attrs["gen_ai.output.messages"] = json_dumps(
        [build_generation_output_message(assistant_text, tool_uses)]
    )

    usage_details = get_usage_details_from_row(assistant_message)
    if usage_details is not None:
        total = 0
        for key, value in usage_details.items():
            attrs[f"gen_ai.usage.{key}"] = value
            total += value
        attrs["llm.usage.total_tokens"] = total

    return attrs, tool_uses

def emit_subagent_observations(
    collector: OtlpSpanCollector,
    parent_span: SpanHandle,
    subagent: Dict[str, Any],
    start_timestamp: Optional[datetime],
) -> Optional[datetime]:
    path = subagent.get("path")
    if not isinstance(path, Path):
        return start_timestamp
    rows = read_subagent_jsonl(path)
    if rows is None:
        return start_timestamp

    turns = build_turns(rows)
    if not turns:
        return start_timestamp

    first_turn = turns[0]
    subagent_start_timestamp = start_timestamp or parse_timestamp(first_turn.user_msg)
    subagent_input_text, _ = truncate_text(extract_text_from_content(get_content_from_row(first_turn.user_msg)))

    last_turn = turns[-1]
    last_assistant = last_turn.assistant_msgs[-1]
    subagent_output_text, _ = truncate_text(extract_text_from_content(get_content_from_row(last_assistant)))

    description = subagent.get("description")
    subagent_name = f"Subagent: {description}" if isinstance(description, str) and description else "Subagent"
    agent_type = subagent.get("agent_type")
    subagent_attrs: Dict[str, Any] = {}
    if isinstance(agent_type, str) and agent_type:
        subagent_attrs["claude_code.subagent.type"] = agent_type
    subagent_span = start_span(
        collector,
        name=subagent_name,
        trace_id=parent_span.trace_id,
        parent=parent_span,
        start_time=subagent_start_timestamp,
        span_type="DEFAULT",
        input_value={"role": "user", "content": subagent_input_text},
        attributes=subagent_attrs,
    )

    latest_end_timestamp = subagent_start_timestamp
    previous_start_timestamp = subagent_start_timestamp
    for turn in turns:
        latest_turn_timestamp = emit_turn_observations(
            collector,
            subagent_span,
            turn,
            previous_start_timestamp,
            generation_prefix="Subagent LLM Call",
            subagent_transcripts_by_tool_use_id=None,
        )
        latest_end_timestamp = _get_latest_timestamp(latest_end_timestamp, latest_turn_timestamp)
        if latest_turn_timestamp is not None:
            previous_start_timestamp = latest_turn_timestamp

    subagent_span.set_attributes({
        SPAN_OUTPUT_ATTR: json_dumps({"role": "assistant", "content": subagent_output_text}),
    })
    subagent_span.end(
        end_time=_get_latest_timestamp(latest_end_timestamp, subagent_start_timestamp)
    )

    return latest_end_timestamp

def read_subagent_jsonl(path: Path) -> Optional[List[Dict[str, Any]]]:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except Exception as e:
        info(f"subagent transcript read failed ({path}): {type(e).__name__}: {e}")
        return None

    rows: List[Dict[str, Any]] = []
    for line_number, line in enumerate(lines, start=1):
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except Exception as e:
            info(f"subagent transcript line skipped ({path}:{line_number}): {type(e).__name__}: {e}")
            continue
        if not isinstance(row, dict):
            info(f"subagent transcript line skipped ({path}:{line_number}): expected JSON object")
            continue
        rows.append(row)
    return rows

def emit_turn_observations(
    collector: OtlpSpanCollector,
    parent_span: SpanHandle,
    turn: Turn,
    start_timestamp: Optional[datetime],
    generation_prefix: str = "LLM Call",
    subagent_transcripts_by_tool_use_id: Optional[Dict[str, Dict[str, Any]]] = None,
) -> Optional[datetime]:
    """Emit a turn's generations and tool spans under an existing span."""
    user_text, _ = truncate_text(extract_text_from_content(get_content_from_row(turn.user_msg)))
    previous_timestamp = start_timestamp
    previous_tool_results: List[Dict[str, Any]] = []
    pending_async_tool_results: List[Dict[str, Any]] = []
    pending_subagents: List[Dict[str, Any]] = []
    latest_end_timestamp = start_timestamp

    for assistant_index, assistant_message in enumerate(turn.assistant_msgs):
        assistant_timestamp = parse_timestamp(assistant_message)
        if assistant_index > 0 and pending_subagents:
            ready_subagents, pending_subagents = get_ready_subagents(
                pending_subagents,
                assistant_timestamp,
            )
            for ready_subagent in ready_subagents:
                subagent_end_timestamp = emit_subagent_observations(
                    collector,
                    ready_subagent.get("parent_span") or parent_span,
                    ready_subagent["subagent"],
                    ready_subagent.get("display_start_timestamp") or ready_subagent.get("start_timestamp"),
                )
                latest_end_timestamp = _get_latest_timestamp(latest_end_timestamp, subagent_end_timestamp)

        ready_async_tool_results: List[Dict[str, Any]] = []
        if assistant_index > 0 and pending_async_tool_results:
            ready_async_tool_results, pending_async_tool_results, ready_async_result_timestamp = (
                get_ready_async_tool_results(pending_async_tool_results, assistant_timestamp)
            )
            previous_timestamp = _get_latest_timestamp(previous_timestamp, ready_async_result_timestamp)

        generation_attrs, tool_uses = build_generation_attributes(
            assistant_index,
            assistant_message,
            user_text,
            previous_tool_results,
            ready_async_tool_results,
        )
        generation_start_timestamp = previous_timestamp or assistant_timestamp
        generation_span = start_span(
            collector,
            name=f"{generation_prefix} {assistant_index + 1}",
            trace_id=parent_span.trace_id,
            parent=parent_span,
            start_time=generation_start_timestamp,
            span_type="LLM",
            attributes=generation_attrs,
        )
        update_pending_subagent_display_start_after_launch_response(
            pending_subagents,
            previous_tool_results,
            generation_start_timestamp,
        )

        emitted_tools = emit_tool_observation_batch(
            collector,
            parent_span,
            turn,
            assistant_message,
            tool_uses,
            subagent_transcripts_by_tool_use_id,
            pending_subagents,
            pending_async_tool_results,
        )
        latest_end_timestamp = _get_latest_timestamp(
            latest_end_timestamp,
            emitted_tools.latest_end_timestamp,
        )

        generation_end_timestamp = assistant_timestamp or generation_start_timestamp
        generation_span.end(end_time=generation_end_timestamp)
        latest_end_timestamp = _get_latest_timestamp(latest_end_timestamp, generation_end_timestamp)

        previous_tool_results = emitted_tools.tool_results
        if emitted_tools.result_timestamps:
            previous_timestamp = max(emitted_tools.result_timestamps)
        elif assistant_timestamp is not None:
            previous_timestamp = assistant_timestamp

    for pending_subagent in pending_subagents:
        subagent_end_timestamp = emit_subagent_observations(
            collector,
            pending_subagent.get("parent_span") or parent_span,
            pending_subagent["subagent"],
            pending_subagent.get("display_start_timestamp") or pending_subagent.get("start_timestamp"),
        )
        latest_end_timestamp = _get_latest_timestamp(latest_end_timestamp, subagent_end_timestamp)

    return latest_end_timestamp

def get_turn_end_timestamp(turn: Turn) -> Optional[datetime]:
    last_assistant_timestamp = parse_timestamp(turn.assistant_msgs[-1]) if turn.assistant_msgs else None
    candidate_end_timestamps = [
        timestamp
        for timestamp in [last_assistant_timestamp]
        if timestamp is not None
    ]
    for tool_result_entry in turn.tool_results_by_id.values():
        timestamp = parse_timestamp(tool_result_entry)
        if timestamp is not None:
            candidate_end_timestamps.append(timestamp)
    return max(candidate_end_timestamps) if candidate_end_timestamps else None

def build_trace_root_attributes(
    config: LaminarConfig,
    session_id: str,
    turn_num: int,
    turn: Turn,
    transcript_path: Path,
) -> Dict[str, Any]:
    attrs: Dict[str, Any] = {
        f"{ASSOC_PREFIX}.session_id": session_id,
        f"{ASSOC_PREFIX}.tags": get_trace_tags(turn),
        f"{ASSOC_PREFIX}.metadata.source": "claude-code",
        f"{ASSOC_PREFIX}.metadata.turn_number": str(turn_num),
        f"{ASSOC_PREFIX}.metadata.transcript": get_short_transcript_path_for_metadata(transcript_path) or "",
    }
    if config.user_id:
        attrs[f"{ASSOC_PREFIX}.user_id"] = config.user_id
    # Transcript rows carry the project dir and git branch so traces from
    # different projects/worktrees are distinguishable in Laminar.
    for src_key, dst_key in (("cwd", "cwd"), ("gitBranch", "git_branch")):
        value = turn.user_msg.get(src_key)
        if isinstance(value, str) and value:
            attrs[f"{ASSOC_PREFIX}.metadata.{dst_key}"] = value
    return attrs

def emit_turn(
    collector: OtlpSpanCollector,
    config: LaminarConfig,
    session_id: str,
    turn_num: int,
    turn: Turn,
    transcript_path: Path,
    subagent_transcripts_by_tool_use_id: Optional[Dict[str, Dict[str, Any]]] = None,
) -> None:
    user_text_raw = extract_text_from_content(get_content_from_row(turn.user_msg))
    user_text, _ = truncate_text(user_text_raw)

    last_assistant = turn.assistant_msgs[-1]
    final_assistant_text, _ = truncate_text(extract_text_from_content(get_content_from_row(last_assistant)))

    user_ts = parse_timestamp(turn.user_msg)
    last_assistant_ts = parse_timestamp(last_assistant)
    turn_end_ts = get_turn_end_timestamp(turn)

    trace_id = new_trace_id()
    root_span = start_span(
        collector,
        name=trace_display_name(session_id, turn_num),
        trace_id=trace_id,
        parent=None,
        start_time=user_ts,
        span_type="DEFAULT",
        input_value={"role": "user", "content": user_text},
        attributes=build_trace_root_attributes(config, session_id, turn_num, turn, transcript_path),
    )
    obs_end_ts = emit_turn_observations(
        collector,
        root_span,
        turn,
        user_ts,
        subagent_transcripts_by_tool_use_id=subagent_transcripts_by_tool_use_id,
    )
    root_span.set_attributes({
        SPAN_OUTPUT_ATTR: json_dumps({"role": "assistant", "content": final_assistant_text}),
    })
    root_span.end(
        end_time=_get_latest_timestamp(turn_end_ts, last_assistant_ts, obs_end_ts, user_ts)
    )


# ----------------- New turn emission orchestration -----------------
def emit_ready_turns(
    collector: OtlpSpanCollector,
    config: LaminarConfig,
    session_id: str,
    transcript_path: Path,
    turns_to_emit: List[Turn],
    session_state: SessionState,
    *,
    subagent_transcripts_by_tool_use_id: Dict[str, Dict[str, Any]],
) -> int:
    emitted = 0
    for turn in turns_to_emit:
        turn_num = session_state.turn_count + emitted + 1
        try:
            emit_turn(
                collector,
                config,
                session_id,
                turn_num,
                turn,
                transcript_path,
                subagent_transcripts_by_tool_use_id=subagent_transcripts_by_tool_use_id,
            )
        except Exception as e:
            # Log at INFO so emit failures are visible without CC_LMNR_DEBUG=true.
            # The failed turn is not counted, so turn_count only reflects turns
            # whose spans were actually built.
            info(f"emit_turn failed: {type(e).__name__}: {e}")
            continue
        emitted += 1
    return emitted

def emit_new_turns_from_transcript(
    collector: OtlpSpanCollector,
    config: LaminarConfig,
    session_id: str,
    transcript_path: Path,
    *,
    flush_deferred_agent_turns: bool = False,
) -> int:
    with FileLock(LOCK_FILE):
        state = load_hook_state()
        key = get_session_state_key(session_id, str(transcript_path))
        session_state = get_session_state(state, key)

        subagent_transcripts_by_tool_use_id = get_subagent_transcripts_by_tool_use_id(transcript_path)
        if subagent_transcripts_by_tool_use_id:
            debug(f"Discovered {len(subagent_transcripts_by_tool_use_id)} subagent transcript(s)")

        turns, session_state = get_new_turns_from_transcript(
            transcript_path,
            session_state,
            subagent_transcripts_by_tool_use_id,
            flush_deferred_agent_turns=flush_deferred_agent_turns,
        )
        if not turns:
            save_session_state(state, key, session_state)
            return 0

        turns_to_emit = get_turns_to_emit(
            turns,
            session_state,
            flush_deferred_agent_turns=flush_deferred_agent_turns,
        )
        emitted = emit_ready_turns(
            collector,
            config,
            session_id,
            transcript_path,
            turns_to_emit,
            session_state,
            subagent_transcripts_by_tool_use_id=subagent_transcripts_by_tool_use_id,
        )

        # Only persist the advanced offset after a successful export; on
        # failure the old state stays on disk so the next hook run re-reads
        # the same bytes and retries. (In-memory mutations to session_state
        # are discarded because save_session_state is the only writer.)
        exported = export_with_timeout(collector)
        if not exported:
            info("OTLP export failed; keeping previous state so these turns are retried on the next hook run")
            return 0

        session_state.turn_count += emitted
        save_session_state(state, key, session_state)
        return emitted


def export_with_timeout(collector: OtlpSpanCollector) -> bool:
    """Run the export on a daemon thread capped at EXPORT_TIMEOUT_S + 1 so a
    hung connection can't stall Claude Code."""
    result: List[bool] = [False]

    def _export() -> None:
        result[0] = collector.export()

    t = threading.Thread(target=_export, daemon=True)
    t.start()
    t.join(EXPORT_TIMEOUT_S + 1.0)
    return result[0]


# ----------------- Main -----------------
def main() -> int:
    start = time.time()
    debug("Hook started")

    config = get_laminar_config()
    if config is None:
        return 0

    payload = read_hook_payload()
    hook_context = get_session_id_and_transcript_path(payload)
    if hook_context is None:
        return 0

    session_id, transcript_path = hook_context
    flush_deferred_agent_turns = is_session_end_hook_payload(payload)

    collector = OtlpSpanCollector(config)

    try:
        emitted = emit_new_turns_from_transcript(
            collector,
            config,
            session_id,
            transcript_path,
            flush_deferred_agent_turns=flush_deferred_agent_turns,
        )

        dur = time.time() - start
        info(f"Processed {emitted} turns in {dur:.2f}s (session={session_id})")
        return 0

    except TimeoutError as e:
        debug(f"lock timeout, skipping: {e}")
        return 0

    except Exception as e:
        debug(f"Unexpected failure: {e}")
        return 0

if __name__ == "__main__":
    sys.exit(main())
