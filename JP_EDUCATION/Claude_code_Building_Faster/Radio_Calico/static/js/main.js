const STREAM_URL  = "https://d3d4yli4hf5bmh.cloudfront.net/hls/live.m3u8";
const POLL_MS     = 5000;

const audio              = document.getElementById("radioAudio");
const artworkPlaceholder = document.getElementById("artworkPlaceholder");
const artworkImg         = document.getElementById("artworkImg");
const trackArtist        = document.getElementById("trackArtist");
const trackTitle         = document.getElementById("trackTitle");
const trackAlbum         = document.getElementById("trackAlbum");
const timeElapsed        = document.getElementById("timeElapsed");
const timeRemaining      = document.getElementById("timeRemaining");
const progressFill       = document.getElementById("progressFill");
const historySection     = document.getElementById("historySection");
const historyList        = document.getElementById("historyList");
const playBtn    = document.getElementById("playBtn");
const iconPlay   = playBtn.querySelector(".icon-play");
const iconPause  = playBtn.querySelector(".icon-pause");
const volumeSlider = document.getElementById("volumeSlider");
const statusText = document.getElementById("statusText");
const streamQuality = document.getElementById("streamQuality");
const errorMsg   = document.getElementById("errorMsg");

let hls = null;
let playing = false;
let stopping = false;
let pollTimer  = null;
let clockTimer = null;

// Timing state synced from server
let _elapsed   = 0;    // seconds, as of last poll
let _duration  = null;
let _pollAt    = 0;    // performance.now() when last poll completed
let _lastTitle = null; // track change detection for cover cache-bust

function setStatus(msg) {
    statusText.textContent = msg;
}

function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.style.display = "block";
}

function clearError() {
    errorMsg.style.display = "none";
    errorMsg.textContent = "";
}

function setPlayingUI(isPlaying) {
    playing = isPlaying;
    iconPlay.style.display  = isPlaying ? "none"  : "block";
    iconPause.style.display = isPlaying ? "block" : "none";
    playBtn.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
}

function fmt(sec) {
    if (sec == null || sec < 0) return "—";
    const m = Math.floor(sec / 60);
    const s = String(Math.floor(sec % 60)).padStart(2, "0");
    return `${m}:${s}`;
}

function tickClock() {
    const sinceLastPoll = (performance.now() - _pollAt) / 1000;
    const current = _elapsed + sinceLastPoll;
    timeElapsed.textContent = fmt(current);

    if (_duration) {
        const rem = Math.max(0, _duration - current);
        timeRemaining.textContent = "-" + fmt(rem);
        progressFill.style.width = Math.min(100, (current / _duration) * 100) + "%";
    } else {
        timeRemaining.textContent = "—";
        progressFill.style.width = "0%";
    }
}

async function fetchNowPlaying() {
    try {
        const res  = await fetch("/api/nowplaying?_=" + Date.now(), { cache: "no-store" });
        const data = await res.json();

        if (data.artist) trackArtist.textContent = data.artist;
        if (data.title)  trackTitle.textContent  = data.title;
        if (data.album)  trackAlbum.textContent  = data.album;

        if (data.cover) {
            const trackChanged = data.title !== _lastTitle;
            // Bust the browser cache when the track changes — the cover URL
            // is always the same path even though the image content has changed.
            artworkImg.src = trackChanged
                ? data.cover + "?t=" + data.elapsed
                : artworkImg.src || data.cover;
            artworkImg.style.display = "block";
            artworkPlaceholder.style.display = "none";
        }

        _lastTitle = data.title;

        if (Array.isArray(data.history)) {
            renderHistory(data.history);
        }

        if (data.elapsed != null) {
            _elapsed  = data.elapsed;
            _duration = data.duration;
            _pollAt   = performance.now();
            tickClock();
        }
    } catch (_) {
        // silently ignore — keep showing previous info
    }
}

