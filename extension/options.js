/* CS2 Analyst extension (S26): settings page — the app address the button opens. */
(function () {
  "use strict";
  // chrome.* with callbacks works in Chrome and Firefox (Firefox's browser.* takes promises only).
  var api = chrome;
  var input = document.getElementById("appUrl");
  var status = document.getElementById("status");
  var open = document.getElementById("open");

  document.documentElement.lang = api.i18n.getUILanguage().toLowerCase().indexOf("pl") === 0 ? "pl" : "en";
  document.querySelectorAll("[data-i18n]").forEach(function (el) {
    var text = api.i18n.getMessage(el.getAttribute("data-i18n"));
    if (text) el.textContent = text;
  });
  input.placeholder = CS2A.DEFAULT_APP_URL;

  function show(url) {
    input.value = url;
    open.href = url;
  }

  api.storage.sync.get({ appUrl: CS2A.DEFAULT_APP_URL }, function (items) {
    show((items && items.appUrl) || CS2A.DEFAULT_APP_URL);
  });

  document.getElementById("form").addEventListener("submit", function (e) {
    e.preventDefault();
    var url = CS2A.normalizeAppUrl(input.value);
    if (!url) {
      status.className = "error";
      status.textContent = api.i18n.getMessage("optionsInvalid");
      return;
    }
    api.storage.sync.set({ appUrl: url }, function () {
      show(url);
      status.className = "ok";
      status.textContent = api.i18n.getMessage("optionsSaved");
    });
  });
})();
