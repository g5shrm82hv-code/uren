/* Derks Uren – tijd- en urenlogica
 * Alle tijdstippen worden opgeslagen als epoch-milliseconden (absoluut, tijdzone-onafhankelijk).
 * Weergave en datums worden altijd berekend in Europe/Amsterdam, ongeacht de tijdzone van de telefoon.
 * Duur = verschil tussen twee epoch-waarden, dus zomer-/wintertijd wordt automatisch goed meegenomen.
 */
(function (g) {
  'use strict';
  var TZ = 'Europe/Amsterdam';
  var DAG = 86400000;
  var dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function parts(ms) {
    var o = {};
    dtf.formatToParts(new Date(ms)).forEach(function (p) { o[p.type] = p.value; });
    return { y: +o.year, m: +o.month, d: +o.day, h: (+o.hour) % 24, mi: +o.minute, s: +o.second };
  }
  /** 'YYYY-MM-DD' in Amsterdam */
  function dateKey(ms) { var p = parts(ms); return p.y + '-' + pad(p.m) + '-' + pad(p.d); }
  /** 'HH:MM' in Amsterdam */
  function hhmm(ms) { var p = parts(ms); return pad(p.h) + ':' + pad(p.mi); }
  /** UTC-offset van Amsterdam in minuten op tijdstip ms (60 of 120) */
  function offsetMin(ms) {
    var t = Math.floor(ms / 1000) * 1000;
    var p = parts(t);
    return Math.round((Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - t) / 60000);
  }
  /** Amsterdamse wandkloktijd (datum + 'HH:MM') -> epoch ms */
  function zonedToMs(dk, hm) {
    var a = dk.split('-').map(Number), b = hm.split(':').map(Number);
    var guess = Date.UTC(a[0], a[1] - 1, a[2], b[0], b[1]);
    var ms = guess - offsetMin(guess) * 60000;
    ms = guess - offsetMin(ms) * 60000; // tweede iteratie corrigeert rond de omschakeling
    return ms;
  }
  /** Huidige minuut (seconden weggelaten), zodat berekening = wat je op het scherm ziet */
  function nowMinute(now) { return Math.floor((now == null ? Date.now() : now) / 60000) * 60000; }

  // ---- kalenderrekenen op datumsleutels (puur kalender, geen tijdzone nodig) ----
  function keyToUTC(dk) { var a = dk.split('-').map(Number); return Date.UTC(a[0], a[1] - 1, a[2]); }
  function utcToKey(t) { var d = new Date(t); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function addDays(dk, n) { return utcToKey(keyToUTC(dk) + n * DAG); }
  /** 0 = maandag … 6 = zondag */
  function weekday(dk) { return (new Date(keyToUTC(dk)).getUTCDay() + 6) % 7; }
  function mondayOf(dk) { return addDays(dk, -weekday(dk)); }
  function diffDays(a, b) { return Math.round((keyToUTC(b) - keyToUTC(a)) / DAG); }
  /** ISO-8601 weeknummer + weekjaar */
  function isoWeek(dk) {
    var thu = addDays(mondayOf(dk), 3);
    var y = +thu.slice(0, 4);
    var week = 1 + Math.floor((keyToUTC(thu) - Date.UTC(y, 0, 1)) / DAG / 7);
    return { year: y, week: week };
  }
  function weekId(dk) { var w = isoWeek(dk); return w.year + '-W' + pad(w.week); }

  var DAGEN = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
  var DAGKORT = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
  var MAANDEN = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  function fmtDateNL(dk) { var a = dk.split('-'); return a[2] + '-' + a[1] + '-' + a[0]; }      // 23-11-2026
  function fmtDateShort(dk) { var a = dk.split('-').map(Number); return a[2] + ' ' + MAANDEN[a[1] - 1]; } // 23 nov
  function fmtDayLabel(dk) { return DAGKORT[weekday(dk)] + ' ' + fmtDateShort(dk); }
  function fmtDateTime(ms) { return fmtDateNL(dateKey(ms)) + ' ' + hhmm(ms); }

  // ---- uren ----
  /** Netto gewerkte minuten van een dagrecord (eindtijd − starttijd − pauzes). Loopt de dag nog, dan t/m 'now'. */
  function netMinutes(rec, now) {
    if (!rec || rec.off || rec.start == null) return 0;
    var end = rec.end != null ? rec.end : nowMinute(now);
    if (end <= rec.start) return 0;
    var p = pauseMinutes(rec, now);
    return Math.max(0, Math.round((end - rec.start) / 60000) - p);
  }
  function pauseMinutes(rec, now) {
    if (!rec || rec.start == null) return 0;
    var end = rec.end != null ? rec.end : nowMinute(now);
    var tot = 0;
    (rec.pauses || []).forEach(function (p) {
      var s = Math.max(p.start, rec.start);
      var e = Math.min(p.end != null ? p.end : end, end);
      if (e > s) tot += Math.round((e - s) / 60000);
    });
    return tot;
  }
  /** Afronden op kwartieren. mode: 'nearest' (standaard; 7,5 min en meer gaat omhoog), 'down', 'up'. Geeft aantal kwartieren. */
  function toQuarters(min, mode) {
    if (!(min > 0)) return 0;
    var q = min / 15;
    if (mode === 'down') return Math.floor(q + 1e-9);
    if (mode === 'up') return Math.ceil(q - 1e-9);
    return Math.floor(q + 0.5);
  }
  /** Kwartieren -> '7', '7 1/4', '7 2/4', '7 3/4', '1/4', '0' */
  function fmtQuarters(q) {
    q = Math.max(0, Math.round(q));
    var h = Math.floor(q / 4), r = q % 4;
    if (!r) return String(h);
    var f = ['', '1/4', '2/4', '3/4'][r];
    return h ? h + ' ' + f : f;
  }
  /** minuten -> 'u:mm' (voor ruwe duur, bv. 7:42) */
  function fmtHM(min) {
    min = Math.max(0, Math.round(min));
    return Math.floor(min / 60) + ':' + pad(min % 60);
  }

  g.DT = {
    TZ: TZ, pad: pad, parts: parts, dateKey: dateKey, hhmm: hhmm, offsetMin: offsetMin, zonedToMs: zonedToMs,
    nowMinute: nowMinute, addDays: addDays, weekday: weekday, mondayOf: mondayOf, diffDays: diffDays,
    isoWeek: isoWeek, weekId: weekId, DAGEN: DAGEN, DAGKORT: DAGKORT, MAANDEN: MAANDEN,
    fmtDateNL: fmtDateNL, fmtDateShort: fmtDateShort, fmtDayLabel: fmtDayLabel, fmtDateTime: fmtDateTime,
    netMinutes: netMinutes, pauseMinutes: pauseMinutes, toQuarters: toQuarters, fmtQuarters: fmtQuarters, fmtHM: fmtHM
  };
})(typeof window !== 'undefined' ? window : globalThis);