function renderHistory(tracks) {
    if (!tracks.length) {
        historySection.style.display = "none";
        return;
    }
    historySection.style.display = "block";
    historyList.innerHTML = tracks.map(t => `
        <li class="history-item">
            <img class="history-thumb" src="${t.cover || ""}" alt="">
            <div class="history-meta">
                <span class="history-artist">${t.artist || ""}</span>
                <span class="history-title">${t.title || ""}</span>
                <span class="history-album">${t.album || ""}</span>
            </div>
        </li>
    `).join("");
}

function startPolling() {
    fetchNowPlaying();
    pollTimer  = setInterval(fetchNowPlaying, POLL_MS);
    clockTimer = setInterval(tickClock, 1000);
}

function stopPolling() {
    clearInterval(pollTimer);
    clearInterval(clockTimer);
    pollTimer  = null;
    clockTimer = null;
    timeElapsed.textContent   = "0:00";
    timeRemaining.textContent = "—";
    progressFill.style.width  = "0%";
}

function initHls() {
    if (Hls.isSupported()) {
        hls = new Hls({
            lowLatencyMode: true,
            enableWorker: true,
        });

        hls.loadSource(STREAM_URL);
        hls.attachMedia(audio);

        hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
            const level = data.levels[hls.currentLevel] || data.levels[0];
            if (level && level.bitrate) {
                streamQuality.textContent = `${Math.round(level.bitrate / 1000)} kbps`;
            } else {
                streamQuality.textContent = "HLS ready";
            }
            clearError();
            audio.play().then(() => {
                setPlayingUI(true);
                setStatus("Playing");
            }).catch(() => {
                setStatus("Ready — press play");
            });
        });

        hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
            const level = hls.levels[data.level];
            if (level && level.bitrate) {
                streamQuality.textContent = `${Math.round(level.bitrate / 1000)} kbps`;
            }
        });

        hls.on(Hls.Events.ERROR, (_, data) => {
            if (stopping || !data.fatal) return;
            if (data.fatal) {
                switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                        showError("Network error — retrying…");
                        hls.startLoad();
                        break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                        showError("Media error — recovering…");
                        hls.recoverMediaError();
                        break;
                    default:
                        showError("Stream error. Please refresh.");
                        setPlayingUI(false);
                        setStatus("Error");
                        hls.destroy();
                        break;
                }
            }
        });

    } else if (audio.canPlayType("application/vnd.apple.mpegurl")) {
        // Native HLS (Safari)
        audio.src = STREAM_URL;
        audio.addEventListener("loadedmetadata", () => {
            streamQuality.textContent = "Native HLS";
            clearError();
            audio.play().then(() => {
                setPlayingUI(true);
                setStatus("Playing");
            }).catch(() => {
                setStatus("Ready — press play");
            });
        });
    } else {
        showError("Your browser does not support HLS streaming.");
    }
}

function startStream() {
    clearError();
    setStatus("Connecting…");
    streamQuality.textContent = "Connecting…";
    startPolling();
    initHls();
}

function stopStream() {
    stopping = true;
    clearError();
    stopPolling();
    if (hls) {
        hls.destroy();
        hls = null;
    }
    audio.pause();
    setPlayingUI(false);
    setStatus("Stopped");
    streamQuality.textContent = "—";
    stopping = false;
}

playBtn.addEventListener("click", () => {
    if (!playing) {
        startStream();
    } else {
        stopStream();
    }
});

volumeSlider.addEventListener("input", () => {
    audio.volume = parseFloat(volumeSlider.value);
});

// Load history immediately on page open
fetch("/api/history").then(r => r.json()).then(renderHistory).catch(() => {});

audio.addEventListener("waiting",  () => setStatus("Buffering…"));
audio.addEventListener("playing",  () => { setStatus("Playing"); setPlayingUI(true); });
audio.addEventListener("pause",    () => { if (!playing) setStatus("Paused"); });
audio.addEventListener("error",    () => { if (!stopping) showError("Audio element error. Please refresh."); });
