function escHtml(s) {
    return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function getVisitorId() {
    let id = localStorage.getItem("rc_visitor_id");
    if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem("rc_visitor_id", id);
    }
    return id;
}

function getVotes() {
    try { return JSON.parse(localStorage.getItem("rc_votes") || "{}"); }
    catch { return {}; }
}

function saveVote(songKey, direction) {
    const v = getVotes();
    v[songKey] = direction;
    localStorage.setItem("rc_votes", JSON.stringify(v));
}

// Accepts a DOM-element bundle so the function is testable without globals
function renderRatingsUI(elements, songKey, thumbsUp, thumbsDown) {
    const { ratingRow, ratingPrompt, ratingButtons, thumbsUpBtn, thumbsDownBtn, thumbsUpCount, thumbsDownCount } = elements;
    if (!songKey) { ratingRow.style.display = "none"; return; }

    ratingRow.style.display = "flex";
    thumbsUpCount.textContent   = thumbsUp;
    thumbsDownCount.textContent = thumbsDown;

    const prior = getVotes()[songKey];
    if (prior) {
        ratingPrompt.style.display   = "none";
        ratingButtons.style.display  = "flex";
        thumbsUpBtn.classList.toggle("voted-up",    prior === "up");
        thumbsDownBtn.classList.toggle("voted-down", prior === "down");
    } else {
        ratingPrompt.style.display   = "block";
        ratingButtons.style.display  = "none";
        thumbsUpBtn.classList.remove("voted-up");
        thumbsDownBtn.classList.remove("voted-down");
    }
}

async function submitRatingToServer(countEls, songKey, visitorId, renderFn, isThumbsUp) {
    if (!songKey) return;
    const { thumbsUpCount, thumbsDownCount } = countEls;
    const direction = isThumbsUp ? "up" : "down";
    const prior = getVotes()[songKey];
    if (prior === direction) return;

    const origUp   = parseInt(thumbsUpCount.textContent);
    const origDown = parseInt(thumbsDownCount.textContent);
    let up   = origUp;
    let down = origDown;
    if (prior === "up")   up--;
    if (prior === "down") down--;
    if (isThumbsUp) up++; else down++;

    saveVote(songKey, direction);
    renderFn(songKey, up, down);

    try {
        const res  = await fetch("/api/rate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ song_key: songKey, visitor_id: visitorId, is_thumbs_up: isThumbsUp }),
        });
        const data = await res.json();
        if (data.thumbs_up != null) {
            thumbsUpCount.textContent   = data.thumbs_up;
            thumbsDownCount.textContent = data.thumbs_down;
        } else {
            // Server rejected — roll back localStorage and re-render original counts
            const votes = getVotes();
            if (prior) votes[songKey] = prior; else delete votes[songKey];
            localStorage.setItem("rc_votes", JSON.stringify(votes));
            renderFn(songKey, origUp, origDown);
        }
    } catch (_) {
        // Keep optimistic state on network failure; next poll will reconcile
    }
}

if (typeof module !== "undefined") {
    module.exports = { escHtml, getVisitorId, getVotes, saveVote, renderRatingsUI, submitRatingToServer };
}
