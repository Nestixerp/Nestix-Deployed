import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Plus, Search, Edit, Trash2, Save, Printer, ArrowLeft, ChevronDown, ChevronRight, Archive, RotateCcw, AlertTriangle, X } from 'lucide-react';
import api from '../services/api';
import { formatDate } from '../utils/dateFormatter';
import {
  getControlledDocumentByModule, buildDocControlFooter,
  buildPrintFooterCss, buildPrintBodyOpen, buildPrintBodyClose,
} from '../utils/documentControl';

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);
const nl2br = (v) => esc(v).replace(/\n/g, '<br/>');

// Risk matrix per QMSF 22 — diagonal lookup (NOT multiplication).
// Row index = 5 - consequence (0=Catastrophic..4=Negligible), col = 'ABCDE'.indexOf(likelihood)
const RISK_MATRIX = [
  [8, 7, 6, 5, 5], // Catastrophic (5)  — note Catas+E intentionally floored at 5 (Medium)
  [7, 6, 5, 4, 3], // Critical    (4)
  [6, 5, 4, 3, 2], // Major       (3)
  [5, 4, 3, 2, 1], // Minor       (2)
  [4, 3, 2, 1, 0], // Negligible  (1)
];
const computeRisk = (c, l) => {
  if (!c || !l) return { score: null, level: null };
  const ci = parseInt(c);
  const li = 'ABCDE'.indexOf(l);
  if (!ci || ci < 1 || ci > 5 || li < 0) return { score: null, level: null };
  const score = RISK_MATRIX[5 - ci][li];
  let level = 'Low';                    // 1, 2, 3 (and 0)
  if (score >= 6) level = 'High';       // 6, 7, 8
  else if (score >= 4) level = 'Medium'; // 4, 5
  return { score, level };
};
const riskBadgeCls = (level) => {
  if (level === 'High') return 'bg-red-100 text-red-800 border-red-300';
  if (level === 'Medium') return 'bg-amber-100 text-amber-800 border-amber-300';
  if (level === 'Low') return 'bg-green-100 text-green-800 border-green-300';
  return 'bg-gray-100 text-gray-500 border-gray-200';
};

