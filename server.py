#!/usr/bin/env python3
"""
Simple HTTP server with cache control headers.
Disables caching for JS/CSS files to ensure fresh code loads during development.
Usage: python3 server.py [port]
"""

import http.server
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Add cache control headers based on file type
        if self.path.endswith(('.js', '.css', '.json')):
            # Disable caching for code and config files
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
        else:
            # Allow caching for static assets
            self.send_header('Cache-Control', 'public, max-age=3600')
        
        super().end_headers()
    
    def log_message(self, format, *args):
        # Standard logging
        super().log_message(format, *args)

class ThreadingNoCacheServer(http.server.ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

if __name__ == '__main__':
    with ThreadingNoCacheServer(("", PORT), NoCacheHandler) as httpd:
        print(f"Server running at http://localhost:{PORT}/")
        print(f"Cache disabled for: .js, .css, .json files")
        print("Press Ctrl+C to stop")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped")
