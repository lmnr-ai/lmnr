"""Mechanical symptom: no submitted item was rejected for too few prompts.
Positive control must also yield an accepted update, preventing do-nothing passes.
"""
import json
from pathlib import Path

result = json.loads(Path('/logs/agent/result.json').read_text())
reference = next(p for p in (Path('/tests/expected.json'), Path('/case/tests/expected.json')) if p.exists())
expected = json.loads(reference.read_text())
submitted = [c for c in result['tool_calls'] if c['name'] == 'submit']
low_coverage = [r for c in submitted for r in c['response'].get('rejected', [])
                if 'at least 3 are needed' in r.get('reason', '')]
accepted = sum(c['response'].get('accepted', 0) for c in submitted)
# Controls must make an update; negatives should finish a real model run without
# submitting ineligible items. Probes alone are not considered a failure.
reward = int(result['status'] == 'ok' and not low_coverage
             and (accepted >= 1 if expected['require_accepted'] else accepted == 0))
Path('/logs/verifier').mkdir(exist_ok=True, parents=True)
Path('/logs/verifier/reward.txt').write_text(str(reward))
print(json.dumps({'reward': reward, 'status': result['status'], 'insufficient_prompt_rejections': len(low_coverage), 'accepted': accepted, 'submit_calls': len(submitted)}))
