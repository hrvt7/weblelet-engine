export const PDF_TEMPLATE = `<!DOCTYPE html>
<html lang="hu">
<head>
<meta charset="UTF-8"/>
<style>
/* ══════════════════════════════════════════════════════════
   WebLelet — PDFBolt Template v1.0  (Handlebars + Chrome PDF)
   5 oldal, A4, sötét navy borító, DejaVu-kompatibilis design
   ══════════════════════════════════════════════════════════ */

* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #fff; font-family: Arial, Helvetica, sans-serif; }
@page { size: A4; margin: 0; }

/* ── Page wrappers ─────────────────────────────────────── */
.page {
  width: 210mm;
  min-height: 297mm;
  padding: 20mm 18mm 25mm 18mm;
  position: relative;
  page-break-after: always;
  background: #ffffff;
  overflow: hidden;
}
.page.dark { background: #162440; }
.page:last-child { page-break-after: avoid; }

/* ── Footer ─────────────────────────────────────────────── */
.footer {
  position: absolute;
  bottom: 14mm;
  left: 18mm;
  right: 18mm;
  border-top: 1px solid #e0e0e0;
  padding-top: 5px;
  text-align: center;
  font-size: 8px;
  color: #aaa;
  font-family: Arial, sans-serif;
}
.page.dark .footer { border-top-color: #2a3a5a; color: #6a7a9a; }

/* ── Typography ─────────────────────────────────────────── */
h1, h2, h3, p, span, td, th, div { font-family: Arial, Helvetica, sans-serif; }
.section-title {
  font-size: 16px;
  font-weight: bold;
  color: #162440;
  margin-bottom: 14px;
  padding-bottom: 6px;
  border-bottom: 2px solid #162440;
}

/* ── Cover page ─────────────────────────────────────────── */
.cover-header {
  text-align: center;
  margin-bottom: 30px;
  padding-top: 10mm;
}
.cover-brand {
  font-size: 13px;
  color: #aab4c8;
  letter-spacing: 3px;
  text-transform: uppercase;
  margin-bottom: 8px;
}
.cover-domain {
  font-size: 32px;
  font-weight: bold;
  color: #ffffff;
  margin-bottom: 6px;
  word-break: break-all;
}
.cover-subtitle {
  font-size: 12px;
  color: #aab4c8;
  margin-bottom: 4px;
}
.cover-circles {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin: 28px 0 24px 0;
}
.cover-divider {
  border: none;
  border-top: 1px solid #2a3a5a;
  margin: 18px 0;
}
.cover-meta {
  display: flex;
  justify-content: space-between;
  margin-top: 10px;
}
.cover-meta-item {
  font-size: 10px;
  color: #aab4c8;
}
.cover-meta-item strong { color: #ffffff; }

/* ── Summary boxes ───────────────────────────────────────── */
.summary-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 10px;
  margin-bottom: 20px;
}
.summary-box {
  border-radius: 6px;
  padding: 12px 14px;
  text-align: center;
}
.summary-box.green  { background: #f0fdf4; border: 1px solid #86efac; }
.summary-box.red    { background: #fef2f2; border: 1px solid #fca5a5; }
.summary-box.yellow { background: #fffbeb; border: 1px solid #fcd34d; }
.summary-box .sb-label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #64748b;
  margin-bottom: 4px;
}
.summary-box .sb-value {
  font-size: 26px;
  font-weight: bold;
  line-height: 1;
}
.summary-box.green  .sb-value { color: #16a34a; }
.summary-box.red    .sb-value { color: #dc2626; }
.summary-box.yellow .sb-value { color: #d97706; }
.summary-box .sb-sub {
  font-size: 10px;
  color: #64748b;
  margin-top: 2px;
}

/* ── Finding cards ───────────────────────────────────────── */
.finding-card {
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  padding: 12px 14px;
  margin-bottom: 14px;
  page-break-inside: avoid;
}
.finding-card.f-critical { background: #fdf3f3; border-color: #e0b0b0; }
.finding-card.f-high     { background: #fff8f3; border-color: #e0c0a0; }
.finding-card.f-medium   { background: #fffcf0; border-color: #e0d880; }

.fc-badges { margin-bottom: 8px; display: flex; gap: 6px; align-items: center; }
.fc-badge {
  background: #1a2744;
  color: white;
  font-size: 9px;
  font-weight: bold;
  padding: 3px 8px;
  border-radius: 3px;
  display: inline-block;
}
.fc-badge.b-critical { color: #e74c3c; }
.fc-badge.b-high     { color: #d35400; }
.fc-badge.b-medium   { color: #c8a000; }
.fc-badge.b-tag      { color: #94a3b8; font-weight: normal; }

.fc-title {
  font-size: 13px;
  font-weight: bold;
  color: #1a2744;
  margin-bottom: 7px;
}
.fc-label { font-weight: bold; color: #444; }
.fc-text  { font-size: 10.5px; color: #666; margin-bottom: 4px; line-height: 1.5; }
.fc-impact { font-size: 10.5px; color: #d35400; margin-bottom: 4px; line-height: 1.5; }
.fc-impact.critical { color: #c0392b; }
.fc-fix    { font-size: 10.5px; color: #27ae60; margin-bottom: 8px; line-height: 1.5; }
.fc-effort {
  font-size: 9px;
  color: #64748b;
  background: rgba(255,255,255,0.6);
  border-radius: 3px;
  padding: 2px 7px;
  display: inline-block;
  margin-bottom: 7px;
}
.fc-magyarul {
  background: rgba(255,255,255,0.65);
  border-left: 3px solid #d35400;
  padding: 7px 10px;
  border-radius: 0 4px 4px 0;
}
.fc-magyarul.critical { border-left-color: #c0392b; }
.fc-magyarul em { font-size: 10px; color: #555; font-style: italic; }

/* ── Quick wins ─────────────────────────────────────────── */
.quick-win {
  border-left: 4px solid #162440;
  padding: 12px 14px;
  margin-bottom: 12px;
  background: #f8fafc;
  page-break-inside: avoid;
}
.qw-inner { display: flex; align-items: flex-start; gap: 10px; }
.qw-num {
  width: 32px;
  height: 32px;
  background: #162440;
  border-radius: 50%;
  text-align: center;
  line-height: 32px;
  flex-shrink: 0;
  font-size: 16px;
  font-weight: bold;
  color: white;
}
.qw-title { font-size: 12px; font-weight: bold; color: #162440; margin-bottom: 5px; }
.qw-meta  { font-size: 10px; color: #666; }
.qw-meta .qw-type {
  display: inline-block;
  font-size: 9px;
  padding: 1px 7px;
  border-radius: 10px;
  font-weight: bold;
  margin-left: 6px;
}
.qw-type.uzleti    { background: #dbeafe; color: #1d4ed8; }
.qw-type.jogi      { background: #fef3c7; color: #92400e; }
.qw-type.technikai { background: #d1fae5; color: #065f46; }

/* ── Score bar ────────────────────────────────────────────── */
.score-bar-row { margin-bottom: 18px; }
.sb-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}
.sb-name  { font-size: 12px; font-weight: bold; color: #1a2744; }
.sb-score { font-size: 14px; font-weight: bold; }
.sb-track {
  background: #e8ecf0;
  border-radius: 3px;
  height: 8px;
  margin-bottom: 6px;
  overflow: hidden;
}
.sb-fill  { height: 8px; border-radius: 3px; }
.sb-detail { font-size: 9.5px; color: #555; line-height: 1.6; }
.sb-detail .ok  { color: #27ae60; }
.sb-detail .bad { color: #e74c3c; }
.sb-detail .fix { color: #e67e22; }

/* ── Score colors ────────────────────────────────────────── */
.gc-red    { color: #e74c3c; }
.gc-yellow { color: #e67e22; }
.gc-green  { color: #27ae60; }
.fill-red    { background: #e74c3c; }
.fill-yellow { background: #e67e22; }
.fill-green  { background: #27ae60; }

/* ── Code block ─────────────────────────────────────────── */
.code-block {
  background: #1a2744;
  border-radius: 6px;
  padding: 14px 16px;
  font-family: "Courier New", Courier, monospace;
  font-size: 8.5px;
  color: #c8d8f0;
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.5;
  margin-bottom: 14px;
}

/* ── Strength / gap lists ────────────────────────────────── */
.list-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 10.5px;
  line-height: 1.5;
}
.list-item .li-bullet {
  flex-shrink: 0;
  font-size: 13px;
  line-height: 1.2;
}
.list-item.green .li-bullet { color: #27ae60; }
.list-item.red   .li-bullet { color: #e74c3c; }
.list-item.blue  .li-bullet { color: #2563eb; }

/* ── Two-column layout ───────────────────────────────────── */
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.two-col-65 { display: grid; grid-template-columns: 1.6fr 1fr; gap: 20px; }

/* ── CTA box ─────────────────────────────────────────────── */
.cta-box {
  background: #162440;
  border-radius: 8px;
  padding: 20px 24px;
  color: white;
  margin-bottom: 20px;
  text-align: center;
}
.cta-box h3 { font-size: 16px; color: #fff; margin-bottom: 8px; }
.cta-box p  { font-size: 11px; color: #aab4c8; margin-bottom: 12px; line-height: 1.6; }
.cta-email  { font-size: 14px; font-weight: bold; color: #60a5fa; }

/* ── Score summary table (p8) ────────────────────────────── */
.score-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 20px;
}
.score-table th {
  background: #162440;
  color: white;
  font-size: 11px;
  padding: 8px 12px;
  text-align: left;
}
.score-table td {
  padding: 8px 12px;
  font-size: 11px;
  border-bottom: 1px solid #e8ecf0;
  color: #334155;
}
.score-table tr:nth-child(even) td { background: #f8fafc; }
.score-table .td-score { font-weight: bold; font-size: 14px; }

/* ── Compliance mini table ───────────────────────────────── */
.compliance-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 7px 0;
  border-bottom: 1px solid #f1f5f9;
  font-size: 10.5px;
}
.compliance-row:last-child { border-bottom: none; }
.cr-name  { color: #334155; flex: 1; }
.cr-badge {
  font-size: 10px;
  font-weight: bold;
  padding: 2px 10px;
  border-radius: 4px;
}
.cr-pass { background: #d1fae5; color: #065f46; }
.cr-fail { background: #fee2e2; color: #991b1b; }
.cr-warn { background: #fef3c7; color: #92400e; }

/* ── Disclaimer ──────────────────────────────────────────── */
.disclaimer {
  font-size: 8px;
  color: #94a3b8;
  line-height: 1.6;
  padding-top: 10px;
  border-top: 1px solid #e8ecf0;
  margin-top: 16px;
}
</style>
</head>
<body>

<!-- ══════════════════════════════════════════
     OLDAL 1: BORÍTÓ
     ══════════════════════════════════════════ -->
<div class="page dark">

  <div class="cover-header">
    <p class="cover-brand">{{company_name}} &nbsp;·&nbsp; AI Weboldal Audit</p>
    <h1 class="cover-domain">{{brand_name}}</h1>
    <p class="cover-subtitle">{{domain}}</p>
    <p class="cover-subtitle" style="color:#aab4c8;font-size:10px;">{{business_type}} &nbsp;|&nbsp; Audit szint: {{audit_level}}</p>
  </div>

  <!-- SVG Score körök -->
  <div class="cover-circles">
    <!-- GEO / SEO -->
    <svg width="130" height="155" viewBox="0 0 130 155">
      <circle cx="65" cy="65" r="54" fill="#162440" stroke="#e74c3c" stroke-width="5"/>
      <text x="65" y="76" text-anchor="middle" font-family="Arial,sans-serif" font-size="34" font-weight="bold" fill="white">{{geo_score}}</text>
      <text x="65" y="118" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" fill="#aab4c8" letter-spacing="1">GEO /</text>
      <text x="65" y="133" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" fill="#aab4c8">SEO</text>
    </svg>
    <!-- MARKETING -->
    <svg width="130" height="155" viewBox="0 0 130 155">
      <circle cx="65" cy="65" r="54" fill="#162440" stroke="#e67e22" stroke-width="5"/>
      <text x="65" y="76" text-anchor="middle" font-family="Arial,sans-serif" font-size="34" font-weight="bold" fill="white">{{marketing_score}}</text>
      <text x="65" y="118" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" fill="#aab4c8" letter-spacing="1">MARKETING</text>
    </svg>
    <!-- COMPLIANCE -->
    <svg width="130" height="155" viewBox="0 0 130 155">
      <circle cx="65" cy="65" r="54" fill="#162440" stroke="#3b82f6" stroke-width="5"/>
      <text x="65" y="76" text-anchor="middle" font-family="Arial,sans-serif" font-size="34" font-weight="bold" fill="white">{{compliance_score}}</text>
      <text x="65" y="110" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" fill="#aab4c8" letter-spacing="1">COMPLIANCE</text>
      <text x="65" y="126" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" font-weight="bold" fill="#60a5fa">{{compliance_grade}}</text>
    </svg>
  </div>

  <hr class="cover-divider"/>

  <div class="cover-meta">
    <span class="cover-meta-item">Dátum: <strong>{{date}}</strong></span>
    <span class="cover-meta-item">Készítette: <strong>{{company_name}}</strong></span>
    <span class="cover-meta-item">Kapcsolat: <strong>{{contact_email}}</strong></span>
  </div>

  <!-- Erősségek mini lista a borítón -->
  <div style="margin-top: 24px; padding: 16px 20px; background: rgba(255,255,255,0.06); border-radius: 8px;">
    <p style="font-size:10px;color:#aab4c8;text-transform:uppercase;letter-spacing:2px;margin-bottom:10px;">Fő erősségek</p>
    {{#each strengths}}
    <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:6px;">
      <span style="color:#27ae60;font-size:12px;">✓</span>
      <p style="font-size:10.5px;color:#e2e8f0;line-height:1.5;">{{this}}</p>
    </div>
    {{/each}}
  </div>

  <div class="footer">{{date}} &nbsp;·&nbsp; {{domain}} &nbsp;·&nbsp; {{company_name}} — AI-alapú weboldal diagnosztika &nbsp;·&nbsp; 1 / 5</div>
</div>


<!-- ══════════════════════════════════════════
     OLDAL 2: AMIT 2 PERCBEN TUDNIA KELL
     ══════════════════════════════════════════ -->
<div class="page">

  <h2 class="section-title">Amit 2 percben tudnia kell</h2>

  <!-- Laikus összefoglaló -->
  <div style="background:#f8fafc;border-left:4px solid #162440;border-radius:0 6px 6px 0;padding:14px 16px;margin-bottom:20px;">
    <p style="font-size:11px;color:#334155;line-height:1.7;">{{layman_summary}}</p>
  </div>

  <!-- 3 összefoglaló doboz -->
  <div class="summary-grid" style="margin-bottom:20px;">
    <div class="summary-box green">
      <p class="sb-label">GEO / SEO</p>
      <p class="sb-value">{{geo_score}}</p>
      <p class="sb-sub">/100 pont</p>
    </div>
    <div class="summary-box yellow">
      <p class="sb-label">Marketing</p>
      <p class="sb-value">{{marketing_score}}</p>
      <p class="sb-sub">/100 pont</p>
    </div>
    <div class="summary-box red">
      <p class="sb-label">Compliance</p>
      <p class="sb-value">{{compliance_score}}</p>
      <p class="sb-sub">{{compliance_grade}} értékelés</p>
    </div>
  </div>

  <!-- Finding kártyák 1–2 (findings_p2 = slice(0,2) — no @second needed) -->
  {{#each findings_p2}}
  <div class="finding-card {{border_class}}">
    <div class="fc-badges">
      <span class="fc-badge {{sev_class}}">{{severity}}</span>
      <span class="fc-badge b-tag">{{tag}}</span>
    </div>
    <p class="fc-title">{{title}}</p>
    <p class="fc-text"><span class="fc-label">Amit látunk:</span> {{evidence}}</p>
    <p class="fc-text">{{why_problem}}</p>
    <p class="fc-impact"><strong>Üzleti hatás:</strong> {{business_impact}}</p>
    <p class="fc-fix"><strong>Javítás:</strong> {{fix}}</p>
    <span class="fc-effort">⏱ {{fix_effort}} &nbsp;·&nbsp; Prioritás: {{priority}}</span>
  </div>
  {{/each}}

  <div class="footer">{{date}} &nbsp;·&nbsp; {{domain}} &nbsp;·&nbsp; {{company_name}} — AI-alapú weboldal diagnosztika &nbsp;·&nbsp; 2 / 5</div>
</div>


<!-- ══════════════════════════════════════════
     OLDAL 3: FINDINGS 3–5 + QUICK WINS
     ══════════════════════════════════════════ -->
<div class="page">

  <h2 class="section-title">Legfontosabb problémák (folytatás)</h2>

  <!-- findings_p3 = slice(2,6) — max 4 finding, nem overflow -->
  {{#each findings_p3}}
  <div class="finding-card {{border_class}}">
    <div class="fc-badges">
      <span class="fc-badge {{sev_class}}">{{severity}}</span>
      <span class="fc-badge b-tag">{{tag}}</span>
    </div>
    <p class="fc-title">{{title}}</p>
    <p class="fc-text"><span class="fc-label">Amit látunk:</span> {{evidence}}</p>
    <p class="fc-text">{{why_problem}}</p>
    <p class="fc-impact"><strong>Üzleti hatás:</strong> {{business_impact}}</p>
    <p class="fc-fix"><strong>Javítás:</strong> {{fix}}</p>
    <span class="fc-effort">⏱ {{fix_effort}} &nbsp;·&nbsp; Prioritás: {{priority}}</span>
  </div>
  {{/each}}

  <h2 class="section-title" style="margin-top:20px;">3 azonnali teendő</h2>

  {{#each quick_wins}}
  <div class="quick-win">
    <div class="qw-inner">
      <div class="qw-num">{{number}}</div>
      <div>
        <p class="qw-title">{{title}}</p>
        <p class="qw-meta">
          Ki: {{who}} &nbsp;&nbsp; Idő: {{time}} &nbsp;&nbsp; Költség: {{cost}}
          <span class="qw-type {{type}}">{{type}}</span>
        </p>
      </div>
    </div>
  </div>
  {{/each}}

  <!-- Legnagyobb hiányosságok -->
  <div style="margin-top:18px;">
    <p style="font-size:12px;font-weight:bold;color:#162440;margin-bottom:10px;">Legfontosabb hiányosságok</p>
    {{#each biggest_gaps}}
    <div class="list-item red">
      <span class="li-bullet">✗</span>
      <span style="font-size:10.5px;color:#334155;line-height:1.5;">{{this}}</span>
    </div>
    {{/each}}
  </div>

  <div class="footer">{{date}} &nbsp;·&nbsp; {{domain}} &nbsp;·&nbsp; {{company_name}} — AI-alapú weboldal diagnosztika &nbsp;·&nbsp; 3 / 5</div>
</div>


<!-- ══════════════════════════════════════════
     OLDAL 4: COMBINED SCORECARD + METHODOLOGY
     ══════════════════════════════════════════ -->
<div class="page">

  <div class="two-col-65">
    <!-- LEFT: GEO + Marketing kategóriák kompakt -->
    <div>
      <h2 class="section-title" style="font-size:13px;">GEO / SEO Scorecard</h2>
      {{#each geo_categories}}
      <div style="margin-bottom:9px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
          <span style="font-size:10px;color:#334155;font-weight:600;">{{name}}</span>
          <span style="font-size:11px;font-weight:bold;color:#162440;">{{score}}</span>
        </div>
        <div style="background:#e8ecf0;border-radius:3px;height:6px;">
          <div class="sb-fill {{color}}" style="width:{{score}}%;height:6px;border-radius:3px;"></div>
        </div>
        <p style="font-size:8.5px;color:#64748b;margin-top:2px;line-height:1.4;">
          <span style="color:#27ae60;">✓</span> {{boost}} &nbsp;·&nbsp; <span style="color:#e74c3c;">✗</span> {{drag}}
        </p>
      </div>
      {{/each}}

      <h2 class="section-title" style="font-size:13px;margin-top:14px;">Marketing Scorecard</h2>
      {{#each marketing_categories}}
      <div style="margin-bottom:9px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
          <span style="font-size:10px;color:#334155;font-weight:600;">{{name}}</span>
          <span style="font-size:11px;font-weight:bold;color:#162440;">{{score}}</span>
        </div>
        <div style="background:#e8ecf0;border-radius:3px;height:6px;">
          <div class="sb-fill {{color}}" style="width:{{score}}%;height:6px;border-radius:3px;"></div>
        </div>
        <p style="font-size:8.5px;color:#64748b;margin-top:2px;line-height:1.4;">
          <span style="color:#27ae60;">✓</span> {{boost}} &nbsp;·&nbsp; <span style="color:#e74c3c;">✗</span> {{drag}}
        </p>
      </div>
      {{/each}}
    </div>

    <!-- RIGHT: Score methodology + Compliance státusz -->
    <div>
      <!-- Score methodology box -->
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;margin-bottom:14px;">
        <p style="font-size:9.5px;font-weight:bold;color:#162440;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Pontszám módszertan (5×20%)</p>
        {{#each score_methodology}}
        <div style="margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">
            <span style="font-size:9px;color:#475569;">{{label}}</span>
            <span style="font-size:9px;font-weight:bold;color:#162440;">{{score}}/100 &nbsp;<span style="font-size:8px;color:#94a3b8;">({{weight}}%)</span></span>
          </div>
          <div style="background:#e8ecf0;border-radius:2px;height:5px;">
            <div class="sb-fill {{color}}" style="width:{{score}}%;height:5px;border-radius:2px;"></div>
          </div>
        </div>
        {{/each}}
        <p style="font-size:8px;color:#94a3b8;margin-top:8px;border-top:1px solid #e2e8f0;padding-top:6px;">Az összesített pontszám a 3 terület súlyozott átlaga.</p>
      </div>

      <!-- Compliance státusz tábla -->
      <div>
        <p style="font-size:9.5px;font-weight:bold;color:#162440;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Jogi Compliance státusz</p>
        <div style="margin-bottom:6px;padding:8px 10px;background:#f8fafc;border-radius:4px;text-align:center;">
          <span style="font-size:22px;font-weight:bold;color:#162440;">{{compliance_score}}/100</span>
          <span style="font-size:16px;font-weight:bold;color:#2563eb;margin-left:8px;">{{compliance_grade}}</span>
        </div>
        {{#each compliance_frameworks}}
        <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:5px 8px;border-bottom:1px solid #f1f5f9;gap:6px;">
          <span style="font-size:9px;color:#334155;flex:1;">{{name}}</span>
          <span style="font-size:8.5px;font-weight:600;text-align:right;flex-shrink:0;max-width:55%;">{{status}}</span>
        </div>
        {{/each}}
        <div style="margin-top:10px;padding:8px;background:#fff8f3;border:1px solid #fed7aa;border-radius:4px;">
          <p style="font-size:8.5px;color:#92400e;line-height:1.5;">⚠ Automatikus scan — tényleges jogi megfelelőséghez szakértői átvizsgálás szükséges.</p>
        </div>
      </div>
    </div>
  </div>

  <div class="footer">{{date}} &nbsp;·&nbsp; {{domain}} &nbsp;·&nbsp; {{company_name}} — AI-alapú weboldal diagnosztika &nbsp;·&nbsp; 4 / 5</div>
</div>


<!-- ══════════════════════════════════════════
     OLDAL 5: SCHEMA/LLMS UPSELL + CTA + ZÁRÓ
     ══════════════════════════════════════════ -->
<div class="page">

  <!-- Schema + llms.txt — szint1: upsell | szint2: kód -->
  <div style="display:flex;gap:16px;margin-bottom:16px;">
    <div style="flex:1;">
      {{#if schema_code}}
      <h2 class="section-title" style="font-size:13px;">Kész megoldás: Schema Markup (JSON-LD)</h2>
      <p style="font-size:9.5px;color:#64748b;margin-bottom:8px;">Másold be a <code style="background:#f1f5f9;padding:1px 4px;border-radius:3px;">&lt;head&gt;</code> szekciódba, vagy add át a fejlesztőnek. Teszt: search.google.com/test/rich-results</p>
      <div class="code-block" style="font-size:8px;max-height:120px;overflow:hidden;">{{{schema_code}}}</div>
      {{else}}
      <div style="padding:14px 16px;background:linear-gradient(135deg,#f0f7ff,#e8f4fd);border:1px solid #bfdbfe;border-radius:8px;height:100%;">
        <p style="font-size:11px;font-weight:bold;color:#1d4ed8;margin-bottom:6px;">🔒 Schema Markup (JSON-LD) — Szint 2</p>
        <p style="font-size:9.5px;color:#334155;line-height:1.6;margin-bottom:8px;">Az audit azonosította, hogy strukturált adatok hiányoznak. Szint 2 auditban kapsz kész, másolható JSON-LD kódot — a te üzlettípusodra szabva.</p>
        <p style="font-size:9px;color:#1d4ed8;font-weight:bold;">→ Kérd a teljes auditot: {{contact_email}}</p>
      </div>
      {{/if}}
    </div>
    <div style="flex:1;">
      {{#if llms_txt}}
      <h2 class="section-title" style="font-size:13px;">Kész megoldás: llms.txt</h2>
      <p style="font-size:9.5px;color:#64748b;margin-bottom:8px;">Töltsd fel ide: <strong>https://{{domain}}/llms.txt</strong></p>
      <div class="code-block" style="font-size:8px;max-height:120px;overflow:hidden;">{{{llms_txt}}}</div>
      {{else}}
      <div style="padding:14px 16px;background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:1px solid #86efac;border-radius:8px;height:100%;">
        <p style="font-size:11px;font-weight:bold;color:#15803d;margin-bottom:6px;">🔒 llms.txt generálás — Szint 2</p>
        <p style="font-size:9.5px;color:#334155;line-height:1.6;margin-bottom:8px;">AI keresőkre (ChatGPT, Perplexity, Google AI) optimalizált llms.txt fájl — a te weboldaladra szabva, másolásra készen.</p>
        <p style="font-size:9px;color:#15803d;font-weight:bold;">→ Kérd a teljes auditot: {{contact_email}}</p>
      </div>
      {{/if}}
    </div>
  </div>

  <!-- CTA box + audit info -->
  <div style="display:flex;gap:14px;margin-bottom:14px;">
    <div style="flex:1.3;background:#162440;border-radius:8px;padding:16px 18px;">
      <p style="font-size:14px;font-weight:bold;color:white;margin-bottom:6px;">{{company_name}}</p>
      <p style="font-size:9.5px;color:#aab4c8;margin-bottom:10px;">AI-alapú weboldal diagnosztika — Gyors, pontos, cselekvésre kész</p>
      <p style="font-size:11px;color:#60a5fa;margin-bottom:4px;">{{contact_email}}</p>
      {{#if contact_website}}<p style="font-size:10px;color:#94a3b8;">{{contact_website}}</p>{{/if}}
    </div>
    <div style="flex:1;">
      <!-- Score összefoglaló -->
      <table style="width:100%;border-collapse:collapse;font-size:10px;">
        <tr style="background:#f8fafc;">
          <th style="padding:5px 8px;text-align:left;color:#64748b;font-weight:600;font-size:9px;">Terület</th>
          <th style="padding:5px 8px;text-align:center;font-size:9px;color:#64748b;">Pont</th>
          <th style="padding:5px 8px;text-align:center;font-size:9px;color:#64748b;">Értékelés</th>
        </tr>
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:5px 8px;color:#334155;">GEO / SEO</td>
          <td style="padding:5px 8px;text-align:center;font-weight:bold;color:#162440;">{{geo_score}}/100</td>
          <td style="padding:5px 8px;text-align:center;font-size:9px;">{{geo_status_label}}</td>
        </tr>
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:5px 8px;color:#334155;">Marketing</td>
          <td style="padding:5px 8px;text-align:center;font-weight:bold;color:#162440;">{{marketing_score}}/100</td>
          <td style="padding:5px 8px;text-align:center;font-size:9px;">{{marketing_status_label}}</td>
        </tr>
        <tr>
          <td style="padding:5px 8px;color:#334155;">Compliance</td>
          <td style="padding:5px 8px;text-align:center;font-weight:bold;color:#162440;">{{compliance_score}}/100</td>
          <td style="padding:5px 8px;text-align:center;font-size:9px;">{{compliance_grade}} — {{compliance_status_label}}</td>
        </tr>
      </table>
      <!-- Audit meta -->
      <div style="display:flex;gap:8px;margin-top:8px;">
        <div style="flex:1;padding:6px 8px;background:#f8fafc;border-radius:4px;text-align:center;">
          <p style="font-size:8px;color:#64748b;margin-bottom:2px;">Vizsgált oldal</p>
          <p style="font-size:9.5px;font-weight:bold;color:#162440;">{{domain}}</p>
        </div>
        <div style="flex:1;padding:6px 8px;background:#f8fafc;border-radius:4px;text-align:center;">
          <p style="font-size:8px;color:#64748b;margin-bottom:2px;">Dátum</p>
          <p style="font-size:9.5px;font-weight:bold;color:#162440;">{{date}}</p>
        </div>
        <div style="flex:1;padding:6px 8px;background:#f8fafc;border-radius:4px;text-align:center;">
          <p style="font-size:8px;color:#64748b;margin-bottom:2px;">Szint</p>
          <p style="font-size:9.5px;font-weight:bold;color:#162440;">{{audit_level}}</p>
        </div>
      </div>
    </div>
  </div>

  <!-- Mit vizsgált az audit — kompakt 2 oszlopos lista -->
  <div style="background:#f8fafc;border-radius:6px;padding:10px 14px;margin-bottom:12px;">
    <p style="font-size:9px;font-weight:bold;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Mit vizsgált az audit</p>
    <div style="display:flex;gap:20px;">
      <div style="flex:1;">
        <div style="display:flex;gap:5px;margin-bottom:4px;font-size:8.5px;color:#475569;"><span style="color:#27ae60;">✓</span> Canonical URL és domain konzisztencia</div>
        <div style="display:flex;gap:5px;margin-bottom:4px;font-size:8.5px;color:#475569;"><span style="color:#27ae60;">✓</span> Meta title és description</div>
        <div style="display:flex;gap:5px;margin-bottom:4px;font-size:8.5px;color:#475569;"><span style="color:#27ae60;">✓</span> Sitemap.xml és robots.txt</div>
        <div style="display:flex;gap:5px;margin-bottom:4px;font-size:8.5px;color:#475569;"><span style="color:#27ae60;">✓</span> Schema markup (JSON-LD)</div>
        <div style="display:flex;gap:5px;margin-bottom:4px;font-size:8.5px;color:#475569;"><span style="color:#27ae60;">✓</span> HTTPS / SSL, heading struktúra</div>
      </div>
      <div style="flex:1;">
        <div style="display:flex;gap:5px;margin-bottom:4px;font-size:8.5px;color:#475569;"><span style="color:#2563eb;">→</span> Open Graph tagek, kép alt szövegek</div>
        <div style="display:flex;gap:5px;margin-bottom:4px;font-size:8.5px;color:#475569;"><span style="color:#2563eb;">→</span> GA4 / GTM analytics</div>
        <div style="display:flex;gap:5px;margin-bottom:4px;font-size:8.5px;color:#475569;"><span style="color:#2563eb;">→</span> GDPR, Cookie hozzájárulás, impresszum</div>
        <div style="display:flex;gap:5px;margin-bottom:4px;font-size:8.5px;color:#475569;"><span style="color:#2563eb;">→</span> ÁSZF, Magyar jogszabályok</div>
        <div style="display:flex;gap:5px;margin-bottom:4px;font-size:8.5px;color:#475569;"><span style="color:#2563eb;">→</span> Marketing tartalom és CTA elemzés</div>
      </div>
    </div>
  </div>

  <div class="disclaimer" style="font-size:8px;">
    <strong>Jogi nyilatkozat:</strong> Ez az audit automatikus technológiai és compliance scan alapján készült, és tájékoztató jellegű. Nem minősül jogi tanácsadásnak. A compliance értékelés nyilvánosan elérhető weblap-adatokon alapul — tényleges jogszabályi megfelelőséghez szakértői átvizsgálás szükséges. Készítette: {{company_name}} · {{contact_website}}
  </div>

  <div class="footer" style="border-top-color:#e0e0e0;">{{date}} &nbsp;·&nbsp; {{domain}} &nbsp;·&nbsp; {{company_name}} — AI-alapú weboldal diagnosztika &nbsp;·&nbsp; 5 / 5</div>
</div>


</body>
</html>`;
