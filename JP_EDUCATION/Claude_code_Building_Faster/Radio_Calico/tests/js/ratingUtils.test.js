const {
    escHtml,
    getVisitorId,
    getVotes,
    saveVote,
    renderRatingsUI,
    submitRatingToServer,
} = require("../../static/js/ratingUtils");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeElements() {
    // Create minimal DOM elements needed by renderRatingsUI / submitRatingToServer
    const mk = (tag = "div") => document.createElement(tag);
    const els = {
        ratingRow:      mk(),
        ratingPrompt:   mk(),
        ratingButtons:  mk(),
        thumbsUpBtn:    mk("button"),
        thumbsDownBtn:  mk("button"),
        thumbsUpCount:  mk("span"),
        thumbsDownCount: mk("span"),
    };
    els.thumbsUpCount.textContent   = "0";
    els.thumbsDownCount.textContent = "0";
    return els;
}

beforeEach(() => {
    localStorage.clear();
    // Provide a deterministic UUID so tests don't depend on crypto
    Object.defineProperty(global, "crypto", {
        value: { randomUUID: jest.fn(() => "test-uuid-aaaa-bbbb-cccc-dddddddddddd") },
        writable: true,
        configurable: true,
    });
});

afterEach(() => {
    jest.resetAllMocks();
});

// ---------------------------------------------------------------------------
// escHtml
// ---------------------------------------------------------------------------

describe("escHtml", () => {
    test("escapes &", () => expect(escHtml("a & b")).toBe("a &amp; b"));
    test("escapes <", () => expect(escHtml("<b>")).toBe("&lt;b&gt;"));
    test("escapes >", () => expect(escHtml("a > b")).toBe("a &gt; b"));
    test('escapes "', () => expect(escHtml('"hi"')).toBe("&quot;hi&quot;"));
    test("handles null",      () => expect(escHtml(null)).toBe(""));
    test("handles undefined", () => expect(escHtml(undefined)).toBe(""));
    test("passes plain text unchanged", () => expect(escHtml("hello")).toBe("hello"));
});

// ---------------------------------------------------------------------------
// getVisitorId
// ---------------------------------------------------------------------------

