/* TRUVA – Eigene XING-Stellenanzeigen deaktivieren
 * Läuft auf dem XING Jobmanager (onlyfy.io). Filtert auf den eingeloggten Berater,
 * fragt einmal nach und deaktiviert dann alle aktiven Anzeigen dieses Beraters.
 * Probelauf: window.__TRUVA_DRY = true setzen, dann wird nichts deaktiviert.
 */
(function () {
  'use strict';
  if (window.__truvaRunning) { alert('Das Skript läuft schon. Bitte kurz warten.'); return; }
  if (!/\.onlyfy\.io$/.test(location.hostname) || location.pathname.indexOf('/recruiter/xing-jobs') !== 0) {
    alert('Bitte zuerst den XING Jobmanager (Seite „Stellenanzeigen“) öffnen und dann nochmal klicken.');
    return;
  }
  window.__truvaRunning = true;
  var DRY = !!window.__TRUVA_DRY;
  var stopped = false;

  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var waitFor = async function (fn, t) {
    var s = Date.now(); t = t || 15000;
    while (Date.now() - s < t) { var v = fn(); if (v) return v; await sleep(200); }
    return null;
  };
  var vis = function (e) { return e && e.offsetParent !== null; };
  var byText = function (sel, re) {
    return Array.prototype.slice.call(document.querySelectorAll(sel)).filter(function (b) {
      return vis(b) && re.test((b.innerText || '').trim());
    }).sort(function (a, b) { return a.innerText.length - b.innerText.length; })[0];
  };
  var click = function (el) {
    var r = el.getBoundingClientRect();
    var o = { bubbles: true, cancelable: true, view: window, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true };
    ['pointerover', 'pointerenter', 'mouseover', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(function (t) {
      var C = t.indexOf('pointer') === 0 ? PointerEvent : MouseEvent;
      el.dispatchEvent(new C(t, o));
    });
  };
  var cards = function () { return Array.prototype.slice.call(document.querySelectorAll('button[aria-label="Item actions"]')).filter(vis); };
  var jobCount = function () { var m = document.body.innerText.match(/(\d+)\s+Jobs?\b/); return m ? parseInt(m[1], 10) : null; };

  /* Fortschrittsfenster */
  var box = document.createElement('div');
  box.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;background:#0b1f3a;color:#fff;padding:14px 16px;border-radius:10px;font:14px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.35);max-width:320px';
  var msg = document.createElement('div');
  var stopBtn = document.createElement('button');
  stopBtn.textContent = 'Stopp';
  stopBtn.style.cssText = 'margin-top:8px;padding:4px 12px;border:0;border-radius:6px;cursor:pointer';
  stopBtn.onclick = function () { stopped = true; say('Wird nach der aktuellen Anzeige gestoppt …'); };
  box.appendChild(msg); box.appendChild(stopBtn); document.body.appendChild(box);
  function say(t) { msg.textContent = t; }
  function finish(t, keep) {
    say(t); stopBtn.remove(); window.__truvaRunning = false;
    if (!keep) setTimeout(function () { box.remove(); }, 15000);
  }

  (async function () {
    try {
      /* 1. Auf Tab „Aktiv“ */
      if (location.pathname.indexOf('/list/active') === -1) {
        var tab = byText('a,button,[role=tab]', /^Aktiv\s*\d*$/);
        if (!tab) { finish('Bitte die Liste „Aktiv“ öffnen und nochmal klicken.', true); return; }
        click(tab); await sleep(1800);
      }
      await waitFor(function () { return cards().length > 0 || jobCount() === 0; }, 15000);

      /* 2. Filter auf „(Sie)“ */
      say('Filtere auf deine Anzeigen …');
      var input = Array.prototype.slice.call(document.querySelectorAll('input')).filter(function (i) { return vis(i) && /Recruiter/i.test(i.placeholder || ''); })[0];
      if (!input) { finish('Der Recruiter-Filter wurde nicht gefunden. Die Seite hat sich wohl geändert.', true); return; }
      if (!/userIds=[^&]+/.test(location.search)) {
        click(input); input.focus();
        var opt = await waitFor(function () {
          return Array.prototype.slice.call(document.querySelectorAll('label,li,[role=option],[role=menuitem],div')).filter(function (e) {
            return vis(e) && e.children.length < 4 && /^\(Sie\)/.test((e.innerText || '').trim());
          }).sort(function (a, b) { return a.innerText.length - b.innerText.length; })[0];
        }, 8000);
        if (!opt) { finish('Dein Name („(Sie)“) steht nicht im Filter. Abbruch, es wurde nichts verändert.', true); return; }
        click(opt);
        await waitFor(function () { return /userIds=[^&]+/.test(location.search); }, 8000);
        await sleep(1500);
        document.body.click();
      }
      if (!/userIds=[^&]+/.test(location.search)) { finish('Der Filter konnte nicht gesetzt werden. Abbruch, es wurde nichts verändert.', true); return; }
      if (/userIds=[^&]*,/.test(location.search) || /userIds=[^&]*%2C/i.test(location.search)) { finish('Es sind mehrere Berater gefiltert. Abbruch, es wurde nichts verändert.', true); return; }
      await waitFor(function () { return cards().length > 0 || jobCount() === 0; }, 10000);

      /* 3. Name und Anzahl */
      var n0 = jobCount();
      var firstCard = cards()[0];
      var card0 = firstCard; for (var k = 0; k < 8 && card0 && !/Erstellt von/.test(card0.innerText); k++) card0 = card0.parentElement;
      var who = card0 && (card0.innerText.match(/Erstellt von\s+([^\n]+)/) || [])[1];
      if (!n0 || !who) { finish(n0 === 0 ? 'Du hast keine aktiven Anzeigen.' : 'Anzeigen konnten nicht gelesen werden. Abbruch.', true); return; }
      who = who.trim();
      var ok = confirm((DRY ? '[PROBELAUF – es wird nichts deaktiviert]\n\n' : '') +
        n0 + ' aktive Anzeigen von ' + who + ' werden bei XING deaktiviert.\n\nWeitermachen?');
      if (!ok) { finish('Abgebrochen. Es wurde nichts verändert.'); return; }

      /* 4. Schleife */
      var done = 0, fails = 0, total = n0;
      while (!stopped) {
        var left = jobCount();
        if (left === 0 || !cards().length) break;
        if (DRY && done >= 2) break;
        var btn = cards()[0];
        var c = btn; for (var j = 0; j < 8 && c && !/Erstellt von/.test(c.innerText); j++) c = c.parentElement;
        var creator = c && (c.innerText.match(/Erstellt von\s+([^\n]+)/) || [])[1];
        if (!creator || creator.trim() !== who) { finish('Sicherheitsstopp: Eine Anzeige gehört nicht zu ' + who + '. ' + done + ' deaktiviert.', true); return; }
        say((DRY ? 'Probelauf: ' : '') + 'Deaktiviere ' + (done + 1) + ' von ' + total + ' …');
        click(btn);
        var item = await waitFor(function () { return byText('[role=menuitem],li,button,a,div', /^Deaktivieren$/); }, 6000);
        if (!item) { if (++fails > 3) { finish('Menü „Deaktivieren“ nicht gefunden. ' + done + ' deaktiviert.', true); return; } document.body.click(); await sleep(800); continue; }
        click(item);
        var confirmBtn = await waitFor(function () { return byText('button', /^Stellenanzeige deaktivieren$/); }, 6000);
        if (!confirmBtn) { if (++fails > 3) { finish('Bestätigungsfenster nicht gefunden. ' + done + ' deaktiviert.', true); return; } continue; }
        if (DRY) {
          var keep = byText('button', /^Stellenanzeige aktiv lassen$/); if (keep) click(keep);
          done++; await sleep(800); continue;
        }
        click(confirmBtn);
        var before = left;
        var changed = await waitFor(function () { var n = jobCount(); return n !== null && n < before; }, 15000);
        if (!changed) { if (++fails > 3) { finish('Die Liste hat sich nicht aktualisiert. ' + done + ' deaktiviert.', true); return; } continue; }
        fails = 0; done++; await sleep(600);
      }
      finish((stopped ? 'Gestoppt. ' : 'Fertig. ') + done + ' Anzeigen ' + (DRY ? 'im Probelauf durchgespielt (nichts deaktiviert).' : 'deaktiviert.'), true);
    } catch (e) {
      finish('Fehler: ' + e.message, true);
    }
  })();
})();
