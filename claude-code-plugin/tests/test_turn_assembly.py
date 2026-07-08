import json

from lmnr_hook import (
    SessionState,
    build_turns,
    extract_text_from_content,
    get_pending_agent_tool_use_ids,
    get_turns_to_emit,
    get_usage_details_from_row,
    merge_assistant_rows,
    read_new_jsonl,
    truncate_text,
)


def user_row(text, ts="2026-07-08T10:00:00.000Z", **extra):
    return {
        "type": "user",
        "message": {"role": "user", "content": text},
        "timestamp": ts,
        **extra,
    }


def assistant_row(content, msg_id="msg_1", ts="2026-07-08T10:00:05.000Z", model="claude-opus-4-7"):
    return {
        "type": "assistant",
        "message": {
            "id": msg_id,
            "role": "assistant",
            "model": model,
            "content": content,
            "usage": {"input_tokens": 10, "output_tokens": 5},
        },
        "timestamp": ts,
    }


def tool_result_row(tool_use_id, content, ts="2026-07-08T10:00:10.000Z", **extra):
    return {
        "type": "user",
        "message": {
            "role": "user",
            "content": [{"type": "tool_result", "tool_use_id": tool_use_id, "content": content}],
        },
        "timestamp": ts,
        **extra,
    }


class TestBuildTurns:
    def test_simple_turn(self):
        rows = [
            user_row("hello"),
            assistant_row([{"type": "text", "text": "hi there"}]),
        ]
        turns = build_turns(rows)
        assert len(turns) == 1
        assert extract_text_from_content(turns[0].user_msg["message"]["content"]) == "hello"
        assert len(turns[0].assistant_msgs) == 1

    def test_two_turns(self):
        rows = [
            user_row("first"),
            assistant_row([{"type": "text", "text": "one"}], msg_id="m1"),
            user_row("second", ts="2026-07-08T10:01:00.000Z"),
            assistant_row([{"type": "text", "text": "two"}], msg_id="m2", ts="2026-07-08T10:01:05.000Z"),
        ]
        turns = build_turns(rows)
        assert len(turns) == 2

    def test_tool_use_turn(self):
        rows = [
            user_row("run ls"),
            assistant_row([
                {"type": "text", "text": "running"},
                {"type": "tool_use", "id": "tu_1", "name": "Bash", "input": {"command": "ls"}},
            ], msg_id="m1"),
            tool_result_row("tu_1", "file.txt"),
            assistant_row([{"type": "text", "text": "done"}], msg_id="m2", ts="2026-07-08T10:00:15.000Z"),
        ]
        turns = build_turns(rows)
        assert len(turns) == 1
        turn = turns[0]
        assert len(turn.assistant_msgs) == 2
        assert turn.tool_results_by_id["tu_1"]["content"] == "file.txt"

    def test_is_meta_rows_do_not_start_turns(self):
        rows = [
            user_row("real prompt"),
            user_row("injected caveat", isMeta=True),
            assistant_row([{"type": "text", "text": "reply"}]),
        ]
        turns = build_turns(rows)
        assert len(turns) == 1
        assert extract_text_from_content(turns[0].user_msg["message"]["content"]) == "real prompt"

    def test_injected_skill_content_keyed_by_tool_use(self):
        rows = [
            user_row("use skill"),
            assistant_row([
                {"type": "tool_use", "id": "tu_skill", "name": "Skill", "input": {"skill": "coding"}},
            ]),
            {"type": "user", "isMeta": True, "sourceToolUseID": "tu_skill",
             "message": {"role": "user", "content": "skill instructions"},
             "timestamp": "2026-07-08T10:00:07.000Z"},
            tool_result_row("tu_skill", "ok"),
            assistant_row([{"type": "text", "text": "done"}], msg_id="m2"),
        ]
        turns = build_turns(rows)
        assert turns[0].injected_by_tool_id["tu_skill"] == "skill instructions"

    def test_assistant_rows_merged_by_message_id(self):
        rows = [
            user_row("go"),
            assistant_row([{"type": "text", "text": "part1"}], msg_id="m1"),
            assistant_row([{"type": "tool_use", "id": "tu_1", "name": "Bash", "input": {}}], msg_id="m1"),
        ]
        turns = build_turns(rows)
        assert len(turns[0].assistant_msgs) == 1
        content = turns[0].assistant_msgs[0]["message"]["content"]
        assert len(content) == 2

    def test_assistant_before_user_ignored(self):
        rows = [
            assistant_row([{"type": "text", "text": "orphan"}]),
            user_row("hello"),
            assistant_row([{"type": "text", "text": "hi"}], msg_id="m2"),
        ]
        turns = build_turns(rows)
        assert len(turns) == 1

    def test_turn_without_assistant_dropped(self):
        rows = [user_row("no reply yet")]
        assert build_turns(rows) == []


class TestMergeAssistantRows:
    def test_string_content_wrapped(self):
        rows = [
            {"message": {"id": "m", "role": "assistant", "content": "text a"}},
            {"message": {"id": "m", "role": "assistant", "content": [{"type": "text", "text": "b"}]}},
        ]
        merged = merge_assistant_rows(rows)
        content = merged["message"]["content"]
        assert content[0] == {"type": "text", "text": "text a"}
        assert content[1] == {"type": "text", "text": "b"}


