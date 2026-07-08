import json
from datetime import datetime, timezone
from pathlib import Path

from lmnr_hook import (
    LaminarConfig,
    OtlpSpanCollector,
    build_otlp_attributes,
    build_turns,
    emit_turn,
    new_span_id,
    new_trace_id,
)
from test_turn_assembly import assistant_row, tool_result_row, user_row


def make_collector():
    return OtlpSpanCollector(LaminarConfig(api_key="k", base_url="http://localhost:1", user_id=None))


def spans_by_name(collector):
    return {s["name"]: s for s in collector.spans}


def attr_map(span):
    out = {}
    for kv in span["attributes"]:
        v = kv["value"]
        out[kv["key"]] = next(iter(v.values()))
    return out


class TestOtlpFormat:
    def test_ids_are_valid_hex(self):
        assert len(new_trace_id()) == 32
        int(new_trace_id(), 16)
        assert len(new_span_id()) == 16
        int(new_span_id(), 16)

    def test_attribute_envelope(self):
        attrs = build_otlp_attributes({
            "s": "str",
            "i": 42,
            "f": 1.5,
            "b": True,
            "arr": ["a", "b"],
            "none": None,
        })
        by_key = {a["key"]: a["value"] for a in attrs}
        assert by_key["s"] == {"stringValue": "str"}
        assert by_key["i"] == {"intValue": "42"}
        assert by_key["f"] == {"doubleValue": 1.5}
        assert by_key["b"] == {"boolValue": True}
        assert by_key["arr"] == {"arrayValue": {"values": [{"stringValue": "a"}, {"stringValue": "b"}]}}
        assert "none" not in by_key


