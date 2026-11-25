/* Derks Uren – hoofdapplicatie (vanilla JS) */
(function () {
  'use strict';
  var D = window.DT;
  var APP_VERSION = '1.0.0';

  // ================================================================
  //  Hulpfuncties
  // ================================================================
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function today() { return D.dateKey(Date.now()); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function dayLong(dk) { return D.DAGEN[D.weekday(dk)] + ' ' + D.fmtDateShort(dk); }
  function hash(str) { var h = 5381; for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  function plural(n, a, b) { return n + ' ' + (n === 1 ? a : b); }
  var toastTimer;
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
  function ago(ms) {
    var d = Math.floor((Date.now() - ms) / 86400000);
    if (d <= 0) return 'vandaag'; if (d === 1) return 'gisteren'; return d + ' dagen geleden';
  }

  // ================================================================
  //  Opslag: IndexedDB, met localStorage als terugval
  // ================================================================
  var Store = {
    mode: 'idb', db: null,
    init: function () {
      var self = this;
      return new Promise(function (res) {
        try {
          if (!window.indexedDB) throw new Error('geen IDB');
          var rq = indexedDB.open('derks-uren', 1);
          rq.onupgradeneeded = function () { rq.result.createObjectStore('kv'); };
          rq.onsuccess = function () { self.db = rq.result; res(); };
          rq.onerror = function () { self.mode = 'ls'; res(); };
          rq.onblocked = function () { self.mode = 'ls'; res(); };
        } catch (e) { self.mode = 'ls'; res(); }
      });
    },
    all: function () {
      var self = this;
      if (self.mode === 'ls') {
        var o = {};
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k.indexOf('du:') === 0) { try { o[k.slice(3)] = JSON.parse(localStorage.getItem(k)); } catch (e) { } }
        }
        return Promise.resolve(o);
      }
      return new Promise(function (res, rej) {
        var o = {}, rq = self.db.transaction('kv').objectStore('kv').openCursor();
        rq.onsuccess = function () { var c = rq.result; if (c) { o[c.key] = c.value; c.continue(); } else res(o); };
        rq.onerror = function () { rej(rq.error); };
      });
    },
    set: function (k, v) {
      var self = this;
      if (self.mode === 'ls') { try { localStorage.setItem('du:' + k, JSON.stringify(v)); } catch (e) { toast('Opslaan mislukt: geheugen vol?'); } return Promise.resolve(); }
      return new Promise(function (res) {
        try {
          var tx = self.db.transaction('kv', 'readwrite');
          tx.objectStore('kv').put(clone(v), k);
          tx.oncomplete = function () { res(); };
          tx.onerror = function () { try { localStorage.setItem('du:' + k, JSON.stringify(v)); } catch (e) { } res(); };
        } catch (e) { try { localStorage.setItem('du:' + k, JSON.stringify(v)); } catch (e2) { } res(); }
      });
    },
    del: function (k) {
      var self = this;
      if (self.mode === 'ls') { localStorage.removeItem('du:' + k); return Promise.resolve(); }
      return new Promise(function (res) {
        try { var tx = self.db.transaction('kv', 'readwrite'); tx.objectStore('kv').delete(k); tx.oncomplete = function () { res(); }; tx.onerror = function () { res(); }; }
        catch (e) { res(); }
      });
    }
  };

  // ================================================================
  //  Toestand
  // ================================================================
  var DEFAULTS = {
    name: 'Thijs',
    rounding: 'nearest',           // nearest | down | up
    workdays: [0, 1, 2, 3, 4],     // ma t/m vr
    offsetX: 0, offsetY: 0,        // mm
    scaleX: 100, scaleY: 100,      // %
    fontPt: 11,
    showFormBg: true,
    calSample: true,
    backupReminder: 'daily',       // daily | weekly
    firstUse: null
  };
  var S = {
    settings: clone(DEFAULTS),
    days: {},        // 'YYYY-MM-DD' -> dagrecord
    prints: {},      // '2026-W48' -> [{at, kind, hash}]
    meta: { lastBackup: null, undo: [], persisted: null },
    ui: { tab: 'vandaag', monday: null }
  };
  /* Dagrecord:
   * { date, start: ms, end: ms|null, pauses: [{start, end|null}], werk, omschrijving, off: bool, updated: ms }
   * Alle uren tellen op 'date' = de startdag (ook als de dag over middernacht doorloopt). */

  function saveSettings() { return Store.set('settings', S.settings); }
  function saveMeta() { return Store.set('meta', S.meta); }
  function savePrints() { return Store.set('prints', S.prints); }

  function openDay() {
    var best = null;
    Object.keys(S.days).forEach(function (k) {
      var d = S.days[k];
      if (!d.off && d.start != null && d.end == null && (!best || d.start > best.start)) best = d;
    });
    return best;
  }
  function openPause(rec) {
    if (!rec || !rec.pauses) return null;
    for (var i = 0; i < rec.pauses.length; i++) if (rec.pauses[i].end == null) return rec.pauses[i];
    return null;
  }
  function dayQuarters(rec) { return D.toQuarters(D.netMinutes(rec), S.settings.rounding); }

  /** Wijziging vastleggen + ongedaan-maken-stap bewaren */
  function commit(date, rec, label) {
    S.meta.undo.push({ date: date, before: S.days[date] ? clone(S.days[date]) : null, label: label, at: Date.now() });
    if (S.meta.undo.length > 30) S.meta.undo.shift();
    applyRec(date, rec);
    saveMeta();
    render();
  }
  function applyRec(date, rec) {
    if (rec) { rec.date = date; rec.updated = Date.now(); S.days[date] = rec; Store.set('day:' + date, rec); }
    else { delete S.days[date]; Store.del('day:' + date); }
  }
  function undo() {
    var u = S.meta.undo.pop();
    if (!u) return;
    applyRec(u.date, u.before);
    saveMeta();
    toast('Ongedaan gemaakt: ' + u.label);
    render();
  }

  // ================================================================
  //  Registratie-acties
  // ================================================================
  function staleOpen(od) { return od && od.date < today() && (Date.now() - od.start) > 16 * 3600000; }
  function startDay() {
    var cur = openDay();
    if (staleOpen(cur)) {
      if (confirm(cap(dayLong(cur.date)) + ' is niet afgesloten. Eerst de eindtijd van die dag invullen?')) openEditor(cur.date);
      return;
    }
    if (cur) { toast('Er loopt al een dag'); return; }
    var t = D.nowMinute(), dk = D.dateKey(t), ex = S.days[dk];
    if (ex && !ex.off && ex.start != null) {
      if (!confirm('Vandaag is al geregistreerd (' + D.hhmm(ex.start) + '–' + (ex.end ? D.hhmm(ex.end) : '…') + ').\nWil je deze dag bewerken?')) return;
      openEditor(dk); return;
    }
    if (ex && ex.off && !confirm('Vandaag staat als "niet gewerkt". Toch starten?')) return;
    commit(dk, { date: dk, start: t, end: null, pauses: [], werk: '', omschrijving: '', off: false }, 'Start dag ' + D.hhmm(t));
    toast('Dag gestart om ' + D.hhmm(t));
  }
  function pauseStart() {
    var od = openDay(); if (!od || openPause(od)) return;
    var t = Math.max(D.nowMinute(), od.start), r = clone(od);
    r.pauses.push({ start: t, end: null });
    commit(r.date, r, 'Pauze start ' + D.hhmm(t));
  }
  function pauseStop() {
    var od = openDay(); var p = openPause(od); if (!p) return;
    var r = clone(od), t = D.nowMinute();
    r.pauses.forEach(function (q) { if (q.end == null) q.end = Math.max(t, q.start); });
    commit(r.date, r, 'Pauze stop ' + D.hhmm(t));
  }
  function endDay() {
    var od = openDay(); if (!od) return;
    if (staleOpen(od) && confirm(cap(dayLong(od.date)) + ' loopt al ' + Math.floor((Date.now() - od.start) / 3600000) + ' uur. Ben je vergeten af te sluiten?\n\nOK = eindtijd zelf invullen\nAnnuleren = nu afsluiten')) { openEditor(od.date); return; }
    var r = clone(od), t = Math.max(D.nowMinute(), od.start);
    r.pauses.forEach(function (q) { if (q.end == null) q.end = Math.max(t, q.start); });
    r.end = t;
    commit(r.date, r, 'Einde dag ' + D.hhmm(t));
    openCloseSheet(r.date);
  }

  // ================================================================
  //  Suggesties op basis van eerdere invoer
  // ================================================================
  function suggestions() {
    var werk = {}, oms = {}, kw = {};
    Object.keys(S.days).forEach(function (k) {
      var d = S.days[k];
      if (d.werk) werk[d.werk.trim()] = (werk[d.werk.trim()] || 0) + 1;
      if (d.omschrijving) {
        oms[d.omschrijving.trim()] = (oms[d.omschrijving.trim()] || 0) + 1;
        d.omschrijving.split(/[,;\/]+/).forEach(function (w) { w = w.trim(); if (w) { var key = w.toLowerCase(); kw[key] = kw[key] || { w: w, n: 0 }; kw[key].n++; } });
      }
    });
    function top(o, n) { return Object.keys(o).sort(function (a, b) { return o[b] - o[a]; }).slice(0, n); }
    var kwl = Object.keys(kw).map(function (k) { return kw[k]; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 12).map(function (x) { return x.w; });
    return { werk: top(werk, 30), oms: top(oms, 30), werkChips: top(werk, 6), kw: kwl };
  }
  function textFieldsHTML(rec) {
    var sg = suggestions();
    return '' +
      '<label class="f" for="f-werk">Werk <span class="tiny">(kort, bv. "Rijplatenloods")</span></label>' +
      '<input type="text" id="f-werk" list="dl-werk" autocomplete="off" autocapitalize="sentences" value="' + esc(rec.werk) + '">' +
      '<datalist id="dl-werk">' + sg.werk.map(function (w) { return '<option value="' + esc(w) + '">'; }).join('') + '</datalist>' +
      (sg.werkChips.length ? '<div class="chips">' + sg.werkChips.map(function (w) { return '<button type="button" class="chip" data-set-werk="' + esc(w) + '">' + esc(w) + '</button>'; }).join('') + '</div>' : '') +
      '<label class="f" for="f-oms">Omschrijving werkzaamheden <span class="tiny">(steekwoorden)</span></label>' +
      '<input type="text" id="f-oms" list="dl-oms" autocomplete="off" autocapitalize="sentences" value="' + esc(rec.omschrijving) + '">' +
      '<datalist id="dl-oms">' + sg.oms.map(function (w) { return '<option value="' + esc(w) + '">'; }).join('') + '</datalist>' +
      (sg.kw.length ? '<div class="chips">' + sg.kw.map(function (w) { return '<button type="button" class="chip" data-add-kw="' + esc(w) + '">+ ' + esc(w) + '</button>'; }).join('') + '</div>' : '');
  }
  function wireTextFields(root) {
    $$('[data-set-werk]', root).forEach(function (b) { b.onclick = function () { $('#f-werk', root).value = b.getAttribute('data-set-werk'); }; });
    $$('[data-add-kw]', root).forEach(function (b) {
      b.onclick = function () {
        var f = $('#f-oms', root), w = b.getAttribute('data-add-kw'), cur = f.value.trim();
        var has = cur.toLowerCase().split(/[,;\/]+/).map(function (x) { return x.trim(); }).indexOf(w.toLowerCase()) >= 0;
        if (!has) f.value = cur ? cur.replace(/[,\s]+$/, '') + ', ' + w.charAt(0).toLowerCase() + w.slice(1) : w;
      };
    });
  }

  // ================================================================
  //  Onderblad (sheet)
  // ================================================================
  function openSheet(html, opts) {
    opts = opts || {};
    var sh = $('#sheet');
    sh.className = opts.full ? 'full' : '';
    sh.innerHTML = (opts.full ? '' : '<div class="grab"></div>') + html;
    sh.hidden = false; $('#sheet-backdrop').hidden = false;
    sh.scrollTop = 0;
    $$('[data-close]', sh).forEach(function (b) { b.onclick = closeSheet; });
    return sh;
  }
  function closeSheet() { $('#sheet').hidden = true; $('#sheet-backdrop').hidden = true; $('#sheet').innerHTML = ''; render(); }

  /** Na "Einde dag": werk + omschrijving invullen */
  function openCloseSheet(date) {
    var r = S.days[date]; if (!r) return;
    var net = D.netMinutes(r), q = dayQuarters(r);
    var sh = openSheet(
      '<div class="sheet-head"><h2>Dag afsluiten</h2><button class="x" data-close aria-label="Sluiten">×</button></div>' +
      '<p class="muted">' + cap(dayLong(date)) + ' · ' + D.hhmm(r.start) + '–' + D.hhmm(r.end) +
      ' · pauze ' + D.fmtHM(D.pauseMinutes(r)) + '</p>' +
      '<div class="calc">Gewerkt: ' + D.fmtHM(net) + ' → <span style="font-size:20px">' + D.fmtQuarters(q) + ' uur</span></div>' +
      textFieldsHTML(r) +
      '<div class="btns mt"><button class="btn primary tall" id="cs-save">Opslaan</button>' +
      '<button class="btn ghost" id="cs-edit">Tijden aanpassen</button></div>' +
      backupNudgeHTML()
    );
    wireTextFields(sh);
    $('#cs-save').onclick = function () {
      var rr = clone(S.days[date]);
      rr.werk = $('#f-werk').value.trim(); rr.omschrijving = $('#f-oms').value.trim();
      commit(date, rr, 'Tekst ' + D.fmtDayLabel(date));
      closeSheet(); toast('Dag opgeslagen');
    };
    $('#cs-edit').onclick = function () {
      var rr = clone(S.days[date]);
      rr.werk = $('#f-werk').value.trim(); rr.omschrijving = $('#f-oms').value.trim();
      applyRec(date, rr); openEditor(date);
    };
    var bb = $('#cs-backup', sh); if (bb) bb.onclick = function () { makeBackup(); };
  }
  function backupNudgeHTML() {
    if (S.settings.backupReminder !== 'daily') return '';
    if (S.meta.lastBackup && Date.now() - S.meta.lastBackup < 20 * 3600000) return '';
    return '<div class="banner info mt"><b>Back-up?</b> Laatste back-up: ' + (S.meta.lastBackup ? ago(S.meta.lastBackup) : 'nog nooit') +
      '.<div class="actions"><button class="btn inline primary" id="cs-backup">Back-up maken</button></div></div>';
  }

  // ================================================================
  //  Dag bewerken / handmatig invoeren
  // ================================================================
  function openEditor(date, isNew) {
    date = date || today();
    var existing = S.days[date];
    var r = existing ? clone(existing) : { date: date, start: null, end: null, pauses: [], werk: '', omschrijving: '', off: false };
    isNew = !existing;
    function hm(ms) { return ms == null ? '' : D.hhmm(ms); }
    var pausesHTML = function (list) {
      return list.map(function (p, i) {
        return '<div class="pause-row" data-i="' + i + '">' +
          '<div><label>Pauze ' + (i + 1) + ' van</label><input type="time" class="p-s" value="' + esc(p.s) + '"></div>' +
          '<div><label>tot</label><input type="time" class="p-e" value="' + esc(p.e) + '"></div>' +
          '<button type="button" class="p-del" aria-label="Pauze verwijderen">×</button></div>';
      }).join('');
    };
    var plist = r.pauses.map(function (p) { return { s: hm(p.start), e: hm(p.end) }; });

    var sh = openSheet(
      '<div class="sheet-head"><h2>' + (isNew ? 'Dag invoeren' : 'Dag bewerken') + '</h2><button class="x" data-close aria-label="Sluiten">×</button></div>' +
      (isNew
        ? '<label class="f" for="e-date">Datum</label><input type="date" id="e-date" value="' + date + '" max="' + today() + '">'
        : '<p class="muted" style="margin-bottom:0">' + cap(dayLong(date)) + ' ' + date.slice(0, 4) + '</p>') +
      '<label class="check"><input type="checkbox" id="e-off"' + (r.off ? ' checked' : '') + '> Niet gewerkt (vrij, ziek, feestdag)</label>' +
      '<div id="e-times">' +
      '<div class="grid2"><div><label class="f" for="e-start">Starttijd</label><input type="time" id="e-start" value="' + hm(r.start) + '"></div>' +
      '<div><label class="f" for="e-end">Eindtijd</label><input type="time" id="e-end" value="' + hm(r.end) + '"></div></div>' +
      '<div class="tiny muted" id="e-endnote" style="margin-top:4px"></div>' +
      '<label class="f">Pauzes</label><div id="e-pauses"></div>' +
      '<button type="button" class="btn inline" id="e-addp">+ Pauze toevoegen</button>' +
      textFieldsHTML(r) +
      '</div>' +
      '<div class="calc" id="e-calc"></div>' +
      '<div class="err-msg" id="e-err"></div>' +
      '<div class="btns mt"><button class="btn primary tall" id="e-save">Opslaan</button>' +
      (isNew ? '' : '<button class="btn danger" id="e-del">Dag verwijderen</button>') +
      '<button class="btn ghost" data-close>Annuleren</button></div>'
    );
    wireTextFields(sh);
    var pBox = $('#e-pauses');
    function drawPauses() {
      pBox.innerHTML = pausesHTML(plist) || '<p class="muted small">Geen pauzes.</p>';
      $$('.pause-row', pBox).forEach(function (row) {
        var i = +row.getAttribute('data-i');
        $('.p-s', row).oninput = function () { plist[i].s = this.value; recalc(); };
        $('.p-e', row).oninput = function () { plist[i].e = this.value; recalc(); };
        $('.p-del', row).onclick = function () { plist.splice(i, 1); drawPauses(); recalc(); };
      });
    }
    $('#e-addp').onclick = function () { plist.push({ s: '', e: '' }); drawPauses(); recalc(); };
    var dateInput = $('#e-date');
    if (dateInput) dateInput.onchange = function () {
      var v = this.value;
      if (S.days[v]) { if (confirm('Voor ' + dayLong(v) + ' bestaat al een registratie. Die openen?')) openEditor(v); else this.value = date; return; }
      date = v; recalc();
    };
    $('#e-off').onchange = function () { $('#e-times').style.opacity = this.checked ? .4 : 1; recalc(); };
    $('#e-times').style.opacity = r.off ? .4 : 1;
    ['#e-start', '#e-end'].forEach(function (s) { $(s).oninput = recalc; });

    /** Leest het formulier uit en controleert het. */
    function read() {
      var dk = dateInput ? dateInput.value : date;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dk)) return { err: 'Kies een datum.' };
      var werk = $('#f-werk').value.trim(), oms = $('#f-oms').value.trim();
      if ($('#e-off').checked) return { rec: { date: dk, start: null, end: null, pauses: [], werk: '', omschrijving: '', off: true }, dk: dk };
      var sv = $('#e-start').value, ev = $('#e-end').value;
      if (!sv) return { err: 'Vul een starttijd in.' };
      var start = D.zonedToMs(dk, sv), end = null, nextDay = false;
      if (ev) {
        end = D.zonedToMs(dk, ev);
        if (end <= start) { end = D.zonedToMs(D.addDays(dk, 1), ev); nextDay = true; }
      } else {
        var od = openDay();
        if (od && od.date !== dk) return { err: 'Er loopt al een andere dag (' + D.fmtDayLabel(od.date) + '). Vul een eindtijd in.' };
        if (start > Date.now()) return { err: 'Starttijd ligt in de toekomst.' };
      }
      var limit = end != null ? end : D.nowMinute();
      var pauses = [], openCount = 0;
      for (var i = 0; i < plist.length; i++) {
        var p = plist[i];
        if (!p.s && !p.e) continue;
        if (!p.s) return { err: 'Pauze ' + (i + 1) + ': vul de begintijd in.' };
        var ps = D.zonedToMs(dk, p.s); if (ps < start) ps = D.zonedToMs(D.addDays(dk, 1), p.s);
        var pe = null;
        if (p.e) { pe = D.zonedToMs(dk, p.e); if (pe < start) pe = D.zonedToMs(D.addDays(dk, 1), p.e); if (pe <= ps) return { err: 'Pauze ' + (i + 1) + ': eindtijd moet na begintijd liggen.' }; }
        else { if (end != null) return { err: 'Pauze ' + (i + 1) + ': vul de eindtijd in.' }; openCount++; }
        if (ps < start || (pe || ps) > limit) return { err: 'Pauze ' + (i + 1) + ' valt buiten de werktijd.' };
        pauses.push({ start: ps, end: pe });
      }
      if (openCount > 1) return { err: 'Er kan maar één pauze tegelijk lopen.' };
      pauses.sort(function (a, b) { return a.start - b.start; });
      for (var j = 1; j < pauses.length; j++) {
        if (pauses[j].start < (pauses[j - 1].end == null ? Infinity : pauses[j - 1].end)) return { err: 'Pauzes overlappen elkaar.' };
      }
      return { rec: { date: dk, start: start, end: end, pauses: pauses, werk: werk, omschrijving: oms, off: false }, dk: dk, nextDay: nextDay };
    }
    function recalc() {
      var res = read();
      $('#e-err').textContent = '';
      $('#e-endnote').textContent = res.nextDay ? 'Eindtijd valt op de volgende dag; alle uren tellen op de startdag.' : ($('#e-end').value ? '' : 'Geen eindtijd = de dag loopt nog.');
      if (res.err) { $('#e-calc').textContent = '–'; return; }
      if (res.rec.off) { $('#e-calc').textContent = 'Niet gewerkt: er wordt niets afgedrukt voor deze dag.'; return; }
      var net = D.netMinutes(res.rec), q = D.toQuarters(net, S.settings.rounding);
      $('#e-calc').innerHTML = 'Netto ' + D.fmtHM(net) + ' (pauze ' + D.fmtHM(D.pauseMinutes(res.rec)) + ') → <span style="font-size:20px">' + D.fmtQuarters(q) + ' uur</span>';
    }
    drawPauses(); recalc();

    $('#e-save').onclick = function () {
      var res = read();
      if (res.err) { $('#e-err').textContent = res.err; return; }
      var dk = res.dk;
      if (isNew && S.days[dk] && !confirm('Er bestaat al een registratie voor ' + dayLong(dk) + '. Overschrijven?')) return;
      commit(dk, res.rec, (isNew ? 'Invoer ' : 'Bewerking ') + D.fmtDayLabel(dk));
      closeSheet(); toast('Opgeslagen');
    };
    var del = $('#e-del');
    if (del) del.onclick = function () {
      if (!confirm('Registratie van ' + dayLong(date) + ' verwijderen?')) return;
      commit(date, null, 'Verwijderen ' + D.fmtDayLabel(date));
      closeSheet(); toast('Verwijderd (ongedaan maken kan)');
    };
  }

  // ================================================================
  //  Waarschuwingen
  // ================================================================
  function warnings() {
    var w = [], td = today(), now = Date.now(), od = openDay();
    if (od && od.date < td) {
      var hrs = (now - od.start) / 3600000;
      var naam = od.date === D.addDays(td, -1) ? 'Gisteren (' + D.fmtDayLabel(od.date) + ')' : cap(dayLong(od.date));
      if (hrs > 16) w.push({ cls: 'err', html: '<b>' + naam + ' is niet afgesloten.</b> De dag loopt al ' + Math.floor(hrs) + ' uur. Corrigeer de tijden.', act: [['Tijden corrigeren', function () { openEditor(od.date); }, 'primary']] });
      else w.push({ cls: 'info', html: 'De dag van ' + D.fmtDayLabel(od.date) + ' loopt over middernacht door. Alle uren tellen op ' + D.fmtDayLabel(od.date) + '.' });
    }
    // werkdagen zonder registratie (vanaf eerste gebruik, max. 14 dagen terug)
    var from = D.addDays(td, -14);
    if (S.settings.firstUse && S.settings.firstUse > from) from = S.settings.firstUse;
    var missing = [];
    for (var dk = from; dk < td; dk = D.addDays(dk, 1)) {
      if (S.settings.workdays.indexOf(D.weekday(dk)) >= 0 && !S.days[dk]) missing.push(dk);
    }
    missing.slice(-3).forEach(function (dk) {
      w.push({ cls: 'warn', html: 'Geen registratie voor <b>' + dayLong(dk) + '</b>.', act: [['Invoeren', function () { openEditor(dk, true); }, 'primary'], ['Niet gewerkt', function () { commit(dk, { date: dk, start: null, end: null, pauses: [], werk: '', omschrijving: '', off: true }, 'Vrij ' + D.fmtDayLabel(dk)); }]] });
    });
    if (missing.length > 3) w.push({ cls: 'warn', html: 'En nog ' + plural(missing.length - 3, 'werkdag', 'werkdagen') + ' zonder registratie. Zie het weekoverzicht.' });
    // afgesloten dagen zonder tekst (laatste 14 dagen)
    Object.keys(S.days).forEach(function (k) {
      var d = S.days[k];
      if (k >= D.addDays(td, -14) && !d.off && d.end != null && (!d.werk || !d.omschrijving) && D.weekday(k) < 6)
        w.push({ cls: 'info', html: 'Bij <b>' + dayLong(k) + '</b> ontbreekt nog "werk" of "omschrijving".', act: [['Invullen', function () { openEditor(k); }]] });
    });
    var bw = backupWarning(); if (bw) w.push(bw);
    return w;
  }
  function backupWarning() {
    if (!Object.keys(S.days).length) return null;
    var lb = S.meta.lastBackup;
    if (!lb || Date.now() - lb > 7 * 86400000)
      return { cls: 'warn', html: '<b>Back-up nodig.</b> Laatste back-up: ' + (lb ? ago(lb) : 'nog nooit') + '.', act: [['Back-up maken', function () { makeBackup(); }, 'primary']], backup: true };
    if (S.settings.backupReminder === 'daily') {
      var lastClosed = 0;
      Object.keys(S.days).forEach(function (k) { var d = S.days[k]; if (d.end && d.end > lastClosed) lastClosed = d.end; });
      if (lastClosed > lb) return { cls: 'info', html: 'Nog geen back-up sinds je laatste werkdag.', act: [['Back-up maken', function () { makeBackup(); }]], backup: true };
    }
    return null;
  }
  function bannersHTML(list) {
    return list.map(function (b, i) {
      return '<div class="banner ' + b.cls + '">' + b.html +
        (b.act ? '<div class="actions">' + b.act.map(function (a, j) { return '<button class="btn inline ' + (a[2] || '') + '" data-ban="' + i + '-' + j + '">' + esc(a[0]) + '</button>'; }).join('') + '</div>' : '') + '</div>';
    }).join('');
  }
  function wireBanners(root, list) {
    $$('[data-ban]', root).forEach(function (b) {
      var ij = b.getAttribute('data-ban').split('-'); b.onclick = function () { list[+ij[0]].act[+ij[1]][1](); };
    });
  }

  // ================================================================
  //  Weergave: Vandaag
  // ================================================================
  function stateOf() {
    var od = openDay();
    if (od) return { s: openPause(od) ? 'pause' : 'working', rec: od };
    var r = S.days[today()];
    if (r && r.off) return { s: 'off', rec: r };
    if (r && r.end != null) return { s: 'closed', rec: r };
    return { s: 'none', rec: null };
  }
  function renderToday() {
    var st = stateOf(), r = st.rec, w = warnings();
    var labels = { none: 'Niet gestart', working: 'Aan het werk', pause: 'In pauze', closed: 'Dag afgesloten', off: 'Niet gewerkt' };
    var html = bannersHTML(w);
    html += '<div class="card status ' + st.s + '"><span class="label">' + (st.s === 'working' || st.s === 'pause' ? '● ' : '') + labels[st.s] + '</span>';
    if (r && !r.off) {
      html += '<div class="big" data-live="net">' + D.fmtHM(D.netMinutes(r)) + '</div>' +
        '<div class="sub">netto gewerkt · afgerond <span class="rounded" data-live="q">' + D.fmtQuarters(dayQuarters(r)) + '</span> uur</div>' +
        '<div class="sub">' + (r.date !== today() ? D.fmtDayLabel(r.date) + ' · ' : '') + 'start ' + D.hhmm(r.start) +
        (r.end ? ' · einde ' + D.hhmm(r.end) : '') + ' · pauze <span data-live="pause">' + D.fmtHM(D.pauseMinutes(r)) + '</span>' +
        (r.pauses.length ? ' (' + r.pauses.length + '×)' : '') + '</div>';
      var op = openPause(r);
      if (op) html += '<div class="sub" style="color:var(--amber);font-weight:700">Pauze loopt sinds ' + D.hhmm(op.start) + ' (<span data-live="curpause">' + D.fmtHM((D.nowMinute() - op.start) / 60000) + '</span>)</div>';
    } else {
      html += '<div class="big">' + new Intl.DateTimeFormat('nl-NL', { timeZone: D.TZ, hour: '2-digit', minute: '2-digit' }).format(new Date()) + '</div>' +
        '<div class="sub">' + cap(dayLong(today())) + '</div>';
    }
    html += '</div>';

    // knoppen
    html += '<div class="btns">';
    if (st.s === 'none' || st.s === 'off') html += '<button class="btn primary huge" data-act="start"><svg viewBox="0 0 24 24"><path d="M7 4v16l13-8z"/></svg>Start dag</button>';
    if (st.s === 'working') html += '<button class="btn amber huge" data-act="pstart"><svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>Pauze start</button>' +
      '<button class="btn dark tall" data-act="end"><svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>Einde dag</button>';
    if (st.s === 'pause') html += '<button class="btn primary huge" data-act="pstop"><svg viewBox="0 0 24 24"><path d="M7 4v16l13-8z"/></svg>Pauze stop</button>' +
      '<button class="btn dark tall" data-act="end"><svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>Einde dag</button>';
    if (st.s === 'closed') {
      html += '<div class="card" style="margin:0"><div class="small muted">Werk</div><div><b>' + (esc(r.werk) || '<span class="muted">nog niet ingevuld</span>') + '</b></div>' +
        '<div class="small muted mt">Omschrijving</div><div>' + (esc(r.omschrijving) || '<span class="muted">nog niet ingevuld</span>') + '</div></div>' +
        '<div class="btns two"><button class="btn" data-act="text">Tekst</button><button class="btn" data-act="edit">Bewerken</button></div>';
    }
    html += '</div>';
    var u = S.meta.undo[S.meta.undo.length - 1];
    if (u) html += '<button class="btn ghost undo" data-act="undo">↶ Ongedaan maken: ' + esc(u.label) + '</button>';

    // tijdlijn
    if (r && !r.off) {
      html += '<div class="card mt"><h3>Tijdlijn</h3><ul class="timeline">' +
        '<li><span>Start</span><span class="t">' + D.hhmm(r.start) + '</span></li>' +
        r.pauses.map(function (p, i) { return '<li><span>Pauze ' + (i + 1) + '</span><span class="t">' + D.hhmm(p.start) + ' – ' + (p.end ? D.hhmm(p.end) : '…') + '</span></li>'; }).join('') +
        (r.end ? '<li><span>Einde</span><span class="t">' + D.hhmm(r.end) + '</span></li>' : '') +
        '</ul>' + ((st.s === 'working' || st.s === 'pause') ? '<button class="btn inline mt" data-act="edit">Tijden aanpassen</button>' : '') + '</div>';
    }
    html += '<button class="btn ghost mt" data-act="manual">+ Vergeten dag handmatig invoeren</button>';
    var main = $('#main'); main.innerHTML = html;
    wireBanners(main, w);
    $$('[data-act]', main).forEach(function (b) {
      var a = b.getAttribute('data-act');
      b.onclick = {
        start: startDay, pstart: pauseStart, pstop: pauseStop, end: endDay, undo: undo,
        edit: function () { openEditor(r.date); }, text: function () { openCloseSheet(r.date); },
        manual: function () { openEditor(firstMissingOr(today()), true); }
      }[a];
    });
  }
  function firstMissingOr(fb) {
    for (var i = 1; i <= 7; i++) { var dk = D.addDays(today(), -i); if (S.settings.workdays.indexOf(D.weekday(dk)) >= 0 && !S.days[dk]) return dk; }
    return S.days[fb] ? D.addDays(fb, -1) : fb;
  }

  // ================================================================
  //  Weekgegevens en formulierdata
  // ================================================================
  function weekInfo(monday) {
    var days = [], totalQ = 0;
    for (var i = 0; i < 7; i++) {
      var dk = D.addDays(monday, i), r = S.days[dk] || null;
      var net = r ? D.netMinutes(r) : 0, q = r ? dayQuarters(r) : 0;
      if (r && !r.off) totalQ += q;
      days.push({ date: dk, rec: r, net: net, q: q });
    }
    var w = D.isoWeek(monday);
    return { monday: monday, sunday: D.addDays(monday, 6), week: w.week, year: w.year, id: D.weekId(monday), days: days, totalQ: totalQ };
  }
  function formData(wi) {
    return {
      weeknummer: String(wi.week),
      van: D.fmtDateNL(wi.monday), tm: D.fmtDateNL(wi.sunday),
      naam: S.settings.name || '',
      totaal: wi.totalQ > 0 ? D.fmtQuarters(wi.totalQ) : '',
      days: wi.days.map(function (d) {
        var r = d.rec;
        if (!r || r.off) return { uur: '', werk: '', omschrijving: '' };
        return { uur: d.q > 0 ? D.fmtQuarters(d.q) : '', werk: r.werk || '', omschrijving: r.omschrijving || '' };
      })
    };
  }
  function weekHash(wi) { return hash(JSON.stringify(formData(wi))); }

  // ================================================================
  //  Weergave: Week
  // ================================================================
  function renderWeek() {
    var mon = S.ui.monday || D.mondayOf(today());
    var wi = weekInfo(mon), td = today();
    var html = '<div class="weeknav"><button data-nav="-1" aria-label="Vorige week">‹</button>' +
      '<div class="wk"><b>Week ' + wi.week + (wi.year !== +td.slice(0, 4) ? ' · ' + wi.year : '') + '</b><span>' + D.fmtDateShort(wi.monday) + ' t/m ' + D.fmtDateShort(wi.sunday) + '</span></div>' +
      '<button data-nav="1" aria-label="Volgende week">›</button></div>';
    if (mon !== D.mondayOf(td)) html += '<button class="btn inline ghost" data-nav="0" style="margin:-4px 0 10px">Naar deze week</button>';

    wi.days.forEach(function (d, i) {
      var r = d.rec, isWork = S.settings.workdays.indexOf(i) >= 0;
      var cls = 'day' + (d.date === td ? ' today' : '') + (!r ? ' empty' : '');
      html += '<button class="' + cls + '" data-day="' + d.date + '"><div class="top"><span class="dname">' + cap(D.DAGEN[i]) + ' <span class="muted" style="font-weight:600">' + D.fmtDateShort(d.date) + '</span>';
      if (r && r.off) html += '<span class="flag off">niet gewerkt</span>';
      else if (r && r.end == null) html += '<span class="flag run">loopt</span>';
      else if (!r && isWork && d.date < td) html += '<span class="flag miss">ontbreekt</span>';
      html += '</span><span class="hrs">' + (r && !r.off ? D.fmtQuarters(d.q) + ' u' : (r || d.date > td ? '' : '+ invoeren')) + '</span></div>';
      if (r && !r.off) {
        html += '<div class="meta">' + D.hhmm(r.start) + '–' + (r.end ? D.hhmm(r.end) : '…') +
          (r.end && D.dateKey(r.end) !== d.date ? ' (+1)' : '') +
          ' · pauze ' + D.fmtHM(D.pauseMinutes(r)) + (r.pauses.length ? ' (' + r.pauses.length + '×)' : '') +
          ' · netto ' + D.fmtHM(d.net) + '</div>';
        if (r.werk || r.omschrijving) html += '<div class="txt">' + (r.werk ? '<b>' + esc(r.werk) + '</b>' : '') + (r.werk && r.omschrijving ? ' – ' : '') + esc(r.omschrijving) + '</div>';
        if (i === 6 && (r.werk || r.omschrijving)) html += '<div class="tiny muted">Zondag: alleen de uren komen op het formulier (geen PRODUCTIE-regel).</div>';
      }
      html += '</button>';
    });
    html += '<div class="weektotal"><span>Weektotaal</span><span class="v">' + D.fmtQuarters(wi.totalQ) + ' uur</span></div>';

    // printstatus
    var pr = S.prints[wi.id] || [], cur = weekHash(wi);
    html += '<div class="card printstatus">';
    if (!pr.length) html += '<div class="row between"><b>Nog niet afgedrukt</b><span class="pill no">open</span></div>';
    else {
      var last = pr[pr.length - 1];
      html += '<div class="row between"><b>Afgedrukt op ' + D.fmtDateTime(last.at) + '</b><span class="pill">' + (last.kind === 'pdf' ? 'PDF' : 'print') + '</span></div>';
      if (last.hash !== cur) html += '<div class="banner warn mt" style="margin-bottom:0">De gegevens zijn gewijzigd na de laatste afdruk.</div>';
      if (pr.length > 1) html += '<details><summary>Alle afdrukken (' + pr.length + ')</summary><ul>' + pr.slice().reverse().map(function (p) { return '<li>' + D.fmtDateTime(p.at) + ' – ' + (p.kind === 'pdf' ? 'PDF' : 'print') + '</li>'; }).join('') + '</ul></details>';
    }
    html += '<div class="btns mt"><button class="btn primary tall" data-p="preview">Voorvertoning &amp; afdrukken</button>' +
      '<div class="btns two"><button class="btn" data-p="print">Afdrukken</button><button class="btn" data-p="pdf">PDF</button></div></div></div>';

    // archief
    var weeks = {};
    Object.keys(S.days).forEach(function (k) { weeks[D.mondayOf(k)] = 1; });
    var list = Object.keys(weeks).sort().reverse();
    if (list.length) {
      html += '<div class="card"><h3>Alle weken (' + list.length + ')</h3><div class="archive">' + list.map(function (m) {
        var w2 = weekInfo(m), p2 = S.prints[w2.id];
        return '<button data-goto="' + m + '"><span><b>Week ' + w2.week + '</b> <span class="muted small">' + D.fmtDateShort(m) + ' – ' + D.fmtDateShort(w2.sunday) + (w2.year !== +td.slice(0, 4) ? ' ' + w2.year : '') + '</span></span>' +
          '<span class="row"><span class="small" style="font-weight:700">' + D.fmtQuarters(w2.totalQ) + ' u</span>' +
          (p2 && p2.length ? '<span class="pill">✓ ' + D.fmtDateNL(D.dateKey(p2[p2.length - 1].at)).slice(0, 5) + '</span>' : '<span class="pill no">niet geprint</span>') + '</span></button>';
      }).join('') + '</div></div>';
    }
    html += '<button class="btn ghost" data-manual>+ Dag handmatig invoeren</button>';

    var main = $('#main'); main.innerHTML = html;
    $$('[data-nav]', main).forEach(function (b) {
      b.onclick = function () { var n = +b.getAttribute('data-nav'); S.ui.monday = n === 0 ? D.mondayOf(today()) : D.addDays(mon, 7 * n); render(); window.scrollTo(0, 0); };
    });
    $$('[data-day]', main).forEach(function (b) {
      b.onclick = function () { var dk = b.getAttribute('data-day'); if (dk > today() && !S.days[dk]) { toast('Die dag is nog niet geweest'); return; } openEditor(dk, !S.days[dk]); };
    });
    $$('[data-goto]', main).forEach(function (b) { b.onclick = function () { S.ui.monday = b.getAttribute('data-goto'); render(); window.scrollTo(0, 0); }; });
    $('[data-manual]', main).onclick = function () { openEditor(firstMissingOr(today()), true); };
    $('[data-p="preview"]', main).onclick = function () { openPreview(wi); };
    $('[data-p="print"]', main).onclick = function () { printWeek(wi); };
    $('[data-p="pdf"]', main).onclick = function () { pdfWeek(wi); };
  }

  // ================================================================
  //  Formulier renderen (voorvertoning + print)
  // ================================================================
  function transform() {
    var s = S.settings;
    return { ox: +s.offsetX || 0, oy: +s.offsetY || 0, sx: (+s.scaleX || 100) / 100, sy: (+s.scaleY || 100) / 100 };
  }
  function sheetHTML(items, opts) {
    opts = opts || {};
    var t = transform();
    function f(v) { return (Math.round(v * 100) / 100) + 'mm'; }
    var html = '<div class="sheet-a4">';
    if (opts.bg) html += '<img class="bg" src="formulier.jpg" alt="">';
    var lines = '';
    items.forEach(function (it) {
      if (it.kind === 'text') {
        var x = it.x * t.sx + t.ox, y = it.y * t.sy + t.oy, w = it.w * t.sx, h = it.h * t.sy;
        html += '<div class="f' + (opts.mark && (it.cut || it.shrunk) ? ' warn' : '') + '" style="left:' + f(x) + ';top:' + f(y) + ';width:' + f(w) + ';height:' + f(h) +
          ';line-height:' + f(h) + ';font-size:' + (Math.round(it.pt * 10) / 10) + 'pt;text-align:' + it.align + ';padding:0 ' + f(it.pad) + '">' + esc(it.text) + '</div>';
      } else if (it.kind === 'line') {
        lines += '<line x1="' + (it.x1 * t.sx + t.ox) + '" y1="' + (it.y1 * t.sy + t.oy) + '" x2="' + (it.x2 * t.sx + t.ox) + '" y2="' + (it.y2 * t.sy + t.oy) + '"/>';
      } else if (it.kind === 'rect') {
        lines += '<rect x="' + (it.x * t.sx + t.ox) + '" y="' + (it.y * t.sy + t.oy) + '" width="' + it.w * t.sx + '" height="' + it.h * t.sy + '"/>';
      }
    });
    if (lines) html += '<svg class="lines" viewBox="0 0 210 297" preserveAspectRatio="none"><g fill="none" stroke="#000" stroke-width="0.2">' + lines + '</g></svg>';
    return html + '</div>';
  }
  function weekItems(wi) { return window.FormLayout.buildSheet(formData(wi), +S.settings.fontPt || 11); }
  function calItems() { return window.FormLayout.buildCalibration(+S.settings.fontPt || 11, !!S.settings.calSample); }

  function recordPrint(wi, kind) {
    if (!wi) return;
    (S.prints[wi.id] = S.prints[wi.id] || []).push({ at: Date.now(), kind: kind, hash: weekHash(wi) });
    savePrints();
  }
  function doPrint(items) {
    var pr = $('#print-root');
    pr.innerHTML = sheetHTML(items, {});
    window.print(); // direct in de tik-actie, anders blokkeert iOS het soms
  }
  function printWeek(wi) {
    if (!wi.totalQ && !confirm('Deze week bevat geen uren. Toch afdrukken?')) return;
    recordPrint(wi, 'print');
    doPrint(weekItems(wi));
    setTimeout(render, 400);
  }
  function pdfName(wi) { return 'Urenformulier_' + (S.settings.name || 'naam').replace(/[^\w-]+/g, '_') + '_' + wi.id + '.pdf'; }
  function sharePdf(blob, name, onDone) {
    var file;
    try { file = new File([blob], name, { type: 'application/pdf' }); } catch (e) { file = null; }
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: name }).then(function () { onDone && onDone(); }).catch(function (e) {
        if (e && e.name !== 'AbortError') downloadBlob(blob, name, onDone);
      });
    } else downloadBlob(blob, name, onDone);
  }
  function downloadBlob(blob, name, onDone) {
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    onDone && onDone();
  }
  function pdfWeek(wi) {
    var blob = window.MiniPDF.make(weekItems(wi), transform(), 'Urenformulier week ' + wi.week);
    sharePdf(blob, pdfName(wi), function () { recordPrint(wi, 'pdf'); render(); toast('PDF gemaakt'); });
  }

  function openPreview(wi) {
    var isCal = !wi;
    var items = isCal ? calItems() : weekItems(wi);
    var warnCount = items.filter(function (i) { return i.cut || i.shrunk; }).length;
    var sh = openSheet(
      '<div class="sheet-head"><h2>' + (isCal ? 'Kalibratiepagina' : 'Voorvertoning week ' + wi.week) + '</h2><button class="x" data-close aria-label="Sluiten">×</button></div>' +
      '<label class="check"><input type="checkbox" id="pv-bg"' + (S.settings.showFormBg ? ' checked' : '') + '> Formulier op de achtergrond tonen (wordt niet geprint)</label>' +
      (warnCount ? '<div class="banner warn">' + plural(warnCount, 'tekst is', 'teksten zijn') + ' verkleind of ingekort om in het vakje te passen (oranje gemarkeerd).</div>' : '') +
      '<div class="preview-wrap" id="pv-wrap"><div class="preview-scale" id="pv-scale"></div></div>' +
      '<p class="tiny muted mt">Afgedrukt wordt alleen de zwarte tekst' + (isCal ? ' en de kaders/kruisjes' : '') + ', zonder logo of formulierlijnen. Print op <b>100% / werkelijke grootte</b>.</p>' +
      '<div class="btns two mt"><button class="btn primary tall" id="pv-print">Afdrukken</button><button class="btn tall" id="pv-pdf">PDF</button></div>' +
      '<button class="btn ghost mt" data-close>Sluiten</button>', { full: true });
    function draw() {
      var wrap = $('#pv-wrap'), sc = $('#pv-scale');
      sc.innerHTML = sheetHTML(items, { bg: S.settings.showFormBg, mark: true });
      var avail = wrap.clientWidth - 20, px = 210 * 96 / 25.4, k = avail / px;
      sc.style.transform = 'scale(' + k + ')';
      sc.style.height = (297 * 96 / 25.4 * k) + 'px'; sc.style.width = avail + 'px';
    }
    draw();
    $('#pv-bg').onchange = function () { S.settings.showFormBg = this.checked; saveSettings(); draw(); };
    $('#pv-print').onclick = function () { if (isCal) doPrint(items); else printWeek(wi); };
    $('#pv-pdf').onclick = function () {
      if (isCal) sharePdf(window.MiniPDF.make(items, transform(), 'Kalibratie'), 'Kalibratie_urenformulier.pdf');
      else pdfWeek(wi);
    };
    window.onresize = function () { if (!$('#sheet').hidden && $('#pv-scale')) draw(); };
  }

  // ================================================================
  //  Back-up
  // ================================================================
  function backupObject() {
    return {
      app: 'derks-uren', version: 1, appVersion: APP_VERSION, exported: new Date().toISOString(),
      settings: S.settings, prints: S.prints,
      days: Object.keys(S.days).sort().map(function (k) { return S.days[k]; })
    };
  }
  function makeBackup() {
    var json = JSON.stringify(backupObject(), null, 1);
    var stamp = D.dateKey(Date.now()) + '_' + D.hhmm(Date.now()).replace(':', '');
    var name = 'derks-uren-backup_' + stamp + '.json';
    var blob = new Blob([json], { type: 'application/json' });
    var done = function () { S.meta.lastBackup = Date.now(); saveMeta(); render(); toast('Back-up gemaakt'); };
    var file = null;
    try { file = new File([blob], name, { type: 'application/json' }); } catch (e) { }
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: name }).then(done).catch(function (e) { if (e && e.name !== 'AbortError') downloadBlob(blob, name, done); });
    } else downloadBlob(blob, name, done);
  }
  function validateBackup(o) {
    if (!o || o.app !== 'derks-uren' || !Array.isArray(o.days)) return 'Dit is geen back-up van Derks Uren.';
    for (var i = 0; i < o.days.length; i++) {
      var d = o.days[i];
      if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return 'Ongeldige dag in back-up (nr. ' + (i + 1) + ').';
      if (!d.off && (typeof d.start !== 'number' || (d.end != null && typeof d.end !== 'number') || !Array.isArray(d.pauses))) return 'Ongeldige tijden bij ' + d.date + '.';
    }
    return null;
  }
  function restoreFromFile(file) {
    var fr = new FileReader();
    fr.onload = function () {
      var o; try { o = JSON.parse(fr.result); } catch (e) { alert('Het bestand kon niet worden gelezen (geen geldige JSON).'); return; }
      var err = validateBackup(o); if (err) { alert(err); return; }
      var dates = o.days.map(function (d) { return d.date; }).sort();
      var conflicts = o.days.filter(function (d) { return S.days[d.date] && JSON.stringify(stripU(S.days[d.date])) !== JSON.stringify(stripU(d)); }).length;
      var newer = o.days.filter(function (d) { return !S.days[d.date]; }).length;
      var sh = openSheet(
        '<div class="sheet-head"><h2>Back-up terugzetten</h2><button class="x" data-close aria-label="Sluiten">×</button></div>' +
        '<div class="card" style="background:var(--bg)"><b>' + esc(file.name) + '</b><br><span class="small">Gemaakt: ' + (o.exported ? D.fmtDateTime(Date.parse(o.exported)) : 'onbekend') + '<br>' +
        plural(o.days.length, 'dag', 'dagen') + (dates.length ? ' (' + D.fmtDateNL(dates[0]) + ' t/m ' + D.fmtDateNL(dates[dates.length - 1]) + ')' : '') + '<br>' +
        newer + ' nieuw · ' + conflicts + ' verschillend van wat nu op de telefoon staat</span></div>' +
        '<h3 class="mt">Samenvoegen (aanbevolen)</h3><p class="small">Voegt ontbrekende dagen toe. Bij een verschil blijft de <b>meest recent gewijzigde</b> versie bewaard. Er gaat niets verloren.</p>' +
        '<button class="btn primary tall" id="rs-merge">Samenvoegen</button>' +
        '<h3 class="mt">Vervangen</h3><p class="small">Wist alle huidige registraties en zet de back-up volledig terug.</p>' +
        '<label class="check"><input type="checkbox" id="rs-settings" checked> Ook instellingen terugzetten (naam, printpositie)</label>' +
        '<button class="btn danger" id="rs-replace">Alles vervangen</button>' +
        '<button class="btn ghost mt" data-close>Annuleren</button>');
      $('#rs-merge').onclick = function () {
        var n = 0;
        o.days.forEach(function (d) {
          var cur = S.days[d.date];
          if (!cur || (d.updated || 0) > (cur.updated || 0)) { S.days[d.date] = d; Store.set('day:' + d.date, d); n++; }
        });
        Object.keys(o.prints || {}).forEach(function (k) {
          var have = (S.prints[k] || []).map(function (p) { return p.at; });
          (o.prints[k] || []).forEach(function (p) { if (have.indexOf(p.at) < 0) (S.prints[k] = S.prints[k] || []).push(p); });
          S.prints[k].sort(function (a, b) { return a.at - b.at; });
        });
        savePrints(); S.meta.undo = []; saveMeta();
        closeSheet(); toast(plural(n, 'dag', 'dagen') + ' bijgewerkt');
      };
      $('#rs-replace').onclick = function () {
        if (!confirm('Weet je het zeker? Alle huidige registraties worden vervangen door de back-up.')) return;
        Object.keys(S.days).forEach(function (k) { Store.del('day:' + k); });
        S.days = {};
        o.days.forEach(function (d) { S.days[d.date] = d; Store.set('day:' + d.date, d); });
        S.prints = o.prints || {}; savePrints();
        if ($('#rs-settings').checked && o.settings) { var fu = S.settings.firstUse; S.settings = Object.assign(clone(DEFAULTS), o.settings); S.settings.firstUse = S.settings.firstUse || fu; saveSettings(); }
        S.meta.undo = []; saveMeta();
        closeSheet(); toast('Back-up teruggezet');
      };
    };
    fr.readAsText(file);
  }
  function stripU(d) { var c = clone(d); delete c.updated; return c; }

  function renderBackup() {
    var lb = S.meta.lastBackup, old = !lb || Date.now() - lb > 7 * 86400000;
    var n = Object.keys(S.days).length;
    var html = '<div class="card"><h3>Status</h3>' +
      '<div class="banner ' + (n && old ? 'warn' : 'ok') + '" style="margin:0">Laatste back-up: <b>' + (lb ? D.fmtDateTime(lb) + ' (' + ago(lb) + ')' : 'nog nooit') + '</b>' +
      (n && old ? '<br>Langer dan 7 dagen geleden: maak een back-up.' : '') + '</div>' +
      '<p class="small muted mt">' + plural(n, 'dag', 'dagen') + ' opgeslagen op deze telefoon.</p>' +
      '<div class="btns"><button class="btn primary tall" id="bk-make">Back-up maken</button>' +
      '<button class="btn" id="bk-restore">Back-up terugzetten</button></div></div>' +
      '<div class="card"><h3>Herinnering</h3>' +
      '<label class="check"><input type="radio" name="bkr" value="daily"' + (S.settings.backupReminder === 'daily' ? ' checked' : '') + '> Na elke afgesloten werkdag</label>' +
      '<label class="check"><input type="radio" name="bkr" value="weekly"' + (S.settings.backupReminder === 'weekly' ? ' checked' : '') + '> Wekelijks (na 7 dagen)</label>' +
      '<p class="small muted">Na 7 dagen zonder back-up verschijnt altijd een waarschuwing.</p></div>' +
      '<div class="card help"><h3>Zo werkt het</h3><ol>' +
      '<li>Tik op <b>Back-up maken</b>. Het deelmenu van iOS opent.</li>' +
      '<li>Kies <b>Bewaar in Bestanden</b> → <b>iCloud Drive</b> → bijvoorbeeld de map <b>Derks Uren</b> → <b>Bewaar</b>.</li>' +
      '<li>Terugzetten: <b>Back-up terugzetten</b> → kies het nieuwste bestand in iCloud Drive.</li></ol>' +
      '<p class="small"><b>Eerlijk gezegd:</b> een webapp mag van iOS niet zelf en ongemerkt naar iCloud schrijven. De back-up is daarom twee tikken: maken en bewaren. De app houdt bij wanneer je dat het laatst deed en waarschuwt je op tijd.</p></div>';
    var main = $('#main'); main.innerHTML = html;
    $('#bk-make').onclick = makeBackup;
    $('#bk-restore').onclick = function () { var f = $('#restore-file'); f.value = ''; f.click(); };
    $$('input[name=bkr]', main).forEach(function (r) { r.onchange = function () { S.settings.backupReminder = this.value; saveSettings(); render(); }; });
  }

  // ================================================================
  //  Weergave: Instellingen
  // ================================================================
  function stepper(key, step, unit, big) {
    return '<div class="stepper' + (big ? '' : ' short') + '" data-key="' + key + '" data-step="' + step + '">' +
      (big ? '<button data-d="-10">−1</button>' : '') + '<button data-d="-1">−' + step + '</button>' +
      '<input type="number" inputmode="decimal" step="' + step + '" value="' + S.settings[key] + '" aria-label="' + key + '">' +
      '<button data-d="1">+' + step + '</button>' + (big ? '<button data-d="10">+1</button>' : '') + '</div>' +
      (unit ? '<div class="tiny muted" style="margin-top:3px">' + unit + '</div>' : '');
  }
  function renderSettings() {
    var s = S.settings;
    var dayChecks = D.DAGKORT.map(function (d, i) { return '<label><input type="checkbox" data-wd="' + i + '"' + (s.workdays.indexOf(i) >= 0 ? ' checked' : '') + '>' + d + '</label>'; }).join('');
    var html =
      '<div class="card"><h3>Algemeen</h3>' +
      '<label class="f" for="s-name">Naam op het formulier</label><input type="text" id="s-name" value="' + esc(s.name) + '" autocomplete="off">' +
      '<label class="f" for="s-round">Afronding van de dagtotalen</label>' +
      '<select id="s-round"><option value="nearest"' + (s.rounding === 'nearest' ? ' selected' : '') + '>Dichtstbijzijnde kwartier (standaard)</option>' +
      '<option value="down"' + (s.rounding === 'down' ? ' selected' : '') + '>Altijd naar beneden</option>' +
      '<option value="up"' + (s.rounding === 'up' ? ' selected' : '') + '>Altijd naar boven</option></select>' +
      '<p class="small muted mt">Netto uren = (eindtijd − starttijd) − alle pauzes. Dat totaal wordt per dag afgerond op kwartieren: bij “dichtstbijzijnde” wordt 7:07 → 7, 7:08 → 7 1/4, 7:22 → 7 1/4, 7:23 → 7 2/4. Het weektotaal is de som van de afgeronde dagen.</p>' +
      '<label class="f">Werkdagen (voor de melding “geen registratie”)</label><div class="days-pick">' + dayChecks + '</div></div>' +

      '<div class="card"><h3>Printpositie &amp; kalibratie</h3>' +
      '<label class="f">Horizontale verschuiving (mm)</label>' + stepper('offsetX', 0.1, 'Positief = naar rechts', true) +
      '<label class="f">Verticale verschuiving (mm)</label>' + stepper('offsetY', 0.1, 'Positief = naar beneden', true) +
      '<label class="f">Schaal horizontaal (%)</label>' + stepper('scaleX', 0.1, '100 = geen schaling (vanaf linkerbovenhoek)') +
      '<label class="f">Schaal verticaal (%)</label>' + stepper('scaleY', 0.1, '') +
      '<label class="f">Lettergrootte (pt)</label>' + stepper('fontPt', 0.5, 'Standaard 11 pt; te lange teksten worden automatisch kleiner') +
      '<label class="check"><input type="checkbox" id="s-calsample"' + (s.calSample ? ' checked' : '') + '> Voorbeeldtekst op de kalibratiepagina</label>' +
      '<div class="btns"><button class="btn primary" id="s-cal">Kalibratiepagina bekijken / afdrukken</button>' +
      '<button class="btn ghost" id="s-calreset">Printinstellingen terugzetten</button></div>' +
      '<details><summary>Zo kalibreer je</summary><ol class="help">' +
      '<li>Druk de kalibratiepagina af op een <b>gewoon wit A4-vel</b> (100% / werkelijke grootte).</li>' +
      '<li>Meet de liniaal onderaan: die moet precies 100 mm zijn. Is hij 99 mm, zet de schaal op 101%.</li>' +
      '<li>Leg het vel op een leeg urenformulier en houd het tegen het licht (of het raam).</li>' +
      '<li>Staan de kruisjes te ver naar rechts? Maak de horizontale verschuiving negatief met dat aantal mm. Te laag? Maak de verticale verschuiving negatief.</li>' +
      '<li>Herhaal tot de kaders over de vakjes vallen. Daarna kun je een proef op een echt formulier doen.</li></ol></details></div>' +

      '<div class="card help"><h3>Afdrukken op de iPhone</h3><ul>' +
      '<li>Tik op <b>Afdrukken</b> en kies je wifi-printer (AirPrint).</li>' +
      '<li>Papier: <b>A4</b>. Schaal: <b>100%</b> (niet “Passend maken”). Kies 1 exemplaar: het doordrukformulier maakt de kopie.</li>' +
      '<li>Leg de twee vellen van het doordrukformulier in de lade zoals je printer voorgedrukt papier verwacht (doe eerst een proef).</li>' +
      '<li>Werkt afdrukken vanuit de app op het beginscherm niet goed? Gebruik <b>PDF</b> → in het deelmenu <b>Druk af</b>. Dat print op werkelijke grootte.</li></ul></div>' +

      '<div class="card help"><h3>Herinneringen</h3><p class="small">Een webapp kan op de iPhone geen meldingen op een vast tijdstip sturen. De app waarschuwt daarom bij het openen: een dag die niet is afgesloten, een werkdag zonder registratie, en een lopende dag (blauwe balk bovenaan). Voor een dagelijkse herinnering stel je een automatisering in via de app <b>Opdrachten</b> (zie de handleiding).</p></div>' +

      '<div class="card"><h3>Opslag</h3><p class="small" id="s-storage">…</p>' +
      '<button class="btn ghost" id="s-persist">Vaste opslag aanvragen</button></div>' +
      '<p class="center tiny muted">Derks Uren v' + APP_VERSION + ' · tijdzone Europe/Amsterdam</p>';
    var main = $('#main'); main.innerHTML = html;

    $('#s-name').onchange = function () { s.name = this.value.trim(); saveSettings(); renderHeader(); toast('Naam opgeslagen'); };
    $('#s-round').onchange = function () { s.rounding = this.value; saveSettings(); toast('Afronding aangepast'); };
    $$('[data-wd]', main).forEach(function (c) {
      c.onchange = function () {
        var i = +c.getAttribute('data-wd');
        s.workdays = s.workdays.filter(function (x) { return x !== i; }); if (c.checked) s.workdays.push(i); s.workdays.sort();
        saveSettings();
      };
    });
    $$('.stepper', main).forEach(function (st) {
      var key = st.getAttribute('data-key'), step = +st.getAttribute('data-step'), inp = $('input', st);
      function setv(v) {
        v = Math.round(v * 10) / 10;
        var lim = { offsetX: [-30, 30], offsetY: [-30, 30], scaleX: [90, 110], scaleY: [90, 110], fontPt: [6, 16] }[key];
        v = Math.min(lim[1], Math.max(lim[0], v));
        s[key] = v; inp.value = v; saveSettings();
      }
      $$('button', st).forEach(function (b) { b.onclick = function () { setv((+inp.value || 0) + (+b.getAttribute('data-d')) * step); }; });
      inp.onchange = function () { setv(parseFloat(String(inp.value).replace(',', '.')) || 0); };
    });
    $('#s-calsample').onchange = function () { s.calSample = this.checked; saveSettings(); };
    $('#s-cal').onclick = function () { openPreview(null); };
    $('#s-calreset').onclick = function () {
      if (!confirm('Verschuiving, schaal en lettergrootte terugzetten naar standaard?')) return;
      s.offsetX = 0; s.offsetY = 0; s.scaleX = 100; s.scaleY = 100; s.fontPt = 11; saveSettings(); render();
    };
    $('#s-persist').onclick = function () { requestPersist(true); };
    showStorage();
  }
  function showStorage() {
    var el = $('#s-storage'); if (!el) return;
    var txt = 'Opslag: ' + (Store.mode === 'idb' ? 'IndexedDB' : 'localStorage (terugval)') + '. ';
    var done = function (p) {
      txt += p ? 'Vaste opslag is <b>toegekend</b>.' : 'Vaste opslag is <b>niet bevestigd</b> door iOS (normaal bij Safari; een app op het beginscherm wordt minder snel opgeschoond). Maak regelmatig een back-up.';
      el.innerHTML = txt;
    };
    if (navigator.storage && navigator.storage.persisted) navigator.storage.persisted().then(done).catch(function () { done(false); });
    else done(false);
  }
  function requestPersist(manual) {
    if (!(navigator.storage && navigator.storage.persist)) { if (manual) toast('Niet ondersteund op dit toestel'); return; }
    navigator.storage.persist().then(function (ok) { S.meta.persisted = ok; saveMeta(); if (manual) { toast(ok ? 'Vaste opslag toegekend' : 'Niet toegekend door iOS'); showStorage(); } }).catch(function () { });
  }

  // ================================================================
  //  Algemeen renderen
  // ================================================================
  function renderHeader() { $('#hdr-name').textContent = (S.settings.name ? S.settings.name + ' · ' : '') + 'P.A.M. Derks B.V.'; }
  function renderRunStrip() {
    var od = openDay(), el = $('#runstrip');
    if (!od) { el.hidden = true; setBadge(false); return; }
    var p = openPause(od);
    el.hidden = false; el.className = 'runstrip' + (p ? ' pause' : '');
    el.innerHTML = '<span class="pulse"></span><span>' + (p ? 'In pauze sinds ' + D.hhmm(p.start) : 'Dag loopt sinds ' + D.hhmm(od.start) + (od.date !== today() ? ' (' + D.fmtDayLabel(od.date) + ')' : '')) +
      ' · <span data-live="net">' + D.fmtHM(D.netMinutes(od)) + '</span> gewerkt</span>';
    setBadge(true);
  }
  function setBadge(on) {
    try { if (on && navigator.setAppBadge) navigator.setAppBadge(1).catch(function () { }); else if (!on && navigator.clearAppBadge) navigator.clearAppBadge().catch(function () { }); } catch (e) { }
  }
  function render() {
    if (!$('#sheet').hidden && document.activeElement && $('#sheet').contains(document.activeElement)) { renderRunStrip(); return; }
    renderHeader(); renderRunStrip();
    $$('#tabbar button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-tab') === S.ui.tab); });
    $('#backup-dot').hidden = !(backupWarning() && backupWarning().cls === 'warn');
    ({ vandaag: renderToday, week: renderWeek, backup: renderBackup, instellingen: renderSettings })[S.ui.tab]();
  }
  /** Lopende tijden elke seconde bijwerken zonder het scherm opnieuw op te bouwen */
  var lastMinute = -1, lastDate = '';
  function tick() {
    var nm = D.nowMinute();
    if (nm === lastMinute) return;
    lastMinute = nm;
    if (today() !== lastDate) { lastDate = today(); if ($('#sheet').hidden) render(); return; }
    var od = openDay();
    if (!od) return;
    $$('[data-live="net"]').forEach(function (e) { e.textContent = D.fmtHM(D.netMinutes(od)); });
    $$('[data-live="q"]').forEach(function (e) { e.textContent = D.fmtQuarters(dayQuarters(od)); });
    $$('[data-live="pause"]').forEach(function (e) { e.textContent = D.fmtHM(D.pauseMinutes(od)); });
    var p = openPause(od);
    if (p) $$('[data-live="curpause"]').forEach(function (e) { e.textContent = D.fmtHM((nm - p.start) / 60000); });
  }

  // ================================================================
  //  Opstarten
  // ================================================================
  function init() {
    var t0 = Date.now();
    Store.init().then(function () { return Store.all(); }).then(function (all) {
      Object.keys(all).forEach(function (k) {
        if (k.indexOf('day:') === 0) S.days[k.slice(4)] = all[k];
      });
      if (all.settings) S.settings = Object.assign(clone(DEFAULTS), all.settings);
      if (all.prints) S.prints = all.prints;
      if (all.meta) S.meta = Object.assign(S.meta, all.meta);
      if (!S.meta.undo) S.meta.undo = [];
      if (!S.settings.firstUse) { S.settings.firstUse = today(); saveSettings(); }
      S.ui.monday = D.mondayOf(today());
      lastDate = today();
      render();
      requestPersist(false);
    }).catch(function (e) {
      $('#main').innerHTML = '<div class="banner err">Opslag kon niet worden geopend: ' + esc(e && e.message) + '</div>';
    }).then(function () {
      setTimeout(function () { $('#splash').classList.add('gone'); setTimeout(function () { $('#splash').remove(); }, 400); }, Math.max(0, 600 - (Date.now() - t0)));
    });

    $$('#tabbar button').forEach(function (b) {
      b.onclick = function () { S.ui.tab = b.getAttribute('data-tab'); if (S.ui.tab === 'week') S.ui.monday = S.ui.monday || D.mondayOf(today()); render(); window.scrollTo(0, 0); };
    });
    $('#sheet-backdrop').onclick = closeSheet;
    $('#restore-file').onchange = function () { if (this.files && this.files[0]) restoreFromFile(this.files[0]); };
    document.addEventListener('visibilitychange', function () { if (!document.hidden && $('#sheet').hidden) render(); });
    setInterval(tick, 1000);

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(function () { });
    }
  }
  init();

  // voor testen in de console
  window.DerksApp = { S: S, weekInfo: weekInfo, formData: formData, undo: undo };
})();
