"""
Vercel Serverless Function: /api/info
YouTube動画のメタ情報を返す
"""
import json
import urllib.parse
from http.server import BaseHTTPRequestHandler


def _cors_headers(handler):
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")


def _extract_formats(formats_list):
    """利用可能な画質一覧を返す（ffmpeg不要のプリマージ済mp4のみ）"""
    heights = set()
    for fmt in formats_list:
        h = fmt.get("height")
        vcodec = fmt.get("vcodec", "none")
        acodec = fmt.get("acodec", "none")
        ext = fmt.get("ext", "")
        # プリマージ済（映像+音声が1ファイル）かつmp4
        if h and ext == "mp4" and vcodec != "none" and acodec != "none":
            heights.add(h)

    labels = {2160: "4K (2160p)", 1440: "1440p", 1080: "1080p (Full HD)",
              720: "720p (HD)", 480: "480p (SD)", 360: "360p", 240: "240p"}

    result = []
    seen = set()
    for h in sorted(heights, reverse=True):
        # 代表的な解像度に丸める
        bucket = None
        for threshold in [2160, 1440, 1080, 720, 480, 360, 240]:
            if h >= threshold:
                bucket = threshold
                break
        if bucket and bucket not in seen:
            seen.add(bucket)
            result.append({"label": labels.get(bucket, f"{bucket}p"), "value": str(bucket)})

    return result


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        url = params.get("url", [None])[0]

        if not url:
            self._json({"error": "URLが必要です"}, 400)
            return

        try:
            import yt_dlp  # noqa: PLC0415

            ydl_opts = {
                "quiet": True,
                "no_warnings": True,
                "nocheckcertificate": True,
                "socket_timeout": 20,
                "extractor_args": {
                    "youtube": {
                        "player_client": ["android", "web"]
                    }
                }
            }
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                info = ydl.sanitize_info(info)

            formats = _extract_formats(info.get("formats", []))
            # 画質が見つからない場合は「最高画質」のみ
            if not formats:
                formats = []

            self._json({
                "title": info.get("title", ""),
                "duration": info.get("duration", 0),
                "thumbnail": info.get("thumbnail", ""),
                "uploader": info.get("uploader", ""),
                "view_count": info.get("view_count", 0),
                "formats": formats,
            })

        except Exception as e:
            self._json({"error": str(e)[:600]}, 500)

    def do_OPTIONS(self):
        self.send_response(200)
        _cors_headers(self)
        self.end_headers()

    def _json(self, data, code=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        _cors_headers(self)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):  # noqa: A002
        pass