class TestEmitTurn:
    def _emit(self, rows, subagents=None):
        collector = make_collector()
        turns = build_turns(rows)
        assert len(turns) == 1
        emit_turn(
            collector,
            collector.config,
            "0123abcd-0000-4000-8000-000000000000",
            1,
            turns[0],
            Path("/tmp/session.jsonl"),
            subagent_transcripts_by_tool_use_id=subagents,
        )
        return collector

    def test_simple_turn_spans(self):
        collector = self._emit([
            user_row("hello"),
            assistant_row([{"type": "text", "text": "hi"}]),
        ])
        names = spans_by_name(collector)
        assert "Claude Code - Turn 1 (0123abcd)" in names
        assert "LLM Call 1" in names

        root = names["Claude Code - Turn 1 (0123abcd)"]
        root_attrs = attr_map(root)
        assert root["parentSpanId"] == ""
        assert root_attrs["lmnr.span.type"] == "DEFAULT"
        assert root_attrs["lmnr.association.properties.session_id"] == "0123abcd-0000-4000-8000-000000000000"
        assert json.loads(root_attrs["lmnr.span.input"]) == {"role": "user", "content": "hello"}
        assert json.loads(root_attrs["lmnr.span.output"]) == {"role": "assistant", "content": "hi"}

        llm = names["LLM Call 1"]
        llm_attrs = attr_map(llm)
        assert llm["parentSpanId"] == root["spanId"]
        assert llm["traceId"] == root["traceId"]
        assert llm_attrs["lmnr.span.type"] == "LLM"
        assert llm_attrs["gen_ai.request.model"] == "claude-opus-4-7"
        assert llm_attrs["gen_ai.usage.input_tokens"] == "10"
        assert llm_attrs["gen_ai.usage.output_tokens"] == "5"
        assert json.loads(llm_attrs["gen_ai.input.messages"]) == [{"role": "user", "content": "hello"}]
        out_msgs = json.loads(llm_attrs["gen_ai.output.messages"])
        assert out_msgs[0]["role"] == "assistant"
        assert out_msgs[0]["content"] == "hi"

    def test_tool_turn_spans(self):
        collector = self._emit([
            user_row("run ls"),
            assistant_row([
                {"type": "tool_use", "id": "tu_1", "name": "Bash", "input": {"command": "ls"}},
            ]),
            tool_result_row("tu_1", "file.txt"),
            assistant_row([{"type": "text", "text": "done"}], msg_id="m2", ts="2026-07-08T10:00:15.000Z"),
        ])
        names = spans_by_name(collector)
        assert set(names) == {"Claude Code - Turn 1 (0123abcd)", "LLM Call 1", "Bash", "LLM Call 2"}

        tool = names["Bash"]
        tool_attrs = attr_map(tool)
        assert tool_attrs["lmnr.span.type"] == "TOOL"
        assert json.loads(tool_attrs["lmnr.span.input"]) == {"command": "ls"}
        assert json.loads(tool_attrs["lmnr.span.output"]) == "file.txt"

        # second LLM call gets the tool result as input
        llm2_attrs = attr_map(names["LLM Call 2"])
        in_msgs = json.loads(llm2_attrs["gen_ai.input.messages"])
        assert in_msgs[0]["role"] == "tool"
        assert in_msgs[0]["tool_call_id"] == "tu_1"

        # first LLM call records the tool call in output
        llm1_attrs = attr_map(names["LLM Call 1"])
        out_msgs = json.loads(llm1_attrs["gen_ai.output.messages"])
        assert out_msgs[0]["tool_calls"][0]["name"] == "Bash"

    def test_timestamps_backdated_and_ordered(self):
        collector = self._emit([
            user_row("hello", ts="2026-07-08T10:00:00.000Z"),
            assistant_row([{"type": "text", "text": "hi"}], ts="2026-07-08T10:00:05.000Z"),
        ])
        names = spans_by_name(collector)
        root = names["Claude Code - Turn 1 (0123abcd)"]
        llm = names["LLM Call 1"]
        expected_start_ns = int(
            datetime(2026, 7, 8, 10, 0, 0, tzinfo=timezone.utc).timestamp() * 1_000_000_000
        )
        assert int(root["startTimeUnixNano"]) == expected_start_ns
        assert int(root["endTimeUnixNano"]) >= int(root["startTimeUnixNano"])
        assert int(llm["startTimeUnixNano"]) >= int(root["startTimeUnixNano"])
        assert int(llm["endTimeUnixNano"]) <= int(root["endTimeUnixNano"])

    def test_skill_tags(self):
        collector = self._emit([
            user_row("use a skill"),
            assistant_row([
                {"type": "tool_use", "id": "tu_s", "name": "Skill", "input": {"skill": "coding"}},
            ]),
            tool_result_row("tu_s", "ok"),
            assistant_row([{"type": "text", "text": "done"}], msg_id="m2"),
        ])
        root = spans_by_name(collector)["Claude Code - Turn 1 (0123abcd)"]
        root_attrs = attr_map(root)
        tag_values = [v["stringValue"] for v in root_attrs["lmnr.association.properties.tags"]["values"]]
        assert "claude-code" in tag_values
        assert "skill:coding" in tag_values

    def test_subagent_nested_under_tool_span(self, tmp_path):
        sub_jsonl = tmp_path / "agent-abc.jsonl"
        sub_rows = [
            user_row("subagent prompt", ts="2026-07-08T10:00:06.000Z"),
            assistant_row([{"type": "text", "text": "subagent answer"}], msg_id="sm1", ts="2026-07-08T10:00:08.000Z"),
        ]
        sub_jsonl.write_text("\n".join(json.dumps(r) for r in sub_rows) + "\n")

        subagents = {
            "tu_task": {
                "path": sub_jsonl,
                "agent_id": "abc",
                "agent_type": "Explore",
                "description": "find stuff",
            }
        }
        collector = self._emit(
            [
                user_row("delegate"),
                assistant_row([
                    {"type": "tool_use", "id": "tu_task", "name": "Task", "input": {"prompt": "go"}},
                ]),
                tool_result_row("tu_task", "task done", ts="2026-07-08T10:00:09.000Z"),
                assistant_row([{"type": "text", "text": "summary"}], msg_id="m2", ts="2026-07-08T10:00:10.000Z"),
            ],
            subagents=subagents,
        )
        names = spans_by_name(collector)
        assert "Subagent: find stuff" in names
        assert "Subagent LLM Call 1" in names

        tool_span = names["Task"]
        sub_span = names["Subagent: find stuff"]
        sub_llm = names["Subagent LLM Call 1"]
        assert sub_span["parentSpanId"] == tool_span["spanId"]
        assert sub_llm["parentSpanId"] == sub_span["spanId"]
        assert attr_map(sub_span)["claude_code.subagent.type"] == "Explore"

    def test_user_id_attached_when_configured(self):
        collector = OtlpSpanCollector(
            LaminarConfig(api_key="k", base_url="http://localhost:1", user_id="user-42")
        )
        turns = build_turns([
            user_row("hello"),
            assistant_row([{"type": "text", "text": "hi"}]),
        ])
        emit_turn(collector, collector.config, "sess", 1, turns[0], Path("/tmp/t.jsonl"))
        root = [s for s in collector.spans if s["parentSpanId"] == ""][0]
        assert attr_map(root)["lmnr.association.properties.user_id"] == "user-42"
