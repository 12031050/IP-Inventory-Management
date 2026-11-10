#!/usr/bin/env python3
import sys
import os
from http.server import SimpleHTTPRequestHandler, HTTPServer

port = int(sys.argv[1]) if len(sys.argv) > 1 else 28090
web_dir = sys.argv[2] if len(sys.argv) > 2 else os.path.dirname(os.path.abspath(__file__)) + "/www"

class SPARequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=web_dir, **kwargs)

    def do_GET(self):
        path = self.path.split('?')[0]
        full_path = os.path.join(web_dir, path.lstrip('/'))
        if not os.path.exists(full_path) and not path.startswith('/assets/'):
            self.path = '/index.html'
        return super().do_GET()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

if __name__ == '__main__':
    server = HTTPServer(('0.0.0.0', port), SPARequestHandler)
    print(f"Server started on 0.0.0.0:{port} serving {web_dir}")
    server.serve_forever()
