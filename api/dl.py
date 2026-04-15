"""
Vercel Serverless Function: /api/dl
YouTube動画の直接ダウンロードURLを返す（ffmpeg不要のプリマージ済形式）
"""
import json
import re
import urllib.parse
from http.server import BaseHTTPRequestHandler


def _cors_headers(handler):
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")


def _build_format_selector(quality: str, fmt: str) -> str:
    """フォーマットセレクタを構築する（プリマージ済mp4のみ使用）"""
    if fmt == "mp3":
        # 音声のみ（m4a 優先）
        return "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio"

    # 映像+音声がすでに結合済みのmp4を選ぶ
    if quality == "best":
        return "best[ext=mp4]/best"
    return (
        f"best[height<={quality}][ext=mp4]"
        f"/best[height<={quality}]"
        f"/best[ext=mp4]/best"
    )


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        url = params.get("url", [None])[0]
        quality = params.get("quality", ["best"])[0]
        fmt = params.get("format", ["mp4"])[0]

        if not url:
            self._json({"error": "URLが必要です"}, 400)
            return

        try:
            import yt_dlp  # noqa: PLC0415

            format_selector = _build_format_selector(quality, fmt)

            ydl_opts = {
                "quiet": True,
                "no_warnings": True,
                "format": format_selector,
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

            # 直接URLを取得
            direct_url = info.get("url", "")
            title = info.get("title", "video")
            ext = info.get("ext", "mp4")
            filesize = info.get("filesize") or info.get("filesize_approx")

            # 取得できなかった場合はrequested_formatsを確認
            if not direct_url and info.get("requested_formats"):
                direct_url = info["requested_formats"][0].get("url", "")
                ext = info["requested_formats"][0].get("ext", ext)

            if not direct_url:
                self._json({"error": "直接URLを取得できませんでした"}, 500)
                return

            # ファイル名をクリーンにする
            safe_title = re.sub(r'[\\/*?:"<>|]', "", title)[:80].strip()
            filename = f"{safe_title}.{ext}"

            self._json({
                "url": direct_url,
                "filename": filename,
                "ext": ext,
                "filesize": filesize,
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