class TestUsage:
    def test_usage_extracted(self):
        row = assistant_row([{"type": "text", "text": "x"}])
        row["message"]["usage"] = {
            "input_tokens": 100,
            "output_tokens": 50,
            "cache_read_input_tokens": 2000,
            "cache_creation_input_tokens": 300,
        }
        details = get_usage_details_from_row(row)
        assert details == {
            "input_tokens": 100,
            "output_tokens": 50,
            "cache_read_input_tokens": 2000,
            "cache_creation_input_tokens": 300,
        }

    def test_zero_and_missing_skipped(self):
        row = assistant_row([{"type": "text", "text": "x"}])
        row["message"]["usage"] = {"input_tokens": 0, "output_tokens": 7}
        assert get_usage_details_from_row(row) == {"output_tokens": 7}

    def test_no_usage(self):
        row = assistant_row([{"type": "text", "text": "x"}])
        del row["message"]["usage"]
        assert get_usage_details_from_row(row) is None


class TestTruncate:
    def test_no_truncation(self):
        text, meta = truncate_text("short")
        assert text == "short"
        assert meta["truncated"] is False

    def test_truncation(self):
        text, meta = truncate_text("a" * 30000, max_chars=100)
        assert len(text) == 100
        assert meta["truncated"] is True
        assert meta["orig_len"] == 30000
        assert "sha256" in meta


class TestAsyncAgentDeferral:
    def _async_agent_turn_rows(self):
        return [
            user_row("launch agent"),
            assistant_row([
                {"type": "tool_use", "id": "tu_agent", "name": "Agent", "input": {"prompt": "do work"}},
            ]),
            tool_result_row(
                "tu_agent",
                "Async agent launched successfully",
                toolUseResult={"status": "async_launched"},
            ),
            assistant_row([{"type": "text", "text": "launched, waiting"}], msg_id="m2"),
        ]

    def test_async_turn_deferred(self):
        turns = build_turns(self._async_agent_turn_rows())
        assert get_pending_agent_tool_use_ids(turns[0]) == ["tu_agent"]

        state = SessionState()
        to_emit = get_turns_to_emit(turns, state)
        assert to_emit == []
        assert len(state.pending_agent_turns) == 1
        assert state.pending_agent_turns[0]["pending_tool_use_ids"] == ["tu_agent"]

    def test_async_turn_flushed_at_session_end(self):
        turns = build_turns(self._async_agent_turn_rows())
        state = SessionState()
        to_emit = get_turns_to_emit(turns, state, flush_deferred_agent_turns=True)
        assert len(to_emit) == 1

    def test_sync_agent_not_deferred(self):
        rows = [
            user_row("run agent"),
            assistant_row([
                {"type": "tool_use", "id": "tu_sync", "name": "Task", "input": {}},
            ]),
            tool_result_row("tu_sync", "agent finished: result text"),
            assistant_row([{"type": "text", "text": "summary"}], msg_id="m2"),
        ]
        turns = build_turns(rows)
        assert get_pending_agent_tool_use_ids(turns[0]) == []

    def test_task_notification_resolves_tool_result(self):
        notification = (
            "<task-notification><tool-use-id>tu_agent</tool-use-id>"
            "<result>agent output here</result></task-notification>"
        )
        rows = self._async_agent_turn_rows() + [
            user_row(notification, ts="2026-07-08T10:05:00.000Z"),
            assistant_row([{"type": "text", "text": "agent done"}], msg_id="m3", ts="2026-07-08T10:05:05.000Z"),
        ]
        turns = build_turns(rows)
        assert len(turns) == 1
        entry = turns[0].tool_results_by_id["tu_agent"]
        assert entry["final_content"] == "agent output here"
        assert get_pending_agent_tool_use_ids(turns[0]) == []


class TestReadNewJsonl(object):
    def test_incremental_read(self, tmp_path):
        p = tmp_path / "t.jsonl"
        p.write_text(json.dumps({"a": 1}) + "\n")
        state = SessionState()
        msgs, state = read_new_jsonl(p, state)
        assert msgs == [{"a": 1}]

        with open(p, "a") as f:
            f.write(json.dumps({"b": 2}) + "\n")
        msgs, state = read_new_jsonl(p, state)
        assert msgs == [{"b": 2}]

    def test_partial_line_buffered(self, tmp_path):
        p = tmp_path / "t.jsonl"
        p.write_text('{"a": 1}\n{"b":')
        state = SessionState()
        msgs, state = read_new_jsonl(p, state)
        assert msgs == [{"a": 1}]
        assert state.buffer == '{"b":'

        with open(p, "a") as f:
            f.write(' 2}\n')
        msgs, state = read_new_jsonl(p, state)
        assert msgs == [{"b": 2}]

    def test_shrunk_file_restarts(self, tmp_path):
        p = tmp_path / "t.jsonl"
        p.write_text('{"a": 1}\n{"b": 2}\n')
        state = SessionState()
        _, state = read_new_jsonl(p, state)

        p.write_text('{"c": 3}\n')
        msgs, state = read_new_jsonl(p, state)
        assert msgs == [{"c": 3}]
