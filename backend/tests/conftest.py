import os
import tempfile

os.environ.setdefault("KRIMSON_DATA_DIR", tempfile.mkdtemp(prefix="krimson-test-"))
