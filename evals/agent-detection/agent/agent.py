from harbor.agents.installed.base import BaseInstalledAgent, with_prompt_template


class DetectionReplayAgent(BaseInstalledAgent):
    @staticmethod
    def name() -> str:
        return "production-detection-replay"

    async def install(self, environment):
        pass

    @with_prompt_template
    async def run(self, instruction, environment, context):
        result = await self.exec_as_agent(
            environment,
            command="python3 /opt/agent/run.py",
            cwd="/case",
            timeout_sec=540,
        )
        print(result.stdout)

    def populate_context_post_run(self, context):
        import json
        from pathlib import Path
        path = Path('/logs/agent/result.json')
        if path.exists():
            context['result'] = json.loads(path.read_text())
