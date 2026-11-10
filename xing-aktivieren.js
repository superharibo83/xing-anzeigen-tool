/* TRUVA – Eigene deaktivierte XING-Stellenanzeigen wieder online stellen
 * Läuft auf dem XING Jobmanager (onlyfy.io). Filtert auf den eingeloggten Berater,
 * nimmt jede inaktive Anzeige „Als Vorlage verwenden“ und veröffentlicht sie neu.
 * Anzeigen, die (gleicher Titel + Ort) schon aktiv sind, werden übersprungen.
 * Probelauf: window.__TRUVA_DRY = true setzen, dann wird nichts veröffentlicht.
 */
(function () {
  'use strict';
  var old = document.getElementById('truva-xing-box'); if (old) old.remove();

  var box = document.createElement('div');
  box.id = 'truva-xing-box';
  box.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;background:#0b1f3a;color:#fff;padding:14px 16px;border-radius:10px;font:14px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.35);max-width:340px';
  var msg = document.createElement('div');
  msg.textContent = 'TRUVA-Skript „Anzeigen wieder online stellen“ geladen …';
  var stopBtn = document.createElement('button');
  stopBtn.textContent = 'Stopp';
  stopBtn.style.cssText = 'margin:8px 8px 0 0;padding:4px 12px;border:0;border-radius:6px;cursor:pointer';
  var closeBtn = document.createElement('button');
  closeBtn.textContent = 'Schließen';
  closeBtn.style.cssText = 'margin-top:8px;padding:4px 12px;border:0;border-radius:6px;cursor:pointer';
  closeBtn.onclick = function () { box.remove(); };
  box.appendChild(msg); box.appendChild(stopBtn); box.appendChild(closeBtn);
  document.body.appendChild(box);
  function say(t) { msg.textContent = t; }

  if (window.__truvaRunning) { say('Das Skript läuft schon. Bitte kurz warten.'); stopBtn.remove(); return; }
  if (!/\.onlyfy\.io$/.test(location.hostname) || location.pathname.indexOf('/recruiter/xing-jobs') !== 0) {
    say('Bitte erst den XING Jobmanager (Seite „Stellenanzeigen“) öffnen, einloggen und dann dieses Lesezeichen anklicken. Auf dieser Seite hier passiert nichts.');
    stopBtn.remove(); return;
  }
  window.__truvaRunning = true;
  var DRY = !!window.__TRUVA_DRY;
  var stopped = false;
  stopBtn.onclick = function () { stopped = true; say('Wird nach der aktuellen Anzeige gestoppt …'); };
  function finish(t) { say(t); stopBtn.remove(); window.__truvaRunning = false; }

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
  var actionBtns = function () { return Array.prototype.slice.call(document.querySelectorAll('button[aria-label="Item actions"]')).filter(vis); };
  var jobCount = function () { var m = document.body.innerText.match(/(\d+)\s+Jobs?\b/); return m ? parseInt(m[1], 10) : null; };
  var path = function () { return location.pathname; };

  /* Karte zu einem „Item actions“-Knopf: Titel, Ort, Ersteller */
  function cardInfo(btn) {
    var c = btn; for (var j = 0; j < 10 && c && !/Erstellt von/.test(c.innerText); j++) c = c.parentElement;
    if (!c) return null;
    var lines = c.innerText.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
    var i = -1; for (var k = 0; k < lines.length; k++) if (/^Erstellt von\s/.test(lines[k])) { i = k; break; }
    if (i < 3) return null;
    return { title: lines[i - 3], loc: lines[i - 1], creator: lines[i].replace(/^Erstellt von\s+/, ''), key: lines[i - 3] + '|' + lines[i - 1] };
  }

  var uidOf = function () { return (/userIds=([^&]+)/.exec(location.search) || [])[1] || ''; };
  var pageOf = function () { return parseInt((/[?&]page=(\d+)/.exec(location.search) || [])[1] || '1', 10); };

  /* Filter „(Sie)“ setzen, falls nötig. Gibt true zurück, wenn genau ein Berater gefiltert ist */
  async function ensureFilter() {
    if (!uidOf()) {
      var input = Array.prototype.slice.call(document.querySelectorAll('input')).filter(function (i) { return vis(i) && /Recruiter/i.test(i.placeholder || ''); })[0];
      if (!input) return 'Der Recruiter-Filter wurde nicht gefunden. Die Seite hat sich wohl geändert.';
      click(input); input.focus();
      var opt = await waitFor(function () {
        return Array.prototype.slice.call(document.querySelectorAll('label,li,[role=option],[role=menuitem],div')).filter(function (e) {
          return vis(e) && e.children.length < 4 && /^\(Sie\)/.test((e.innerText || '').trim());
        }).sort(function (a, b) { return a.innerText.length - b.innerText.length; })[0];
      }, 8000);
      if (!opt) return 'Dein Name („(Sie)“) steht nicht im Filter.';
      click(opt);
      await waitFor(function () { return uidOf(); }, 8000);
      await sleep(1500);
      document.body.click();
    }
    if (!uidOf()) return 'Der Filter konnte nicht gesetzt werden.';
    if (/,|%2C/i.test(uidOf())) return 'Es sind mehrere Berater gefiltert.';
    return '';
  }

  /* Auf Tab „Aktiv“ bzw. „Inaktiv“ wechseln (anklicken wie ein Mensch) */
  async function showTab(kind) {
    if (location.pathname.indexOf('/list/' + kind) === -1) {
      var re = kind === 'inactive' ? /^Inaktiv\s*\d*$/ : /^Aktiv\s*\d*$/;
      var tab = byText('a,button,[role=tab]', re);
      if (!tab) return false;
      click(tab);
      await waitFor(function () { return location.pathname.indexOf('/list/' + kind) !== -1; }, 10000);
      await sleep(1500);
    }
    return location.pathname.indexOf('/list/' + kind) !== -1;
  }

  async function goPage(p) {
    if (pageOf() === p) return true;
    var link = Array.prototype.slice.call(document.querySelectorAll('nav a,nav button')).filter(function (b) {
      return vis(b) && (b.getAttribute('aria-label') || '') === 'Gehe zu Seite ' + p;
    })[0];
    if (!link) return false;
    click(link);
    await waitFor(function () { return pageOf() === p; }, 10000);
    await sleep(1000);
    return pageOf() === p;
  }

  /* Eine Seite der Liste lesen, aber erst wenn sie stabil, vollständig und gefiltert ist */
  async function readPage(ownUid) {
    var last = null, start = Date.now();
    while (Date.now() - start < 30000) {
      var n = jobCount(); var items = []; var bad = false;
      var btns = actionBtns();
      for (var i = 0; i < btns.length; i++) { var ci = cardInfo(btns[i]); if (!ci) { bad = true; break; } items.push(ci); }
      var want = n === null ? -1 : Math.min(10, n - 10 * (pageOf() - 1));
      var empty = !btns.length && (n === 0 || /Keine\s+(aktiven|inaktiven)\s+Stellenanzeigen/.test(document.body.innerText));
      var complete = !bad && ((want > 0 && items.length === want) || empty);
      var sig = items.map(function (x) { return x.key + '#' + x.creator; }).join('~') + '|' + n + '|' + pageOf();
      if (complete && uidOf() === ownUid && sig === last) return { items: items, n: empty ? 0 : n };
      last = complete ? sig : null;
      await sleep(1200);
    }
    return { err: 'Die Liste ist nicht vollständig geladen worden. Bitte Seite neu laden (F5) und nochmal klicken.' };
  }

  /* Eine ganze Liste (alle Seiten) lesen */
  async function readAll(kind, ownUid) {
    if (!await showTab(kind)) return { err: 'Der Tab „' + (kind === 'inactive' ? 'Inaktiv' : 'Aktiv') + '“ wurde nicht gefunden.' };
    var f = await ensureFilter(); if (f) return { err: f };
    if (ownUid && uidOf() !== ownUid) return { err: 'Der Berater-Filter hat sich geändert. Abbruch.' };
    ownUid = uidOf();
    if (!await goPage(1)) return { err: 'Seite 1 der Liste nicht erreichbar.' };
    var all = [], n = null;
    for (var p = 1; ; p++) {
      var r = await readPage(ownUid); if (r.err) return r;
      all = all.concat(r.items); n = r.n;
      if (all.length >= n) break;
      if (!await goPage(p + 1)) return { err: 'Seite ' + (p + 1) + ' der Liste nicht erreichbar.' };
    }
    return { items: all, uid: ownUid };
  }

  (async function () {
    try {
      say('Lese deine deaktivierten Anzeigen ein …');
      var ina = await readAll('inactive');
      if (ina.err) { finish(ina.err + ' Es wurde nichts verändert.'); return; }
      if (!ina.items.length) { finish('Du hast keine deaktivierten Anzeigen.'); return; }
      var ownUid = ina.uid;
      say('Lese deine aktiven Anzeigen ein …');
      var act = await readAll('active', ownUid);
      if (act.err) { finish(act.err + ' Es wurde nichts verändert.'); return; }
      var who = ina.items[0].creator, q;
      for (q = 0; q < ina.items.length; q++) if (ina.items[q].creator !== who) { finish('Sicherheitsstopp: Die Liste enthält Anzeigen von mehreren Personen (' + who + ' / ' + ina.items[q].creator + '). Abbruch, es wurde nichts verändert.'); return; }
      for (q = 0; q < act.items.length; q++) if (act.items[q].creator !== who) { finish('Sicherheitsstopp: Die aktive Liste enthält Anzeigen von mehreren Personen. Abbruch, es wurde nichts verändert.'); return; }

      /* Was fehlt? Gleicher Titel + Ort schon aktiv → überspringen */
      var have = {}; act.items.forEach(function (a) { have[a.key] = (have[a.key] || 0) + 1; });
      var todo = [], skipped = 0;
      ina.items.forEach(function (it, idx) {
        if (have[it.key] > 0) { have[it.key]--; skipped++; } else todo.push({ idx: idx, key: it.key, title: it.title });
      });
      if (!todo.length) { finish('Alle deine ' + ina.items.length + ' deaktivierten Anzeigen sind schon wieder aktiv. Nichts zu tun.'); return; }

      var ok = confirm((DRY ? '[PROBELAUF – es wird nichts veröffentlicht]\n\n' : '') +
        todo.length + ' deaktivierte Anzeigen von ' + who + ' werden bei XING wieder veröffentlicht.' +
        (skipped ? '\n(' + skipped + ' übersprungen, weil schon aktiv.)' : '') +
        '\n\nJede veröffentlichte Anzeige verbraucht 1 Anzeigen-Guthaben. Das dauert ca. ' + Math.ceil(todo.length * 0.4) + ' Minuten – bitte den Tab nicht schließen.\n\nWeitermachen?');
      if (!ok) { finish('Abgebrochen. Es wurde nichts verändert.'); return; }
      if (DRY) { finish('Probelauf: ' + todo.length + ' Anzeigen würden veröffentlicht, ' + skipped + ' übersprungen. Es wurde nichts verändert.'); return; }

      /* Schleife */
      var done = 0;
      for (var t = 0; t < todo.length && !stopped; t++) {
        var job = todo[t];
        say('Veröffentliche ' + (t + 1) + ' von ' + todo.length + ': ' + job.title.slice(0, 50));
        if (!await showTab('inactive')) { finish('Tab „Inaktiv“ nicht gefunden. ' + done + ' veröffentlicht.'); return; }
        var f = await ensureFilter(); if (f) { finish(f + ' ' + done + ' veröffentlicht.'); return; }
        if (uidOf() !== ownUid) { finish('Der Berater-Filter hat sich geändert. ' + done + ' veröffentlicht.'); return; }
        var pg = Math.floor(job.idx / 10) + 1, pos = job.idx % 10;
        if (!await goPage(pg)) { finish('Seite ' + pg + ' der Liste nicht erreichbar. ' + done + ' veröffentlicht.'); return; }
        var cur = await readPage(ownUid);
        if (cur.err) { finish(cur.err + ' ' + done + ' veröffentlicht.'); return; }
        var btns = actionBtns(), ci = cur.items[pos];
        if (!btns[pos] || !ci || ci.key !== job.key || ci.creator !== who) { finish('Sicherheitsstopp: Die Liste sieht anders aus als erwartet. ' + done + ' veröffentlicht. Seite neu laden (F5) und Lesezeichen nochmal klicken (schon aktive werden übersprungen).'); return; }
        click(btns[pos]);
        var item = await waitFor(function () { return byText('[role=menuitem]', /^Als Vorlage verwenden$/); }, 6000);
        if (!item) { finish('Menü „Als Vorlage verwenden“ nicht gefunden. ' + done + ' veröffentlicht.'); return; }
        click(item);
        if (!await waitFor(function () { return path().indexOf('/job/create/') !== -1 || path().indexOf('/job/edit/') !== -1; }, 15000)) { finish('Der Assistent hat sich nicht geöffnet. ' + done + ' veröffentlicht.'); return; }

        /* Schritte bis „Anzeigen-Typ“ */
        for (var s = 0; s < 6 && path().indexOf('product-selection') === -1; s++) {
          var nb = await waitFor(function () { return byText('button', /^Nächster Schritt$/); }, 15000);
          if (!nb) { finish('„Nächster Schritt“ nicht gefunden. ' + done + ' veröffentlicht. Es kann ein Entwurf übrig sein.'); return; }
          var p0 = path(); click(nb);
          await waitFor(function () { return path() !== p0; }, 12000);
          await sleep(800);
        }
        if (path().indexOf('product-selection') === -1) { finish('Der Anzeigen-Typ konnte nicht erreicht werden. ' + done + ' veröffentlicht. Es kann ein Entwurf übrig sein.'); return; }
        var pick = await waitFor(function () { return byText('button', /^Auswählen$/); }, 15000);
        if (!pick) { finish('Kein Anzeigen-Typ zur Auswahl (Guthaben aufgebraucht?). ' + done + ' veröffentlicht.'); return; }
        click(pick); await sleep(1500);
        nb = await waitFor(function () { return byText('button', /^Nächster Schritt$/); }, 8000);
        if (!nb) { finish('„Nächster Schritt“ nicht gefunden. ' + done + ' veröffentlicht.'); return; }
        click(nb);
        if (!await waitFor(function () { return path().indexOf('/confirmation') !== -1; }, 15000)) { finish('Die Bestätigungsseite wurde nicht erreicht. ' + done + ' veröffentlicht. Es kann ein Entwurf übrig sein.'); return; }

        /* Veröffentlichen, bei XING-Fehler bis zu 4 Mal */
        var published = false;
        for (var tr = 0; tr < 4 && !published; tr++) {
          var pb = await waitFor(function () { return byText('button', /^Jetzt veröffentlichen$/); }, 10000);
          if (!pb) break;
          click(pb);
          published = !!(await waitFor(function () { return path().indexOf('/job/success') !== -1; }, 20000));
          if (!published) await sleep(1500);
        }
        if (!published) { finish('Die Anzeige konnte nicht veröffentlicht werden. ' + done + ' veröffentlicht. Es kann ein Entwurf übrig sein.'); return; }
        done++; await sleep(800);
        /* Zurück zur Liste */
        var back = byText('button,a', /^Zu den Stellenanzeigen$/);
        if (back) { click(back); await sleep(2000); }
      }
      if (await showTab('inactive')) { /* Liste zum Schluss anzeigen */ }
      finish((stopped ? 'Gestoppt. ' : 'Fertig. ') + done + ' Anzeigen wieder veröffentlicht.' + (stopped && done < todo.length ? ' Zum Rest einfach nochmal klicken (schon aktive werden übersprungen).' : ''));
    } catch (e) {
      finish('Fehler: ' + e.message);
    }
  })();
})();
