/*
 * CS2 Analyst extension (S26): on a FACEIT match room, a fixed "Analyze in
 * CS2 Analyst" button that opens the match in the app (selected in the
 * FACEIT picker, or its report when already analysed). It only opens a tab:
 * no download starts until the player clicks "Analyze selected" in the app.
 * FACEIT is a single-page app, so the address is re-checked on navigation.
 */
(function () {
  "use strict";
  // chrome.* with callbacks works in Chrome and Firefox (Firefox's browser.* takes promises only).
  var api = chrome;
  var BUTTON_ID = "cs2a-analyze-button";
  var lastHref = "";

  function message(key, fallback) {
    try {
      return api.i18n.getMessage(key) || fallback;
    } catch {
      return fallback;
    }
  }

  function readAppUrl(callback) {
    try {
      api.storage.sync.get({ appUrl: CS2A.DEFAULT_APP_URL }, function (items) {
        callback((items && items.appUrl) || CS2A.DEFAULT_APP_URL);
      });
    } catch {
      callback(CS2A.DEFAULT_APP_URL);
    }
  }

  function removeButton() {
    var el = document.getElementById(BUTTON_ID);
    if (el) el.remove();
  }

  function showButton(matchId) {
    var el = document.getElementById(BUTTON_ID);
    if (!el) {
      el = document.createElement("button");
      el.id = BUTTON_ID;
      el.type = "button";
      var icon = document.createElement("img");
      icon.src = api.runtime.getURL("icons/icon-32.png");
      icon.alt = "";
      icon.width = 20;
      icon.height = 20;
      var label = document.createElement("span");
      label.textContent = message("analyzeButton", "Analizuj w CS2 Analyst");
      el.appendChild(icon);
      el.appendChild(label);
      el.title = message("analyzeTitle", "");
      el.addEventListener("click", function () {
        var id = el.getAttribute("data-match-id");
        if (!id) return;
        readAppUrl(function (appUrl) {
          window.open(CS2A.analyzeUrl(appUrl, id), "_blank", "noopener");
        });
      });
      document.body.appendChild(el);
    }
    el.setAttribute("data-match-id", matchId);
  }

  function check() {
    if (location.href === lastHref && (document.getElementById(BUTTON_ID) || !CS2A.roomMatchId(location.href))) return;
    lastHref = location.href;
    var id = CS2A.roomMatchId(location.href);
    if (id) showButton(id);
    else removeButton();
  }

  check();
  // pushState navigation doesn't fire an event content scripts can hear.
  setInterval(check, 1000);
  window.addEventListener("popstate", check);
})();
