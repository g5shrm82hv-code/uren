/* Derks Uren – minimale PDF-generator (vanilla JS, geen externe bibliotheek)
 * Maakt één A4-pagina met tekst (Helvetica) en dunne lijnen op absolute posities in mm.
 */
(function (g) {
  'use strict';
  var PAGE_W = 595.28, PAGE_H = 841.89;
  function pt(mm) { return mm * 72 / 25.4; }
  function n(v) { return (Math.round(v * 100) / 100).toString(); }
  var WIN = { '€': 128, '‚': 130, '„': 132, '…': 133, '‘': 145, '’': 146, '“': 147, '”': 148, '–': 150, '—': 151 };
  function enc(s) {
    var o = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i), c = s.charCodeAt(i);
      if (WIN[ch]) c = WIN[ch]; else if (c > 255) c = 63; // '?'
      if (c === 40 || c === 41 || c === 92) o += '\\';
      o += String.fromCharCode(c);
    }
    return o;
  }

  /**
   * items: zie FormLayout (kind: text | line | rect), coördinaten in mm
   * t: { ox, oy, sx, sy } verschuiving (mm) en schaal (factor)
   */
  function make(items, t, title) {
    t = t || { ox: 0, oy: 0, sx: 1, sy: 1 };
    function X(x) { return pt(x * t.sx + t.ox); }
    function Y(y) { return PAGE_H - pt(y * t.sy + t.oy); }
    var c = '0 0 0 rg 0 0 0 RG 0.6 w\n';
    items.forEach(function (it) {
      if (it.kind === 'text') {
        var wmm = g.FormLayout.textWidthMm(it.text, it.pt);
        var xs;
        if (it.align === 'center') xs = X(it.x + it.w / 2) - pt(wmm) / 2;
        else if (it.align === 'right') xs = X(it.x + it.w - it.pad) - pt(wmm);
        else xs = X(it.x + it.pad);
        var ys = Y(it.y + it.h / 2) - it.pt * 0.35; // basislijn: hoofdletters verticaal gecentreerd
        c += 'BT /F1 ' + n(it.pt) + ' Tf ' + n(xs) + ' ' + n(ys) + ' Td (' + enc(it.text) + ') Tj ET\n';
      } else if (it.kind === 'line') {
        c += n(X(it.x1)) + ' ' + n(Y(it.y1)) + ' m ' + n(X(it.x2)) + ' ' + n(Y(it.y2)) + ' l S\n';
      } else if (it.kind === 'rect') {
        c += n(X(it.x)) + ' ' + n(Y(it.y + it.h)) + ' ' + n(pt(it.w * t.sx)) + ' ' + n(pt(it.h * t.sy)) + ' re S\n';
      }
    });
    var objs = [
      '<< /Type /Catalog /Pages 2 0 R /ViewerPreferences << /PrintScaling /None >> >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PAGE_W + ' ' + PAGE_H + '] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
      '<< /Length ' + c.length + ' >>\nstream\n' + c + 'endstream',
      '<< /Title (' + enc(title || 'Urenformulier') + ') /Producer (Derks Uren) >>'
    ];
    var out = '%PDF-1.4\n%âãÏÓ\n', offs = [];
    objs.forEach(function (o, i) { offs.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
    var xref = out.length;
    out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
    offs.forEach(function (o) { out += ('0000000000' + o).slice(-10) + ' 00000 n \n'; });
    out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R /Info 6 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
    var bytes = new Uint8Array(out.length);
    for (var i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
    return new Blob([bytes], { type: 'application/pdf' });
  }
  g.MiniPDF = { make: make };
})(typeof window !== 'undefined' ? window : globalThis);
