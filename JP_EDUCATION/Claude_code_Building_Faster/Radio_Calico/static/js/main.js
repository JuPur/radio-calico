const STREAM_URL  = "https://d3d4yli4hf5bmh.cloudfront.net/hls/live.m3u8";
const POLL_MS     = 5000;

// escHtml, getVisitorId, getVotes, saveVote, renderRatingsUI, submitRatingToServer
// are loaded from ratingUtils.js (script tag before this file)
const VISITOR_ID = getVisitorId();

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
const ratingRow          = document.getElementById("ratingRow");
const ratingPrompt       = document.getElementById("ratingPrompt");
const ratingPromptBtn    = document.getElementById("ratingPromptBtn");
const ratingButtons      = document.getElementById("ratingButtons");
const thumbsUpBtn        = document.getElementById("thumbsUpBtn");
const thumbsDownBtn      = document.getElementById("thumbsDownBtn");
const thumbsUpCount      = document.getElementById("thumbsUpCount");
const thumbsDownCount    = document.getElementById("thumbsDownCount");
const playBtn    = document.getElementById("playBtn");
const iconPlay   = playBtn.querySelector(".icon-play");
const iconPause  = playBtn.querySelector(".icon-pause");
const btnLabel   = playBtn.querySelector(".btn-label");
const volumeSlider = document.getElementById("volumeSlider");
const volumePct  = document.getElementById("volumePct");
const statusText = document.getElementById("statusText");
const streamQuality = document.getElementById("streamQuality");
const errorMsg   = document.getElementById("errorMsg");

let hls = null;
let playing = false;
let stopping = false;
let clockTimer = null;

// Timing state synced from server
let _elapsed   = 0;
let _duration  = null;
let _pollAt    = 0;
let _lastTitle = null;
let _songKey   = null;

function renderRatings(songKey, thumbsUp, thumbsDown) {
    renderRatingsUI(
        { ratingRow, ratingPrompt, ratingButtons, thumbsUpBtn, thumbsDownBtn, thumbsUpCount, thumbsDownCount },
        songKey, thumbsUp, thumbsDown
    );
}

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
    btnLabel.textContent    = isPlaying ? "Stop"  : "Listen Now";
    playBtn.setAttribute("aria-label", isPlaying ? "Stop" : "Play");
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
            const trackChanged = data.song_key !== _songKey;
            artworkImg.src = trackChanged ? data.cover : artworkImg.src || data.cover;
            artworkImg.style.display = "block";
            artworkPlaceholder.style.display = "none";
        }

        _lastTitle = data.title;
        _songKey   = data.song_key || null;
        renderRatings(_songKey, data.thumbs_up ?? 0, data.thumbs_down ?? 0);

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
            <img class="history-thumb" src="${escHtml(t.cover)}" alt="">
            <div class="history-meta">
                <span class="history-artist">${escHtml(t.artist)}</span>
                <span class="history-title">${escHtml(t.title)}</span>
                <span class="history-album">${escHtml(t.album)}</span>
            </div>
        </li>
    `).join("");
}

function startPolling() {
    clockTimer = setInterval(tickClock, 1000);
}

function stopPolling() {
    clearInterval(clockTimer);
    clockTimer = null;
    timeElapsed.textContent   = "0:00";
    timeRemaining.textContent = "—";
    progressFill.style.width  = "0%";
}

function startAudio() {
    audio.play().then(() => {
        setPlayingUI(true);
        setStatus("Playing");
    }).catch(() => {
        setStatus("Ready — press play");
    });
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
            startAudio();
        });

        hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
            const level = hls.levels[data.level];
            if (level && level.bitrate) {
                streamQuality.textContent = `${Math.round(level.bitrate / 1000)} kbps`;
            }
        });

        hls.on(Hls.Events.ERROR, (_, data) => {
            if (stopping || !data.fatal) return;
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
        });

    } else if (audio.canPlayType("application/vnd.apple.mpegurl")) {
        // Native HLS (Safari)
        audio.src = STREAM_URL;
        audio.addEventListener("loadedmetadata", () => {
            streamQuality.textContent = "Native HLS";
            clearError();
            startAudio();
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
    volumePct.textContent = Math.round(volumeSlider.value * 100) + "%";
});

async function submitRating(isThumbsUp) {
    await submitRatingToServer(
        { thumbsUpCount, thumbsDownCount },
        _songKey, VISITOR_ID,
        renderRatings,
        isThumbsUp
    );
}

ratingPromptBtn.addEventListener("click", () => {
    ratingPrompt.style.display  = "none";
    ratingButtons.style.display = "flex";
});

thumbsUpBtn.addEventListener("click",   () => submitRating(true));
thumbsDownBtn.addEventListener("click", () => submitRating(false));

// Poll metadata immediately on load — show track info before user presses Play
fetchNowPlaying();
setInterval(fetchNowPlaying, POLL_MS);

audio.addEventListener("waiting",  () => setStatus("Buffering…"));
audio.addEventListener("playing",  () => { setStatus("Playing"); setPlayingUI(true); });
audio.addEventListener("pause",    () => { if (!playing) setStatus("Paused"); });
audio.addEventListener("error",    () => { if (!stopping) showError("Audio element error. Please refresh."); });