const PlantHazardChecks = () => {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [ref, setRef] = useState(null);
  const [openSections, setOpenSections] = useState({});
  const [decomTarget, setDecomTarget] = useState(null); // record being decommissioned
  const [decomForm, setDecomForm] = useState({ decommissioned_date: '', decommissioned_reason: '', decommissioned_by: '' });
  const [teamInput, setTeamInput] = useState(''); // in-progress team member name

  // Two separate Document Control entries: one for the Index/Register (QMSF 35),
  // one for the individual Audit Form (QMSF 26). Each is looked up by its
  // canonical module key so the user can renumber either in the register.

  useEffect(() => {
    fetchAll();
    api.get('/plant-hazard-checks/reference').then(r => setRef(r.data));
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      const [l, s] = await Promise.all([
        api.get('/plant-hazard-checks', { params }),
        api.get('/plant-hazard-checks/stats'),
      ]);
      setItems(l.data.items || []); setStats(s.data || {});
    } finally { setLoading(false); }
  };

  const blankRec = () => {
    const today = new Date().toISOString().slice(0, 10);
    const nextYear = new Date(); nextYear.setFullYear(nextYear.getFullYear() + 1);
    return {
      machine_name: '', area: '', assessment_team: [],
      reason: '', date_of_assessment: today, next_review_date: nextYear.toISOString().slice(0, 10),
      sections: ref ? JSON.parse(JSON.stringify(ref.default_sections)) : [],
      final_comments: '',
      reviewed_date: '', reviewed_by: '',
      signed_by_1: '', signed_by_2: '', signature_date: today,
    };
  };

  const openNew = () => {
    if (!ref) return alert('Reference data still loading. Try again in a second.');
    const fresh = blankRec();
    setEditing(fresh);
    setTeamInput('');
    // Open first 3 sections by default
    const op = {};
    fresh.sections.slice(0, 3).forEach(s => { op[s.code] = true; });
    setOpenSections(op);
  };
  const openEdit = async (it) => {
    const r = await api.get(`/plant-hazard-checks/${it.id}`);
    let rec = r.data;
    // Backwards-compat: if record uses old `hazards` schema, migrate to sections
    if ((!rec.sections || rec.sections.length === 0) && Array.isArray(rec.hazards) && ref) {
      rec = { ...rec, sections: ref.default_sections };
    }
    setEditing(rec);
    setTeamInput('');
    // open all on edit
    const op = {}; (rec.sections || []).forEach(s => { op[s.code] = true; });
    setOpenSections(op);
  };
  const close = () => setEditing(null);

  const updateField = (patch) => setEditing(e => ({ ...e, ...patch }));
  const updateQ = (secIdx, qIdx, patch) => setEditing(e => {
    const sections = e.sections.map((s, i) => {
      if (i !== secIdx) return s;
      const questions = s.questions.map((q, j) => {
        if (j !== qIdx) return q;
        const next = { ...q, ...patch };
        if ('consequence' in patch || 'likelihood' in patch) {
          const { level } = computeRisk(next.consequence, next.likelihood);
          next.risk = level;
        }
        return next;
      });
      return { ...s, questions };
    });
    return { ...e, sections };
  });

  const save = async () => {
    if (!editing.machine_name) return alert('Machine name is required');
    try {
      const payload = { ...editing };
      delete payload.created_at; delete payload.updated_at; delete payload.id; delete payload.phc_no;
      if (editing.id) await api.put(`/plant-hazard-checks/${editing.id}`, payload);
      else await api.post('/plant-hazard-checks', payload);
      close(); fetchAll();
    } catch (e) { alert('Save failed: ' + (e?.response?.data?.detail || e.message)); }
  };

  const remove = async (it) => {
    if (!window.confirm(`Delete PHC-${String(it.phc_no).padStart(2, '0')}?`)) return;
    await api.delete(`/plant-hazard-checks/${it.id}`); fetchAll();
  };

  const openDecommission = (it) => {
    setDecomTarget(it);
    setDecomForm({
      decommissioned_date: new Date().toISOString().slice(0, 10),
      decommissioned_reason: '',
      decommissioned_by: '',
    });
  };
  const confirmDecommission = async () => {
    try {
      await api.post(`/plant-hazard-checks/${decomTarget.id}/decommission`, decomForm);
      setDecomTarget(null); fetchAll();
    } catch (e) { alert('Failed: ' + (e?.response?.data?.detail || e.message)); }
  };
  const reactivate = async (it) => {
    if (!window.confirm(`Reactivate PHC-${String(it.phc_no).padStart(2, '0')} (${it.machine_name})? Review tracking will resume.`)) return;
    await api.post(`/plant-hazard-checks/${it.id}/reactivate`); fetchAll();
  };

  const printIndex = async () => {
    // Pull the Register entry (QMSF 35 by default) from Document Control.
    const doc = await getControlledDocumentByModule('Plant Hazard Check Register', {
      fallback: 'Plant Hazard Checks', docType: 'Register',
    });
    const footer = buildDocControlFooter(doc, {
      title: 'Plant Hazard Check Register / Index', owner: 'Safety Manager',
    });
    const today = new Date().toISOString().slice(0, 10);
    const rows = items.map(it => {
      const decom = it.status === 'decommissioned';
      const overdue = !decom && it.next_review_date && it.next_review_date < today;
      return `<tr class="${decom ? 'decom' : ''}">
        <td>PHC-${String(it.phc_no).padStart(2, '0')}</td>
        <td>${esc(it.machine_name || '')}${decom ? ' <span class="decom-badge">DECOMMISSIONED</span>' : ''}</td>
        <td>${esc(it.area || '')}</td>
        <td>${esc(formatDate(it.date_of_assessment))}</td>
        <td>${esc(formatDate(it.reviewed_date))}</td>
        <td>${esc(it.reviewed_by || '')}</td>
        <td class="${overdue ? 'overdue' : ''}">${decom ? `Not Required — Decommissioned ${esc(formatDate(it.decommissioned_date))}` : `${esc(formatDate(it.next_review_date))}${overdue ? ' ⚠️' : ''}`}</td>
      </tr>`;
    }).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>PHC Register</title>
      <style>
        ${buildPrintFooterCss()}
        @page { size: A4 landscape; margin: 10mm 12mm 18mm 12mm; }
        body { font-family: Arial, sans-serif; font-size: 10pt; color: #111; margin: 0; }
        h1 { font-size: 14pt; margin: 0 0 2mm 0; color:#1f2937; }
        .meta { font-size:9pt; color:#555; margin-bottom: 3mm; }
        table.data-tbl { width: 100%; border-collapse: collapse; }
        table.data-tbl th, table.data-tbl td { border: 1px solid #444; padding: 4px 6px; vertical-align: top; }
        table.data-tbl th { background: #1f2937; color: #fff; text-align: left; font-size: 9pt; }
        table.data-tbl tr:nth-child(even) td { background: #f7f7f7; }
        table.data-tbl td.overdue { color: #b91c1c; font-weight: 700; }
        table.data-tbl tr.decom td { color: #6b7280; background: #f3f4f6 !important; }
        .decom-badge { display:inline-block; border:1px solid #6b7280; color:#374151; font-size:7pt; font-weight:700; padding:0 3px; border-radius:3px; margin-left:4px; vertical-align:middle; }
      </style></head><body>${buildPrintBodyOpen(footer)}
      <h1>Plant Hazard Check Register / Index</h1>
      <div class="meta">${items.length} assessment(s) on file · printed ${esc(formatDate(today))}</div>
      <table class="data-tbl"><thead><tr>
        <th style="width:8%">PHC #</th><th style="width:24%">Machine</th><th style="width:14%">Area</th>
        <th style="width:10%">Date</th><th style="width:11%">Last Reviewed</th>
        <th style="width:18%">Reviewed By</th><th style="width:15%">Next Review</th>
      </tr></thead><tbody>${rows || `<tr><td colspan="7" style="text-align:center;color:#888;padding:6mm;">No assessments on file.</td></tr>`}</tbody></table>
      ${buildPrintBodyClose()}
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) return alert('Popup blocked. Please allow popups for this site.');
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch (_) { /* blocked */ } }, 400);
  };

  const printOne = async (rec) => {
    const doc = await getControlledDocumentByModule('Plant Hazard Audit Form', { fallback: 'Plant Hazard Checks', docType: 'Form' });
    const footer = buildDocControlFooter(doc, {
      title: `Plant Hazard Check List — PHC-${String(rec.phc_no).padStart(2, '0')}`,
    });
    const ra = rec.risk_assessment_no || rec.phc_no;
    const sections = rec.sections || [];
    // Section P treated specially (Question / Yes-No / Comments)
    const sectionsAtoO = sections.filter(s => s.code !== 'P');
    const sectionP = sections.find(s => s.code === 'P');

    // Cover-page tables
    const consTable = `<table class="ref"><thead><tr><th>Level</th><th>Descriptor</th><th>Measures of Potential Consequence</th></tr></thead><tbody>${
      (ref?.consequence_levels || []).map(c => `<tr><td class="ctr">${c.level}</td><td>${esc(c.descriptor)}</td><td>${esc(c.measure)}</td></tr>`).join('')
    }</tbody></table>`;
    const likTable = `<table class="ref"><thead><tr><th>Level</th><th>Descriptor</th><th>Measures of Potential Likelihood</th></tr></thead><tbody>${
      (ref?.likelihood_levels || []).map(l => `<tr><td class="ctr">${l.code}</td><td>${esc(l.descriptor)}</td><td>${esc(l.measure)}</td></tr>`).join('')
    }</tbody></table>`;
    // 5x5 colour matrix mirroring the doc (rows: Cat..Neg, cols: A..E)
    const matrixRows = [
      { d: 'Catastrophic', c: 5 }, { d: 'Critical', c: 4 }, { d: 'Major', c: 3 },
      { d: 'Minor', c: 2 }, { d: 'Negligible', c: 1 },
    ];
    const cellBg = (score) => {
      if (score >= 6) return '#f87171'; // red — High
      if (score >= 4) return '#fb923c'; // orange — Medium
      if (score >= 1) return '#fde047'; // yellow — Low
      return '#fef9c3';                  // very light yellow — 0
    };
    const matrix = `<table class="matrix"><thead><tr><th>CONSEQUENCES</th><th></th><th colspan="5">LIKELIHOOD →</th></tr><tr><th>Descriptors</th><th></th><th>Frequent</th><th>Reasonably Probable</th><th>Occasional</th><th>Remote</th><th>Rare</th></tr><tr><th></th><th></th><th>A</th><th>B</th><th>C</th><th>D</th><th>E</th></tr></thead><tbody>${
      matrixRows.map(r => `<tr><td>${r.d}</td><td class="ctr">${r.c}</td>${
        ['A','B','C','D','E'].map(l => { const { score: sc } = computeRisk(r.c, l); return `<td class="ctr" style="background:${cellBg(sc)};font-weight:700;">${sc}</td>`; }).join('')
      }</tr>`).join('')
    }</tbody></table>`;
    const ragTable = `<table class="ref"><tbody>${
      (ref?.risk_action_guideline || []).map(r => {
        const bg = r.level.startsWith('High') ? '#f87171' : r.level.startsWith('Medium') ? '#fb923c' : '#fde047';
        return `<tr><td style="background:${bg};font-weight:700;text-align:center;width:18%;">Score = ${esc(r.score)}</td><td style="width:22%;font-weight:600;">${esc(r.level)}</td><td>${esc(r.action)}</td></tr>`;
      }).join('')
    }</tbody></table>`;

    // Intro page
    const hoC = (ref?.hierarchy_of_controls || []).map(h => `<p><strong>${esc(h.name)}</strong> ${esc(h.description)}</p>`).join('');

    // Hazard sections A-O
    const renderHazardSec = (s) => {
      const rows = (s.questions || []).map(q => {
        const { score } = computeRisk(q.consequence, q.likelihood);
        const riskTxt = q.risk ? `${q.risk}${score != null ? ' ' + score : ''}` : (q.applies === 'No' || q.applies === 'N/A' ? '' : '');
        return `<tr><td class="qcell">${esc(q.question)}</td><td class="ctr">${esc(q.applies || '')}</td><td class="ctr">${q.consequence ? esc(['Negligible','Minor','Major','Critical','Catastrophic'][q.consequence-1]) : ''}</td><td class="ctr">${q.likelihood ? esc({A:'Frequent',B:'Reasonably Probable',C:'Occasional',D:'Remote',E:'Rare'}[q.likelihood]) : ''}</td><td class="ctr">${esc(riskTxt)}</td><td>${esc(q.controls || '')}</td></tr>`;
      }).join('');
      return `<div class="haz-sec"><h3>${esc(s.code)} – ${esc(s.name)}</h3>${s.prompt ? `<p class="prompt"><em>${esc(s.prompt)}</em></p>` : ''}<table class="hazards"><thead><tr><th style="width:34%">Hazard</th><th style="width:8%">YES / NO</th><th style="width:13%">Consequence</th><th style="width:13%">Likelihood</th><th style="width:10%">Risk</th><th style="width:22%">Controls</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    };

    const pTable = sectionP ? `<div class="haz-sec"><h3>P – TECHNICAL DATA</h3><table class="hazards"><thead><tr><th style="width:55%">QUESTION</th><th style="width:15%">YES / NO</th><th>COMMENTS</th></tr></thead><tbody>${
      (sectionP.questions || []).map(q => `<tr><td>${esc(q.question)}</td><td class="ctr">${esc(q.applies || '')}</td><td>${esc(q.comments || q.controls || '')}</td></tr>`).join('')
    }</tbody></table></div>` : '';

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
      <title>PHC-${rec.phc_no}</title>
      <style>${buildPrintFooterCss()}
        @page { size: A4 portrait; margin: 10mm 10mm 14mm 10mm; }
        body { font-size: 9.5pt; color: #111; font-family: Arial, sans-serif; }
        h1 { font-size: 16pt; margin: 0 0 2mm 0; text-align: center; color: #f87171; font-weight: 700; }
        h2 { font-size: 12pt; margin: 4mm 0 2mm 0; text-align: center; color: #ef4444; }
        h3 { font-size: 10.5pt; margin: 4mm 0 1mm 0; font-weight: 700; }
        .meta { width: 100%; border-collapse: collapse; margin: 3mm 0; }
        .meta td { border: 1px solid #333; padding: 3px 6px; font-size: 10pt; }
        .meta td:first-child { font-weight: 700; width: 30%; background: #fafafa; }
        table.ref, table.hazards, table.matrix { width: 100%; border-collapse: collapse; margin: 2mm 0; }
        table.ref td, table.ref th, table.hazards td, table.hazards th, table.matrix td, table.matrix th { border: 1px solid #333; padding: 3px 5px; font-size: 8.5pt; vertical-align: top; }
        table.ref th, table.hazards th, table.matrix th { background: #f3f4f6; font-weight: 700; }
        .ctr { text-align: center; }
        .qcell { font-size: 8pt; }
        .prompt { margin: 1mm 0 2mm 0; font-size: 9pt; }
        .haz-sec { page-break-inside: avoid; break-inside: avoid; margin-bottom: 4mm; }
        .haz-sec table.hazards { page-break-inside: avoid; break-inside: avoid; }
        .signoff-block { page-break-inside: avoid; break-inside: avoid; }
        .ra { font-weight: 700; margin: 2mm 0; }
        .note-yes { font-style: italic; font-size: 9pt; margin: 2mm 0 4mm 0; }
        .sig-line { border-bottom: 1px solid #111; min-height: 8mm; width: 70mm; display: inline-block; margin-left: 2mm; }
        .pagebreak { page-break-before: always; }
        ul { margin: 1mm 0 2mm 5mm; padding: 0; }
        ul li { margin-bottom: 1mm; font-size: 9.5pt; }
        p { margin: 1.5mm 0; font-size: 9.5pt; line-height: 1.4; }
      </style></head><body>
      ${buildPrintBodyOpen(footer)}

      <!-- ====== PAGE 1: COVER + RISK MATRIX ====== -->
      <h1>PLANT HAZARD CHECK LIST</h1>
      ${rec.status === 'decommissioned' ? `<div style="border:2px solid #6b7280;background:#f3f4f6;padding:3mm 4mm;margin:2mm 0 3mm 0;text-align:center;">
        <div style="font-size:12pt;font-weight:700;color:#374151;letter-spacing:1px;">MACHINE DECOMMISSIONED — REVIEW NO LONGER REQUIRED</div>
        <div style="font-size:9pt;color:#4b5563;margin-top:1mm;">Decommissioned: ${esc(formatDate(rec.decommissioned_date))}${rec.decommissioned_by ? ` &nbsp;·&nbsp; Marked by: ${esc(rec.decommissioned_by)}` : ''}${rec.decommissioned_reason ? `<br/>Reason: ${esc(rec.decommissioned_reason)}` : ''}</div>
      </div>` : ''}
      <div class="ra">Risk Assessment #: ${esc(ra)}</div>
      <table class="meta">
        <tr><td>Area</td><td>${esc(rec.area || '')}</td></tr>
        <tr><td>Machine</td><td>${esc(rec.machine_name || '')}</td></tr>
        <tr><td>Date</td><td>${esc(formatDate(rec.date_of_assessment))}</td></tr>
        <tr><td>Risk Assessment Team</td><td>${esc((rec.assessment_team || []).join(' / '))}</td></tr>
        <tr><td>Reason for Assessment</td><td>${esc(rec.reason || '')}</td></tr>
      </table>
      <p>Use the following tables to assess the identified risk and recommend corrective actions to correct any unacceptable risks found.</p>
      <h3>Determine the outcome should risk occur.</h3>
      ${consTable}
      <h3>Determine the likelihood of each identified risk occurring</h3>
      ${likTable}
      <h3>Place the 2 co-efficient on Matrix as below and rate the risk.</h3>
      ${matrix}
      <h3>Risk Action Guideline</h3>
      ${ragTable}

      <!-- ====== PAGE 2: INTRODUCTION ====== -->
      <div class="pagebreak"></div>
      <h1>PLANT HAZARD CHECK LIST</h1>
      <h2>INTRODUCTION</h2>
      <p>This checklist provides a typical range of questions that can be asked to help with the identification of hazards associated with the plant. It may be used as a starting point, with certain questions added or deleted to make the checklist appropriate to the plant and associated systems of work being examined.</p>
      <p>If "YES" is the answer to a question in the checklist, the plant, parts of the plant and / or the situation associated with the hazard, required controls should be identified and the risk assessed.</p>
      <p>The following are examples of hazards identified and recorded in checklists</p>
      <ul>
        <li>Someone's fingers may get caught in the bending operation</li>
        <li>People may trip over electric power leads for grinders etc.</li>
        <li>Someone's hands may get cut on the guillotine</li>
        <li>A part may be ejected from the machine and damage the operator's eyesight</li>
      </ul>
      <p>When completing the checklist, consider the hazards that may affect:</p>
      <ul>
        <li>Plant Operators</li>
        <li>Anyone working, or in the vicinity of the plant</li>
        <li>Others who could be affected, such as visitors, contractors etc.</li>
      </ul>
      <p><strong>Refer to the following Hierarchy of controls with preference given to the upper controls to develop your action plan</strong></p>
      ${hoC}

      <!-- ====== HAZARD SECTIONS A-O — flow continuously, tables kept whole ====== -->
      <div class="pagebreak"></div>
      <h1>PLANT HAZARD CHECK LIST</h1>
      <p class="note-yes">Note: If "YES" is the answer to a question in the checklist, the plant, parts of the plant and / or the situation associated with the hazard, required controls should be identified and the Risk assessed.</p>
      ${sectionsAtoO.map((s) => renderHazardSec(s)).join('')}

      <!-- ====== SECTION P + COMMENTS + SIGN-OFF (flows after sections) ====== -->
      ${pTable}
      <div class="signoff-block">
        <h3>Comments:</h3>
        <div style="min-height:30mm;border:1px solid transparent;">${nl2br(rec.final_comments || '')}</div>
        <table class="meta" style="margin-top:4mm;">
          <tr><td>Reviewed By</td><td>${esc(rec.reviewed_by || '')}</td><td>Reviewed Date</td><td>${esc(formatDate(rec.reviewed_date))}</td></tr>
          <tr><td>Next Review Date</td><td colspan="3">${rec.status === 'decommissioned' ? `Not Required — Machine Decommissioned ${esc(formatDate(rec.decommissioned_date))}` : esc(formatDate(rec.next_review_date))}</td></tr>
        </table>
        <div style="margin-top:6mm;">
          <p><strong>Signed</strong> <span class="sig-line">${esc(rec.signed_by_1 || '')}</span></p>
          <p><strong>Signed</strong> <span class="sig-line">${esc(rec.signed_by_2 || '')}</span></p>
          <p style="margin-top:6mm;"><strong>Date:</strong> ${esc(formatDate(rec.signature_date))}</p>
        </div>
      </div>
      ${buildPrintBodyClose()}
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) return alert('Print popup blocked. Please allow popups for this site.');
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch (_) { /* blocked */ } }, 400);
  };

  // ---------- EDITING FORM ----------
  if (editing) {
    const team = editing.assessment_team || [];
    const addTeamMember = () => {
      // Support pasting "Name1, Name2" — split on commas
      const names = teamInput.split(',').map(t => t.trim()).filter(Boolean);
      if (names.length === 0) return;
      const merged = [...team];
      names.forEach(n => { if (!merged.some(m => m.toLowerCase() === n.toLowerCase())) merged.push(n); });
      updateField({ assessment_team: merged });
      setTeamInput('');
    };
    const removeTeamMember = (idx) => updateField({ assessment_team: team.filter((_, i) => i !== idx) });
    const teamKeyDown = (e) => {
      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTeamMember(); }
      else if (e.key === 'Backspace' && teamInput === '' && team.length > 0) { removeTeamMember(team.length - 1); }
    };
    const toggleSec = (code) => setOpenSections(o => ({ ...o, [code]: !o[code] }));
    const sectionStat = (s) => {
      const total = (s.questions || []).length;
      const answered = (s.questions || []).filter(q => q.applies).length;
      return `${answered}/${total}`;
    };

    return (
      <div className="p-6 max-w-7xl mx-auto space-y-4" data-testid="phc-form-page">
        <div className="flex justify-between items-center flex-wrap gap-3">
          <div>
            <button onClick={close} className="text-sm text-blue-600 hover:underline mb-1 inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Back</button>
            <h1 className="text-2xl font-bold">{editing.id ? `PHC-${String(editing.phc_no).padStart(2,'0')} — ${editing.machine_name}` : 'New Plant Hazard Check'}</h1>
          </div>
          <div className="flex gap-2">
            {editing.id && <Button variant="outline" onClick={() => printOne(editing)} data-testid="phc-print"><Printer className="w-4 h-4 mr-1" /> Print 11-page Report</Button>}
            <Button onClick={save} data-testid="phc-save"><Save className="w-4 h-4 mr-1" /> Save</Button>
          </div>
        </div>

        {editing.status === 'decommissioned' && (
          <div className="border-2 border-gray-400 bg-gray-100 rounded-md px-4 py-3 flex items-start gap-3" data-testid="phc-decom-banner">
            <AlertTriangle className="w-5 h-5 text-gray-600 mt-0.5 shrink-0" />
            <div>
              <div className="font-bold text-gray-800 tracking-wide">MACHINE DECOMMISSIONED — Review No Longer Required</div>
              <div className="text-sm text-gray-600 mt-0.5">
                Decommissioned {formatDate(editing.decommissioned_date)}
                {editing.decommissioned_by ? ` · Marked by ${editing.decommissioned_by}` : ''}
                {editing.decommissioned_reason ? ` · Reason: ${editing.decommissioned_reason}` : ''}
              </div>
            </div>
          </div>
        )}

        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Assessment Details</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><Label>Machine *</Label><Input value={editing.machine_name} onChange={e => updateField({ machine_name: e.target.value })} data-testid="phc-machine" /></div>
            <div><Label>Area</Label><Input value={editing.area || ''} onChange={e => updateField({ area: e.target.value })} /></div>
            <div><Label>Reason for Assessment</Label><Input value={editing.reason || ''} onChange={e => updateField({ reason: e.target.value })} placeholder="e.g. Review / New plant / Incident" /></div>
            <div><Label>Date of Assessment</Label><Input type="date" value={editing.date_of_assessment || ''} onChange={e => updateField({ date_of_assessment: e.target.value })} /></div>
            <div><Label>Next Review Date</Label><Input type="date" value={editing.next_review_date || ''} onChange={e => updateField({ next_review_date: e.target.value })} /></div>
            <div><Label>Risk Assessment #</Label><Input type="number" value={editing.risk_assessment_no ?? ''} onChange={e => updateField({ risk_assessment_no: e.target.value ? parseInt(e.target.value) : null })} placeholder="(auto from PHC #)" /></div>
            <div className="md:col-span-3">
              <Label>Risk Assessment Team</Label>
              <div className="flex flex-wrap items-center gap-1.5 border rounded-md px-2 py-1.5 min-h-[42px] bg-white focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1" data-testid="phc-team-editor">
                {team.map((name, idx) => (
                  <span key={idx} className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 border border-blue-200 rounded-full pl-2.5 pr-1 py-0.5 text-sm" data-testid={`phc-team-chip-${idx}`}>
                    {name}
                    <button type="button" onClick={() => removeTeamMember(idx)} className="rounded-full hover:bg-blue-200 p-0.5" title={`Remove ${name}`} data-testid={`phc-team-remove-${idx}`}>
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                <input
                  className="flex-1 min-w-[160px] outline-none border-none bg-transparent text-sm h-7 px-1"
                  value={teamInput}
                  onChange={e => setTeamInput(e.target.value)}
                  onKeyDown={teamKeyDown}
                  onBlur={addTeamMember}
                  placeholder={team.length === 0 ? 'Type a name, then press Enter or Add' : 'Add another name…'}
                  data-testid="phc-team"
                />
                <Button type="button" size="sm" variant="outline" onClick={addTeamMember} disabled={!teamInput.trim()} className="h-7" data-testid="phc-team-add">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add
                </Button>
              </div>
              <p className="text-xs text-gray-500 mt-1">Type each name and press Enter (or click Add). Click ✕ on a name to remove it.</p>
            </div>
          </CardContent></Card>

        {(editing.sections || []).map((sec, sIdx) => (
          <Card key={sec.code} data-testid={`phc-section-${sec.code}`}>
            <CardHeader className="pb-2 cursor-pointer select-none" onClick={() => toggleSec(sec.code)}>
              <CardTitle className="text-base flex items-center gap-2">
                {openSections[sec.code] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-sm">{sec.code}</span>
                <span>{sec.name}</span>
                <span className="ml-auto text-xs text-gray-500">{sectionStat(sec)}</span>
              </CardTitle>
              {sec.prompt && <p className="text-xs text-gray-600 italic mt-1 ml-6">{sec.prompt}</p>}
            </CardHeader>
            {openSections[sec.code] && (
              <CardContent>
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left p-2 border w-1/3">Hazard / Question</th>
                      <th className="text-left p-2 border w-24">Applies?</th>
                      <th className="text-left p-2 border w-24">Consequence</th>
                      <th className="text-left p-2 border w-24">Likelihood</th>
                      <th className="text-left p-2 border w-20">Risk</th>
                      <th className="text-left p-2 border">{sec.code === 'P' ? 'Comments' : 'Controls'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(sec.questions || []).map((q, qIdx) => {
                      const { score } = computeRisk(q.consequence, q.likelihood);
                      const cls = riskBadgeCls(q.risk);
                      return (
                        <tr key={qIdx}>
                          <td className="p-2 border align-top">{q.n}) {q.question}</td>
                          <td className="p-2 border align-top">
                            <select className="border rounded h-8 px-1 w-full text-xs" value={q.applies || ''} onChange={e => updateQ(sIdx, qIdx, { applies: e.target.value || null })} data-testid={`phc-q-applies-${sec.code}-${q.n}`}>
                              <option value="">—</option>
                              <option>Yes</option><option>No</option><option>N/A</option>
                            </select>
                          </td>
                          {sec.code !== 'P' ? <>
                            <td className="p-2 border align-top">
                              <select className="border rounded h-8 px-1 w-full text-xs" value={q.consequence || ''} disabled={q.applies !== 'Yes'} onChange={e => updateQ(sIdx, qIdx, { consequence: e.target.value ? parseInt(e.target.value) : null })}>
                                <option value="">—</option>
                                {[1,2,3,4,5].map(n => <option key={n} value={n}>{n} {['Negligible','Minor','Major','Critical','Catastrophic'][n-1]}</option>)}
                              </select>
                            </td>
                            <td className="p-2 border align-top">
                              <select className="border rounded h-8 px-1 w-full text-xs" value={q.likelihood || ''} disabled={q.applies !== 'Yes'} onChange={e => updateQ(sIdx, qIdx, { likelihood: e.target.value || null })}>
                                <option value="">—</option>
                                <option value="A">A Frequent</option><option value="B">B Probable</option><option value="C">C Occasional</option><option value="D">D Remote</option><option value="E">E Rare</option>
                              </select>
                            </td>
                            <td className="p-2 border align-top text-center">
                              {q.risk ? <span className={`inline-block px-2 py-0.5 rounded border text-[10px] font-bold ${cls}`}>{q.risk}{score != null ? ` ${score}` : ''}</span> : <span className="text-gray-300">—</span>}
                            </td>
                          </> : <td colSpan={3} className="p-2 border align-top text-center text-gray-300">—</td>}
                          <td className="p-2 border align-top">
                            {sec.code === 'P'
                              ? <Input value={q.comments || ''} onChange={e => updateQ(sIdx, qIdx, { comments: e.target.value })} className="h-8 text-xs" placeholder="e.g. S.O.P." />
                              : <Input value={q.controls || ''} onChange={e => updateQ(sIdx, qIdx, { controls: e.target.value })} className="h-8 text-xs" placeholder={q.applies === 'Yes' ? 'Control measures…' : ''} disabled={q.applies !== 'Yes'} />
                            }
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            )}
          </Card>
        ))}

        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Final Comments</CardTitle></CardHeader>
          <CardContent>
            <Textarea rows={6} value={editing.final_comments || ''} onChange={e => updateField({ final_comments: e.target.value })} placeholder="Roll-up of all key controls / observations — appears on Page 11 of the printed report." data-testid="phc-final-comments" />
          </CardContent></Card>

        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Review Record</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><Label>Reviewed By</Label><Input value={editing.reviewed_by || ''} onChange={e => updateField({ reviewed_by: e.target.value })} placeholder="Name of reviewer" data-testid="phc-reviewed-by" /></div>
            <div><Label>Reviewed Date</Label><Input type="date" value={editing.reviewed_date || ''} onChange={e => updateField({ reviewed_date: e.target.value })} data-testid="phc-reviewed-date" /></div>
            <div><Label>Next Review Date</Label><Input type="date" value={editing.next_review_date || ''} onChange={e => updateField({ next_review_date: e.target.value })} /></div>
          </CardContent></Card>

        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Sign-off</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><Label>Signed By #1</Label><Input value={editing.signed_by_1 || ''} onChange={e => updateField({ signed_by_1: e.target.value })} data-testid="phc-sig1" /></div>
            <div><Label>Signed By #2</Label><Input value={editing.signed_by_2 || ''} onChange={e => updateField({ signed_by_2: e.target.value })} data-testid="phc-sig2" /></div>
            <div><Label>Signature Date</Label><Input type="date" value={editing.signature_date || ''} onChange={e => updateField({ signature_date: e.target.value })} /></div>
          </CardContent></Card>
      </div>
    );
  }

  // ---------- REGISTER LIST ----------
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" data-testid="phc-page">
      <div className="flex justify-between items-end flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">Plant Hazard Checks / Risk Assessments</h1>
          <p className="text-gray-600 text-sm mt-1">11-page ISO audit checklist</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={printIndex} data-testid="phc-print-index"><Printer className="w-4 h-4 mr-1" /> Print Index</Button>
          <Button onClick={openNew} data-testid="phc-new"><Plus className="w-4 h-4 mr-1" /> New Assessment</Button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card className="border-l-4 border-l-blue-600"><CardContent className="pt-4 pb-3"><div className="text-xs text-gray-500">Total Assessments</div><div className="text-3xl font-bold text-blue-700" data-testid="phc-stat-total">{stats.total}</div></CardContent></Card>
          <Card className="border-l-4 border-l-red-600"><CardContent className="pt-4 pb-3"><div className="text-xs text-gray-500">Overdue for Review</div><div className="text-3xl font-bold text-red-700" data-testid="phc-stat-overdue">{stats.overdue_for_review}</div></CardContent></Card>
          <Card className="border-l-4 border-l-gray-500"><CardContent className="pt-4 pb-3"><div className="text-xs text-gray-500">Decommissioned</div><div className="text-3xl font-bold text-gray-600" data-testid="phc-stat-decommissioned">{stats.decommissioned || 0}</div></CardContent></Card>
        </div>
      )}

      {/* Risk Heatmap */}
      <Card data-testid="phc-heatmap-card">
        <CardHeader className="pb-2"><CardTitle className="text-base">Risk Heatmap — Plant-wide Exposure</CardTitle>
          <p className="text-xs text-gray-500">Counts of applicable hazards (Applies = Yes) across all assessments and sub-questions. Decommissioned machines excluded.</p>
        </CardHeader>
        <CardContent>
          {(() => {
            const grid = Array.from({ length: 5 }, () => [0, 0, 0, 0, 0]);
            (items || []).filter(rec => rec.status !== 'decommissioned').forEach(rec => {
              const allQ = (rec.sections || []).flatMap(s => s.questions || []).concat(rec.hazards || []);
              allQ.forEach(q => {
                if (q.applies !== 'Yes') return;
                const c = parseInt(q.consequence);
                const li = 'ABCDE'.indexOf(q.likelihood);
                if (!c || c < 1 || c > 5 || li < 0) return;
                grid[5 - c][li] += 1;
              });
            });
            const cellColor = (c, li) => {
              const { score } = computeRisk(c, 'ABCDE'[li]);
              if (score == null) return 'bg-gray-50 text-gray-500';
              if (score >= 6) return 'bg-red-200 text-red-900';
              if (score >= 4) return 'bg-orange-200 text-orange-900';
              if (score >= 1) return 'bg-yellow-200 text-yellow-900';
              return 'bg-green-50 text-green-700';
            };
            return (
              <div className="overflow-x-auto">
                <table className="border-collapse mx-auto" data-testid="phc-heatmap-table">
                  <thead><tr><th></th><th className="p-2 text-xs" colSpan={5}>Likelihood →</th></tr>
                    <tr><th className="p-2 text-xs text-gray-500">Consequence ↓</th>
                      {['A — Frequent','B — Probable','C — Occasional','D — Remote','E — Rare'].map(l => <th key={l} className="p-2 text-xs font-semibold border bg-gray-50 w-24">{l}</th>)}
                    </tr></thead>
                  <tbody>
                    {[5,4,3,2,1].map((cVal, rIdx) => (
                      <tr key={cVal}>
                        <th className="p-2 text-xs font-semibold border bg-gray-50 text-right whitespace-nowrap">{cVal} — {['Negligible','Minor','Major','Critical','Catastrophic'][cVal-1]}</th>
                        {[0,1,2,3,4].map(li => {
                          const count = grid[rIdx][li];
                          return <td key={li} className={`border text-center font-bold text-lg p-3 ${cellColor(cVal, li)} ${count === 0 ? 'opacity-40' : ''}`} data-testid={`phc-heatmap-c${cVal}-l${'ABCDE'[li]}`}>{count}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="text-xs text-gray-500 mt-2 text-center">
                  <span className="inline-block bg-yellow-200 px-2 py-0.5 rounded mr-2">Low (1-3)</span>
                  <span className="inline-block bg-orange-200 px-2 py-0.5 rounded mr-2">Medium (4-5)</span>
                  <span className="inline-block bg-red-200 px-2 py-0.5 rounded">High (6-8) — Requires Corrective Action</span>
                </div>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 flex gap-3 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]"><Label className="text-xs">Search</Label><Input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchAll()} placeholder="Machine, area, reason…" data-testid="phc-search" /></div>
          <Button onClick={fetchAll}><Search className="w-4 h-4 mr-1" /> Apply</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle>{items.length} record{items.length === 1 ? '' : 's'}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50"><tr>
              <th className="text-left p-2 border">PHC #</th><th className="text-left p-2 border">Machine</th>
              <th className="text-left p-2 border">Area</th><th className="text-left p-2 border">Date</th>
              <th className="text-left p-2 border">Last Reviewed</th>
              <th className="text-left p-2 border">By</th>
              <th className="text-left p-2 border">Next Review</th><th className="text-left p-2 border w-32">Actions</th>
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={8} className="text-center text-gray-500 py-6">Loading…</td></tr>}
              {!loading && items.length === 0 && <tr><td colSpan={8} className="text-center text-gray-500 py-6">No assessments yet.</td></tr>}
              {items.map(it => {
                const today = new Date().toISOString().slice(0, 10);
                const decom = it.status === 'decommissioned';
                const nextOverdue = !decom && it.next_review_date && it.next_review_date < today;
                return (
                <tr key={it.id} className={decom ? 'bg-gray-100 text-gray-400' : 'hover:bg-gray-50'}>
                  <td className="p-2 border font-mono font-bold">PHC-{String(it.phc_no).padStart(2, '0')}</td>
                  <td className="p-2 border">
                    {it.machine_name}
                    {decom && <span className="ml-2 inline-block text-[10px] font-bold border border-gray-400 text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded align-middle" data-testid={`phc-decom-badge-${it.id}`}>DECOMMISSIONED</span>}
                  </td>
                  <td className="p-2 border">{it.area || ''}</td>
                  <td className="p-2 border">{formatDate(it.date_of_assessment)}</td>
                  <td className="p-2 border">{formatDate(it.reviewed_date)}</td>
                  <td className="p-2 border text-xs">{it.reviewed_by || ''}</td>
                  <td className={`p-2 border ${nextOverdue ? 'text-red-600 font-semibold' : ''}`} title={decom ? `Decommissioned ${formatDate(it.decommissioned_date)}${it.decommissioned_reason ? ' — ' + it.decommissioned_reason : ''}` : (nextOverdue ? 'Overdue for review' : '')}>
                    {decom ? <span className="text-xs italic">Not Required</span> : formatDate(it.next_review_date)}
                  </td>
                  <td className="p-2 border whitespace-nowrap">
                    <button onClick={() => openEdit(it)} className="text-blue-600 hover:underline mr-2" title="Edit / View" data-testid={`phc-edit-${it.id}`}><Edit className="w-4 h-4 inline" /></button>
                    {decom
                      ? <button onClick={() => reactivate(it)} className="text-green-600 hover:underline mr-2" title="Reactivate machine" data-testid={`phc-reactivate-${it.id}`}><RotateCcw className="w-4 h-4 inline" /></button>
                      : <button onClick={() => openDecommission(it)} className="text-gray-600 hover:underline mr-2" title="Mark machine decommissioned" data-testid={`phc-decommission-${it.id}`}><Archive className="w-4 h-4 inline" /></button>}
                    <button onClick={() => remove(it)} className="text-red-600 hover:underline" data-testid={`phc-delete-${it.id}`}><Trash2 className="w-4 h-4 inline" /></button>
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {decomTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" data-testid="phc-decom-dialog">
          <Card className="w-full max-w-md shadow-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Archive className="w-5 h-5 text-gray-600" />
                Mark Machine Decommissioned
              </CardTitle>
              <p className="text-sm text-gray-600 mt-1">
                PHC-{String(decomTarget.phc_no).padStart(2, '0')} — <strong>{decomTarget.machine_name}</strong>
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-800">
                The record stays on the register for audit history, but review reminders stop and it no longer counts as overdue.
              </div>
              <div>
                <Label>Decommission Date</Label>
                <Input type="date" value={decomForm.decommissioned_date} onChange={e => setDecomForm(f => ({ ...f, decommissioned_date: e.target.value }))} data-testid="phc-decom-date" />
              </div>
              <div>
                <Label>Reason</Label>
                <Textarea rows={2} value={decomForm.decommissioned_reason} onChange={e => setDecomForm(f => ({ ...f, decommissioned_reason: e.target.value }))} placeholder="e.g. Machine upgraded from CO2 to Fibre laser — no longer on site" data-testid="phc-decom-reason" />
              </div>
              <div>
                <Label>Marked By</Label>
                <Input value={decomForm.decommissioned_by} onChange={e => setDecomForm(f => ({ ...f, decommissioned_by: e.target.value }))} placeholder="Your name" data-testid="phc-decom-by" />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setDecomTarget(null)} data-testid="phc-decom-cancel">Cancel</Button>
                <Button onClick={confirmDecommission} className="bg-gray-700 hover:bg-gray-800" data-testid="phc-decom-confirm"><Archive className="w-4 h-4 mr-1" /> Mark Decommissioned</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default PlantHazardChecks;
