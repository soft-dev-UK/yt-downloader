/* ============================================================
   YT Downloader — フロントエンド JavaScript (Vercel版)
   サーバーレス: yt-dlpで取得した直接URLでダウンロード
   ============================================================ */

// Vercel にデプロイした場合は同じドメインの /api/ を使う
const API_BASE = "";

// ============================================================
// DOM要素
// ============================================================
const steps = {
  input:    document.getElementById("step-input"),
  loading:  document.getElementById("step-loading"),
  info:     document.getElementById("step-info"),
  fetching: document.getElementById("step-fetching"),
  done:     document.getElementById("step-done"),
};

const urlInput    = document.getElementById("url-input");
const fetchBtn    = document.getElementById("fetch-btn");
const pasteBtn    = document.getElementById("paste-btn");
const backBtn     = document.getElementById("back-btn");
const downloadBtn = document.getElementById("download-btn");
const anotherBtn  = document.getElementById("another-btn");
const saveBtn     = document.getElementById("save-btn");

const thumbnailEl = document.getElementById("thumbnail");
const titleEl     = document.getElementById("video-title");
const uploaderEl  = document.getElementById("uploader-name");
const durationEl  = document.getElementById("video-duration");
const viewsEl     = document.getElementById("video-views");

const errorToast  = document.getElementById("error-toast");
const errorMsg    = document.getElementById("error-message");
const errorClose  = document.getElementById("error-close");

const formatToggle = document.getElementById("format-toggle");
const qualityGroup = document.getElementById("quality-group");

// ============================================================
// 状態
// ============================================================
let currentFormat  = "mp4";
let currentQuality = "best";
let currentUrl     = "";

// ============================================================
// ステップ切り替え
// ============================================================
function showStep(name) {
  Object.values(steps).forEach(el => {
    if (el) el.classList.add("hidden");
  });
  const el = steps[name];
  if (el) {
    el.classList.remove("hidden");
    el.style.animation = "none";
    el.offsetHeight; // reflow
    el.style.animation = "";
  }
  hideError();
}

// ============================================================
// エラー表示
// ============================================================
function showError(message) {
  errorMsg.textContent = message;
  errorToast.classList.remove("hidden");
}

function hideError() {
  errorToast.classList.add("hidden");
}

errorClose.addEventListener("click", hideError);

