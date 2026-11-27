"""Drive the production Rust detection loop with the live configured model."""
import json
import os
import subprocess
from pathlib import Path

logs = Path('/logs/agent')
logs.mkdir(parents=True, exist_ok=True)
env = dict(os.environ)
env.update({
    'LLM_PROVIDER': 'azure_chat_completions',
    'LLM_MODEL_MEDIUM': 'gpt-5.6-terra',
    'LLM_API_KEY': os.environ['AZURE_OPENAI_API_KEY'],
    'AZURE_BASE_URL': os.environ['AZURE_OPENAI_ENDPOINT'],
    'DETECTION_EVAL_CASE': '/case/case.json',
    'DETECTION_EVAL_RESULT': str(logs / 'changes.json'),
    'DETECTION_EVAL_TOOL_LOG': str(logs / 'tool_calls.jsonl'),
})
try:
    execution = subprocess.run(
        ['/opt/agent/detection-replay', 'harbor_replay_detection_case', '--nocapture'],
        env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=500,
    )
    (logs / 'rust.log').write_text(execution.stdout)
    status = 'ok' if execution.returncode == 0 else 'failed'
except subprocess.TimeoutExpired as exc:
    (logs / 'rust.log').write_text(str(exc))
    status = 'timeout'

calls = [json.loads(line) for line in (logs / 'tool_calls.jsonl').read_text().splitlines()] if (logs / 'tool_calls.jsonl').exists() else []
changes = json.loads((logs / 'changes.json').read_text()) if (logs / 'changes.json').exists() else {}
result = {'status': status, 'tool_calls': calls, 'changes': changes.get('changes', [])}
(logs / 'result.json').write_text(json.dumps(result, indent=2))
print(json.dumps({'status': status, 'tool_calls': len(calls), 'changes': result['changes'], 'submit_responses': [c['response'] for c in calls if c['name'] == 'submit']}))
