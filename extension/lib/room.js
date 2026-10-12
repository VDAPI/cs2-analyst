/*
 * CS2 Analyst extension (S26): pure helpers shared by the content script and
 * the options page. Plain script (content scripts can't be ES modules); the
 * repo's test (`npm run test:integrations`) loads it in a sandbox.
 */
(function (root) {
  "use strict";

  var DEFAULT_APP_URL = "http://localhost:3000";
  // faceit.com/<lang>/cs2/room/1-<uuid>[/scoreboard|/…]
  var ROOM_PATH = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?cs2\/room\/(1-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i;

  /** FACEIT match id of a match room address, or null. */
  function roomMatchId(href) {
    var url;
    try {
      url = new URL(href);
    } catch {
      return null;
    }
    if (url.protocol !== "https:" || url.hostname !== "www.faceit.com") return null;
    var m = ROOM_PATH.exec(url.pathname);
    return m ? m[1].toLowerCase() : null;
  }

  /** The app address the player typed → "http(s)://host[:port][/path]" without a trailing slash, or null. */
  function normalizeAppUrl(input) {
    if (typeof input !== "string") return null;
    var text = input.trim();
    if (!text) return null;
    var url;
    try {
      url = new URL(text);
    } catch {
      return null;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    return (url.origin + url.pathname).replace(/\/+$/, "");
  }

  /** Where the button goes: the app's FACEIT room page, which selects the match (no download). */
  function analyzeUrl(appUrl, matchId) {
    var base = normalizeAppUrl(appUrl) || DEFAULT_APP_URL;
    return base + "/faceit/room/" + encodeURIComponent(matchId);
  }

  root.CS2A = { DEFAULT_APP_URL: DEFAULT_APP_URL, roomMatchId: roomMatchId, normalizeAppUrl: normalizeAppUrl, analyzeUrl: analyzeUrl };
})(typeof globalThis !== "undefined" ? globalThis : this);