// ============================================================
// 時間フォーマット (秒 → mm:ss または hh:mm:ss)
// ============================================================
function formatDuration(seconds) {
  if (!seconds) return "-";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ============================================================
// 数値フォーマット（視聴数）
// ============================================================
function formatViews(n) {
  if (!n) return "-";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M 回視聴`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K 回視聴`;
  return `${n} 回視聴`;
}

// ============================================================
// ファイルサイズフォーマット
// ============================================================
function formatSize(bytes) {
  if (!bytes) return null;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
  return `${bytes} B`;
}

// ============================================================
// 動画情報を取得
// ============================================================
async function fetchVideoInfo(url) {
  currentUrl = url;
  showStep("loading");
  document.getElementById("loading-text").textContent = "動画情報を取得中...";

  try {
    const res  = await fetch(`${API_BASE}/api/info?url=${encodeURIComponent(url)}`);
    const data = await res.json();

    if (!res.ok || data.error) {
      throw new Error(data.error || "動画情報の取得に失敗しました");
    }

    thumbnailEl.src = data.thumbnail || "";
    thumbnailEl.onerror = () => { thumbnailEl.style.objectFit = "contain"; thumbnailEl.style.opacity = "0.3"; };

    titleEl.textContent    = data.title    || "タイトル不明";
    uploaderEl.textContent = data.uploader || "-";
    durationEl.textContent = formatDuration(data.duration);
    viewsEl.textContent    = formatViews(data.view_count);

    buildQualityButtons(data.formats || []);
    showStep("info");
  } catch (err) {
    showStep("input");
    showError(err.message || "エラーが発生しました");
  }
}

// ============================================================
// 画質ボタンを動的生成
// ============================================================
function buildQualityButtons(formats) {
  const list = document.getElementById("quality-list");
  list.innerHTML = "";

  const bestBtn = makeQualityBtn("最高画質 (推奨)", "best", true);
  list.appendChild(bestBtn);

  formats.forEach(f => {
    if (f.value === "best") return;
    const btn = makeQualityBtn(f.label, f.value, false);
    list.appendChild(btn);
  });

  currentQuality = "best";
}

function makeQualityBtn(label, value, active) {
  const btn = document.createElement("button");
  btn.className = "quality-btn" + (active ? " active" : "");
  btn.dataset.value = value;
  btn.textContent = label;
  btn.addEventListener("click", () => {
    document.querySelectorAll(".quality-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentQuality = value;
  });
  return btn;
}

// ============================================================
// フォーマット切り替え
// ============================================================
formatToggle.addEventListener("click", (e) => {
  const btn = e.target.closest(".toggle-btn");
  if (!btn) return;
  document.querySelectorAll(".toggle-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  currentFormat = btn.dataset.value;
  qualityGroup.style.display = (currentFormat === "mp3") ? "none" : "";
});

// ============================================================
// ダウンロードURL取得
// ============================================================
async function getDownloadUrl() {
  showStep("fetching");

  try {
    const params = new URLSearchParams({
      url: currentUrl,
      quality: currentQuality,
      format: currentFormat,
    });
    const res  = await fetch(`${API_BASE}/api/dl?${params}`);
    const data = await res.json();

    if (!res.ok || data.error) {
      throw new Error(data.error || "URLの取得に失敗しました");
    }

    // 完了画面に遷移
    showStep("done");

    // ファイルサイズ表示
    const sizeEl = document.getElementById("done-filesize");
    const sizeStr = formatSize(data.filesize);
    if (sizeEl) sizeEl.textContent = sizeStr ? `ファイルサイズ: ${sizeStr}` : "";

    // ファイル名表示
    const filenameEl = document.getElementById("done-filename");
    if (filenameEl) filenameEl.textContent = data.filename || "";

    // ダウンロードボタンのリンクを設定
    saveBtn.href = data.url;
    saveBtn.setAttribute("data-filename", data.filename || "video");

    // 自動でダウンロードを開始（新しいタブで開く）
    triggerDownload(data.url, data.filename);

  } catch (err) {
    showStep("info");
    showError(err.message || "エラーが発生しました");
  }
}

// ============================================================
// ダウンロードをトリガー
// ============================================================
function triggerDownload(url, filename) {
  // 新しいタブで開く（ブラウザが自動でダウンロードを開始することが多い）
  window.open(url, "_blank", "noopener,noreferrer");
}

// ============================================================
// イベントリスナー
// ============================================================

// 検索ボタン
fetchBtn.addEventListener("click", () => {
  const url = urlInput.value.trim();
  if (!url) {
    urlInput.focus();
    showError("YouTubeのURLを入力してください");
    return;
  }
  hideError();
  fetchVideoInfo(url);
});

// Enterキー
urlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") fetchBtn.click();
});

// クリップボードから貼り付け
pasteBtn.addEventListener("click", async () => {
  try {
    const text = await navigator.clipboard.readText();
    urlInput.value = text;
    pasteBtn.style.color = "#ff8099";
    setTimeout(() => { pasteBtn.style.color = ""; }, 800);
  } catch (_) {
    showError("クリップボードへのアクセス権限がありません");
  }
});

// 戻るボタン
backBtn.addEventListener("click", () => {
  showStep("input");
});

// ダウンロード開始
downloadBtn.addEventListener("click", getDownloadUrl);

// 別の動画をダウンロード
anotherBtn.addEventListener("click", () => {
  urlInput.value = "";
  currentFormat  = "mp4";
  currentQuality = "best";
  currentUrl     = "";
  document.querySelectorAll(".toggle-btn").forEach((b, i) => b.classList.toggle("active", i === 0));
  qualityGroup.style.display = "";
  showStep("input");
});

// 貼り付け時の強調表示
urlInput.addEventListener("paste", () => {
  setTimeout(() => {
    const val = urlInput.value.trim();
    const wrapper = document.getElementById("input-wrapper");
    if (/youtube\.com|youtu\.be/.test(val)) {
      wrapper.style.borderColor = "rgba(255,78,106,0.5)";
    } else {
      wrapper.style.borderColor = "";
    }
  }, 50);
});

// ============================================================
// 起動時
// ============================================================
showStep("input");
urlInput.focus();
