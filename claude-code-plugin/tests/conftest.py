import importlib.util
import sys
from pathlib import Path

HOOK_PATH = Path(__file__).parent.parent / "hooks" / "lmnr_hook.py"

spec = importlib.util.spec_from_file_location("lmnr_hook", HOOK_PATH)
lmnr_hook = importlib.util.module_from_spec(spec)
sys.modules["lmnr_hook"] = lmnr_hook
spec.loader.exec_module(lmnr_hook)
