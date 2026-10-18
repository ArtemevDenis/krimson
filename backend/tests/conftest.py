import os
import tempfile

# Forced, not setdefault: tests must never touch the real data/ or the git-tracked models/
os.environ["KRIMSON_DATA_DIR"] = tempfile.mkdtemp(prefix="krimson-test-")
os.environ["KRIMSON_MODELS_DIR"] = tempfile.mkdtemp(prefix="krimson-models-")