describe("getVisitorId", () => {
    test("creates a UUID on first call", () => {
        expect(getVisitorId()).toBe("test-uuid-aaaa-bbbb-cccc-dddddddddddd");
    });

    test("persists UUID to localStorage", () => {
        getVisitorId();
        expect(localStorage.getItem("rc_visitor_id")).toBe("test-uuid-aaaa-bbbb-cccc-dddddddddddd");
    });

    test("returns the same UUID on repeated calls", () => {
        const id1 = getVisitorId();
        const id2 = getVisitorId();
        expect(id1).toBe(id2);
    });

    test("reads an existing UUID from localStorage without generating a new one", () => {
        localStorage.setItem("rc_visitor_id", "already-stored-id");
        expect(getVisitorId()).toBe("already-stored-id");
        expect(crypto.randomUUID).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// getVotes / saveVote
// ---------------------------------------------------------------------------

describe("getVotes", () => {
    test("returns {} when nothing is stored", () => {
        expect(getVotes()).toEqual({});
    });

    test("returns stored votes", () => {
        localStorage.setItem("rc_votes", JSON.stringify({ "song||artist": "up" }));
        expect(getVotes()).toEqual({ "song||artist": "up" });
    });

    test("returns {} on malformed JSON", () => {
        localStorage.setItem("rc_votes", "not-json{{");
        expect(getVotes()).toEqual({});
    });
});

describe("saveVote", () => {
    test("writes a vote to localStorage", () => {
        saveVote("song||artist", "up");
        expect(JSON.parse(localStorage.getItem("rc_votes"))).toEqual({ "song||artist": "up" });
    });

    test("merges without overwriting other songs", () => {
        localStorage.setItem("rc_votes", JSON.stringify({ "other||song": "down" }));
        saveVote("song||artist", "up");
        const votes = JSON.parse(localStorage.getItem("rc_votes"));
        expect(votes["other||song"]).toBe("down");
        expect(votes["song||artist"]).toBe("up");
    });

    test("overwrites the existing vote for the same song", () => {
        saveVote("song||artist", "up");
        saveVote("song||artist", "down");
        expect(getVotes()["song||artist"]).toBe("down");
    });
});

// ---------------------------------------------------------------------------
// renderRatingsUI
// ---------------------------------------------------------------------------

describe("renderRatingsUI", () => {
    let els;
    beforeEach(() => { els = makeElements(); });

    test("hides ratingRow when songKey is null", () => {
        renderRatingsUI(els, null, 0, 0);
        expect(els.ratingRow.style.display).toBe("none");
    });

    test("shows ratingRow as flex when songKey is provided", () => {
        renderRatingsUI(els, "song||artist", 3, 1);
        expect(els.ratingRow.style.display).toBe("flex");
    });

    test("updates up and down counts", () => {
        renderRatingsUI(els, "song||artist", 5, 2);
        expect(els.thumbsUpCount.textContent).toBe("5");
        expect(els.thumbsDownCount.textContent).toBe("2");
    });

    test("shows prompt and hides buttons when not yet voted", () => {
        renderRatingsUI(els, "song||artist", 0, 0);
        expect(els.ratingPrompt.style.display).toBe("block");
        expect(els.ratingButtons.style.display).toBe("none");
    });

    test("hides prompt and shows buttons after an upvote", () => {
        saveVote("song||artist", "up");
        renderRatingsUI(els, "song||artist", 1, 0);
        expect(els.ratingPrompt.style.display).toBe("none");
        expect(els.ratingButtons.style.display).toBe("flex");
    });

    test("adds voted-up class to thumbs-up button after upvote", () => {
        saveVote("song||artist", "up");
        renderRatingsUI(els, "song||artist", 1, 0);
        expect(els.thumbsUpBtn.classList.contains("voted-up")).toBe(true);
        expect(els.thumbsDownBtn.classList.contains("voted-down")).toBe(false);
    });

    test("adds voted-down class to thumbs-down button after downvote", () => {
        saveVote("song||artist", "down");
        renderRatingsUI(els, "song||artist", 0, 1);
        expect(els.thumbsUpBtn.classList.contains("voted-up")).toBe(false);
        expect(els.thumbsDownBtn.classList.contains("voted-down")).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// submitRatingToServer
// ---------------------------------------------------------------------------

describe("submitRatingToServer", () => {
    const SONG_KEY  = "song||artist";
    const VISITOR   = "12345678-1234-1234-1234-123456789012";
    let els, renderFn;

    beforeEach(() => {
        els = makeElements();
        els.thumbsUpCount.textContent   = "3";
        els.thumbsDownCount.textContent = "1";
        renderFn = jest.fn();
        global.fetch = jest.fn();
    });

    test("does nothing when songKey is null", async () => {
        await submitRatingToServer(els, null, VISITOR, renderFn, true);
        expect(fetch).not.toHaveBeenCalled();
    });

    test("does nothing when voting the same direction twice", async () => {
        saveVote(SONG_KEY, "up");
        await submitRatingToServer(els, SONG_KEY, VISITOR, renderFn, true);
        expect(fetch).not.toHaveBeenCalled();
    });

    test("calls renderFn optimistically before server responds", async () => {
        let resolveFetch;
        fetch.mockReturnValueOnce(new Promise(r => { resolveFetch = r; }));

        const promise = submitRatingToServer(els, SONG_KEY, VISITOR, renderFn, true);
        // renderFn should fire synchronously (before await fetch resolves)
        expect(renderFn).toHaveBeenCalledWith(SONG_KEY, 4, 1);

        resolveFetch({ json: () => Promise.resolve({ thumbs_up: 4, thumbs_down: 1 }) });
        await promise;
    });

    test("POSTs the correct body to /api/rate", async () => {
        fetch.mockResolvedValueOnce({ json: () => Promise.resolve({ thumbs_up: 4, thumbs_down: 1 }) });
        await submitRatingToServer(els, SONG_KEY, VISITOR, renderFn, true);
        expect(fetch).toHaveBeenCalledWith("/api/rate", expect.objectContaining({
            method: "POST",
            body: JSON.stringify({ song_key: SONG_KEY, visitor_id: VISITOR, is_thumbs_up: true }),
        }));
    });

    test("updates DOM counts from server response on success", async () => {
        fetch.mockResolvedValueOnce({ json: () => Promise.resolve({ thumbs_up: 7, thumbs_down: 2 }) });
        await submitRatingToServer(els, SONG_KEY, VISITOR, renderFn, true);
        expect(els.thumbsUpCount.textContent).toBe("7");
        expect(els.thumbsDownCount.textContent).toBe("2");
    });

    test("rolls back vote and re-renders original counts when server rejects", async () => {
        saveVote(SONG_KEY, "up");
        els.thumbsUpCount.textContent   = "1";
        els.thumbsDownCount.textContent = "0";
        // Server returns no thumbs_up field → rejection
        fetch.mockResolvedValueOnce({ json: () => Promise.resolve({ error: "invalid_request" }) });

        await submitRatingToServer(els, SONG_KEY, VISITOR, renderFn, false);

        expect(getVotes()[SONG_KEY]).toBe("up");  // reverted to previous vote
        // Last renderFn call should restore original counts
        const calls = renderFn.mock.calls;
        expect(calls[calls.length - 1]).toEqual([SONG_KEY, 1, 0]);
    });

    test("keeps optimistic state on network error", async () => {
        fetch.mockRejectedValueOnce(new Error("Network failure"));
        await submitRatingToServer(els, SONG_KEY, VISITOR, renderFn, true);
        expect(getVotes()[SONG_KEY]).toBe("up");  // optimistic vote kept
    });

    test("decrements prior vote count when flipping from up to down", async () => {
        saveVote(SONG_KEY, "up");
        els.thumbsUpCount.textContent   = "2";
        els.thumbsDownCount.textContent = "1";
        fetch.mockResolvedValueOnce({ json: () => Promise.resolve({ thumbs_up: 1, thumbs_down: 2 }) });

        await submitRatingToServer(els, SONG_KEY, VISITOR, renderFn, false);
        // Optimistic call: up goes from 2→1, down goes from 1→2
        expect(renderFn.mock.calls[0]).toEqual([SONG_KEY, 1, 2]);
    });
});
