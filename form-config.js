/* Derks Uren – posities van de invulvakjes op het urenformulier (A4 = 210 × 297 mm)
 *
 * ALLE COÖRDINATEN IN MILLIMETERS, gemeten vanaf de LINKERBOVENHOEK van het vel.
 *   x, y = linkerbovenhoek van het vakje (de lijnen van het formulier)
 *   w, h = breedte en hoogte van het vakje
 * Bepaald uit de scan van het formulier. Kleine afwijkingen van de printer corrigeer je
 * in de app via Instellingen → Printpositie (verschuiving en schaal). Wil je één vakje
 * structureel verplaatsen, pas dan hier het getal aan.
 */
(function (g) {
  'use strict';
  var FORM = {
    pageW: 210, pageH: 297,
    padding: 1.2,            // binnenmarge in een vakje (mm)

    // Kop rechtsboven
    weeknummer: { x: 104.3, y: 17.4, w: 87.2, h: 5.8, align: 'left' },
    weekVan:    { x: 104.3, y: 23.2, w: 33.0, h: 5.8, align: 'left' },  // tussen "van" en "t/m"
    weekTm:     { x: 143.5, y: 23.2, w: 48.0, h: 5.8, align: 'left' },  // rechts van "t/m"
    naam:       { x: 104.3, y: 29.0, w: 87.2, h: 5.8, align: 'left' },

    // Bovenste tabel: bovenkant van de regels maandag … zondag, en de totaalregel
    top: {
      rowY: [88.0, 93.9, 99.8, 105.5, 111.4, 117.2, 123.0],
      totaalY: 128.8,
      rowH: 5.8,
      productie: { x: 37.4, w: 13.6, align: 'center' },
      totaal:    { x: 104.7, w: 19.2, align: 'center' }
    },

    // Blok PRODUCTIE: bovenkant van de EERSTE regel per dag, maandag … zaterdag
    prod: {
      rowY: [157.6, 174.7, 191.9, 209.2, 226.6, 244.3],
      rowH: 5.7,
      werk:         { x: 38.1, w: 40.5, align: 'left' },
      uur:          { x: 78.6, w: 13.3, align: 'center' },
      omschrijving: { x: 105.2, w: 88.1, align: 'left' }
    }
  };

  // Breedtes Helvetica/Arial (1/1000 em) voor tekens 32..255 (WinAnsi), voor automatisch verkleinen
  var HW = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,350,556,350,222,556,333,1000,556,556,333,1000,667,333,1000,350,611,350,350,222,222,333,333,350,556,1000,333,1000,500,333,944,350,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500];
  var PT = 25.4 / 72; // mm per punt
  function textWidthMm(s, pt) {
    var u = 0;
    for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); u += (c >= 32 && c <= 255) ? HW[c - 32] : 556; }
    return u / 1000 * pt * PT;
  }
  /** Lettergrootte zo kiezen dat de tekst in het vakje past (min 6 pt); te lange tekst wordt ingekort met … */
  function fit(text, box, basePt) {
    var avail = box.w - 2 * FORM.padding, pt = basePt, t = text;
    var w = textWidthMm(t, pt);
    if (w > avail) pt = Math.max(6, basePt * avail / w);
    var shrunk = pt < basePt - 0.01, cut = false;
    while (t.length > 1 && textWidthMm(t, pt) > avail) { t = t.slice(0, -2) + '…'; cut = true; }
    return { text: t, pt: pt, shrunk: shrunk, cut: cut };
  }
  function item(text, x, y, w, h, align, basePt) {
    if (text == null || text === '') return null;
    var box = { x: x, y: y, w: w, h: h };
    var f = fit(String(text), box, basePt);
    return { kind: 'text', text: f.text, pt: f.pt, x: x, y: y, w: w, h: h, align: align || 'left', shrunk: f.shrunk, cut: f.cut, pad: FORM.padding };
  }

  /**
   * Bouwt de lijst invulwaarden voor één week.
   * data = { weeknummer, van, tm, naam, days: [7 × { uur: '7 3/4' | '', werk, omschrijving }], totaal }
   */
  function buildSheet(data, basePt) {
    var F = FORM, out = [];
    function push(it) { if (it) out.push(it); }
    push(item(data.weeknummer, F.weeknummer.x, F.weeknummer.y, F.weeknummer.w, F.weeknummer.h, F.weeknummer.align, basePt));
    push(item(data.van, F.weekVan.x, F.weekVan.y, F.weekVan.w, F.weekVan.h, F.weekVan.align, basePt));
    push(item(data.tm, F.weekTm.x, F.weekTm.y, F.weekTm.w, F.weekTm.h, F.weekTm.align, basePt));
    push(item(data.naam, F.naam.x, F.naam.y, F.naam.w, F.naam.h, F.naam.align, basePt));
    var T = F.top, P = F.prod;
    for (var i = 0; i < 7; i++) {
      var d = data.days[i] || {};
      if (d.uur) {
        push(item(d.uur, T.productie.x, T.rowY[i], T.productie.w, T.rowH, T.productie.align, basePt));
        push(item(d.uur, T.totaal.x, T.rowY[i], T.totaal.w, T.rowH, T.totaal.align, basePt));
      }
      if (i < 6) { // zondag heeft geen regel in het blok PRODUCTIE
        push(item(d.werk, P.werk.x, P.rowY[i], P.werk.w, P.rowH, P.werk.align, basePt));
        if (d.uur) push(item(d.uur, P.uur.x, P.rowY[i], P.uur.w, P.rowH, P.uur.align, basePt));
        push(item(d.omschrijving, P.omschrijving.x, P.rowY[i], P.omschrijving.w, P.rowH, P.omschrijving.align, basePt));
      }
    }
    if (data.totaal) {
      push(item(data.totaal, T.productie.x, T.totaalY, T.productie.w, T.rowH, T.productie.align, basePt));
      push(item(data.totaal, T.totaal.x, T.totaalY, T.totaal.w, T.rowH, T.totaal.align, basePt));
    }
    return out;
  }

  /** Alle vakjes (voor de kalibratiepagina) */
  function allBoxes() {
    var F = FORM, T = F.top, P = F.prod, b = [];
    ['weeknummer', 'weekVan', 'weekTm', 'naam'].forEach(function (k) { b.push({ x: F[k].x, y: F[k].y, w: F[k].w, h: F[k].h, label: k }); });
    T.rowY.concat([T.totaalY]).forEach(function (y) {
      b.push({ x: T.productie.x, y: y, w: T.productie.w, h: T.rowH });
      b.push({ x: T.totaal.x, y: y, w: T.totaal.w, h: T.rowH });
    });
    P.rowY.forEach(function (y) {
      b.push({ x: P.werk.x, y: y, w: P.werk.w, h: P.rowH });
      b.push({ x: P.uur.x, y: y, w: P.uur.w, h: P.rowH });
      b.push({ x: P.omschrijving.x, y: y, w: P.omschrijving.w, h: P.rowH });
    });
    return b;
  }

  /** Kalibratiepagina: kaders + kruisjes op de vakjes, linialen van 100 mm en hoekmerken */
  function buildCalibration(basePt, withSample) {
    var out = [];
    allBoxes().forEach(function (b) {
      out.push({ kind: 'rect', x: b.x, y: b.y, w: b.w, h: b.h });
      var cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      out.push({ kind: 'line', x1: cx - 1.5, y1: cy, x2: cx + 1.5, y2: cy });
      out.push({ kind: 'line', x1: cx, y1: cy - 1.5, x2: cx, y2: cy + 1.5 });
    });
    // linialen: 100 mm horizontaal en verticaal, met streepjes per cm
    var lx = 40, ly = 284;
    out.push({ kind: 'line', x1: lx, y1: ly, x2: lx + 100, y2: ly });
    for (var i = 0; i <= 10; i++) out.push({ kind: 'line', x1: lx + i * 10, y1: ly - (i % 5 ? 1.5 : 3), x2: lx + i * 10, y2: ly });
    out.push({ kind: 'text', text: 'precies 100 mm', x: lx + 102, y: ly - 3, w: 40, h: 4, pt: 8, align: 'left', pad: 0 });
    var vx = 200, vy = 150;
    out.push({ kind: 'line', x1: vx, y1: vy, x2: vx, y2: vy + 100 });
    for (var j = 0; j <= 10; j++) out.push({ kind: 'line', x1: vx - (j % 5 ? 1.5 : 3), y1: vy + j * 10, x2: vx, y2: vy + j * 10 });
    // hoekmerken op 10 mm van de randen
    [[10, 10, 1, 1], [200, 10, -1, 1], [10, 287, 1, -1], [200, 287, -1, -1]].forEach(function (c) {
      out.push({ kind: 'line', x1: c[0], y1: c[1], x2: c[0] + 6 * c[2], y2: c[1] });
      out.push({ kind: 'line', x1: c[0], y1: c[1], x2: c[0], y2: c[1] + 6 * c[3] });
    });
    out.push({ kind: 'text', text: 'KALIBRATIE – hoekmerken 10 mm van de rand', x: 40, y: 286, w: 120, h: 4, pt: 8, align: 'left', pad: 0 });
    if (withSample) {
      var sample = {
        weeknummer: '48', van: '23-11-2026', tm: '29-11-2026', naam: 'Thijs', totaal: '40 3/4',
        days: [
          { uur: '8 3/4', werk: 'Rijplatenloods', omschrijving: 'Rijplaten schoonmaken, walsen' },
          { uur: '8', werk: 'Bouw Arnhem', omschrijving: 'Rijplaten leggen' },
          { uur: '7 2/4', werk: 'Rijplatenloods', omschrijving: 'Onderhoud kraan' },
          { uur: '8 1/4', werk: 'Nijmegen', omschrijving: 'Rijplaten ophalen' },
          { uur: '8 1/4', werk: 'Werkplaats', omschrijving: 'Diverse reparaties' },
          { uur: '', werk: '', omschrijving: '' },
          { uur: '', werk: '', omschrijving: '' }
        ]
      };
      out = out.concat(buildSheet(sample, basePt));
    }
    return out;
  }

  g.FORM = FORM;
  g.FormLayout = { buildSheet: buildSheet, buildCalibration: buildCalibration, allBoxes: allBoxes, textWidthMm: textWidthMm };
})(typeof window !== 'undefined' ? window : globalThis);
