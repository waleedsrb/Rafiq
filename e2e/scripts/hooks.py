"""A tiny local web server that lets a Maestro flow change the database mid-flow.

One emulator can only be one person at a time, so when a test needs "someone else does
something while I watch", the flow calls http://localhost:8787/hook/<name> (runScript,
scripts/hook.js) and this runs e2e/sql/hooks/<name>.sql as that other person.
Started and stopped by run.sh. Only names made of letters, digits and dashes are run.
"""

import os
import re
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
HOOKS = os.path.join(HERE, "..", "sql", "hooks")
DB_URL = os.environ.get("DB_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres")


class Hook(BaseHTTPRequestHandler):
    def do_POST(self):
        m = re.fullmatch(r"/hook/([a-z0-9-]+)", self.path)
        path = m and os.path.join(HOOKS, m.group(1) + ".sql")
        if not path or not os.path.exists(path):
            self.send_response(404)
            self.end_headers()
            return
        run = subprocess.run(
            ["psql", DB_URL, "-v", "ON_ERROR_STOP=1", "-q", "-f", path],
            capture_output=True,
            text=True,
        )
        sys.stderr.write(f"hook {m.group(1)}: {run.stdout}{run.stderr}\n")
        self.send_response(200 if run.returncode == 0 else 500)
        self.end_headers()
        self.wfile.write((run.stdout + run.stderr).encode())


if __name__ == "__main__":
    HTTPServer(("127.0.0.1", 8787), Hook).serve_forever()
