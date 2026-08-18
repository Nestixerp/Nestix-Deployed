import React, { useState, useEffect } from 'react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Checkbox } from '../components/ui/checkbox';
import {
  ChevronDown, ChevronRight, Plus, Copy, Trash2, ExternalLink,
  RefreshCw, Eye, Sparkles, Printer, Lock, FileText, BarChart3
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatDate, formatDateTime } from '../utils/dateFormatter';
import { getControlledDocumentByFormOrModule, buildDocControlFooter, buildPrintFooterCss, buildPrintFooterHtml, buildPrintBodyOpen, buildPrintBodyClose, invalidateDocControlCache } from '../utils/documentControl';

const escapeHtml = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[c]);

const PCT_COLOR = (pct) => {
  if (pct >= 90) return 'bg-emerald-100 text-emerald-800 border-emerald-300';
  if (pct >= 75) return 'bg-blue-100 text-blue-800 border-blue-300';
  if (pct >= 60) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
  return 'bg-red-100 text-red-800 border-red-300';
};

/**
 * Parse an AI Recommended Actions text block into discrete numbered items.
 * Handles "1." / "1)" / "1 -" prefixes. Anything before the first match goes
 * into `preamble`; anything after the last item is treated as a trailing
 * conclusion if it starts with "Conclusion".
 */
const stripMd = (s) => String(s || '')
  .replace(/\*\*(.+?)\*\*/g, '$1')   // bold
  .replace(/__(.+?)__/g, '$1')       // bold alt
  .replace(/(^|\s)\*(?!\s)(.+?)\*/g, '$1$2'); // italics

const parseAiItems = (text) => {
  if (!text || !text.trim()) return { preamble: '', items: [], conclusion: '' };
  const src = text.replace(/\r\n/g, '\n').trim();
  // Match "1. ", "1) ", "1 - " at start of a line. Also support leading "**1.**" markdown.
  const re = /(^|\n)\s*(?:\*\*)?(\d{1,2})[.)\-]\s+/g;
  const matches = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    matches.push({ start: m.index + m[1].length, contentStart: m.index + m[0].length });
  }
  if (matches.length === 0) {
    return { preamble: '', items: [{ index: 0, text: stripMd(src) }], conclusion: '' };
  }
  const preamble = stripMd(src.slice(0, matches[0].start).trim());
  const items = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].contentStart;
    const end = i + 1 < matches.length ? matches[i + 1].start : src.length;
    let chunk = src.slice(start, end).trim();
    // Strip a trailing "Conclusion: …" segment off the last item
    if (i === matches.length - 1) {
      const cIdx = chunk.search(/\n\s*(?:\*\*)?Conclusion(?:\*\*)?\s*:/i);
      if (cIdx > -1) chunk = chunk.slice(0, cIdx).trim();
    }
    items.push({ index: i, text: stripMd(chunk.replace(/^\*\*|\*\*$/g, '').trim()) });
  }
  let conclusion = '';
  const cMatch = src.match(/\n\s*((?:\*\*)?Conclusion(?:\*\*)?\s*:[\s\S]*)$/i);
  if (cMatch) conclusion = stripMd(cMatch[1].trim());
  // If preamble is just the section heading echoed back by the LLM, drop it
  const preClean = preamble.replace(/^recommended\s+actions\s*:?\s*$/i, '').trim();
  return { preamble: preClean, items, conclusion };
};

const RATING_LABELS = {
  q_overall_quality: ['Very Unsatisfied', 'Unsatisfied', 'Neutral', 'Satisfied', 'Very Satisfied'],
  q_accuracy: ['Very Poor', 'Poor', 'Fair', 'Good', 'Excellent'],
  q_deadlines: ['Never', 'Rarely', 'Sometimes', 'Most of the time', 'Always'],
  q_communication: ['Very Poor', 'Poor', 'Fair', 'Good', 'Excellent'],
  q_professionalism: ['Never', 'Rarely', 'Sometimes', 'Most of the time', 'Always'],
  q_responsiveness: ['Never', 'Rarely', 'Sometimes', 'Most of the time', 'Always'],
  q_recommend: ['Very Unlikely', 'Unlikely', 'Neutral', 'Likely', 'Very Likely'],
};

const CustomerSatisfaction = () => {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'Administrator' || currentUser?.role === 'Quality Manager';

  const [campaigns, setCampaigns] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [responsesByCampaign, setResponsesByCampaign] = useState({});
  const [reportByCampaign, setReportByCampaign] = useState({});
  const [activeTab, setActiveTab] = useState({}); // {campaignId: 'responses'|'report'}
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newYear, setNewYear] = useState(new Date().getFullYear());
  const [viewResponse, setViewResponse] = useState(null);
  const [aiBusy, setAiBusy] = useState({});
  const [docControl, setDocControl] = useState(null);
  const [formNoEdit, setFormNoEdit] = useState({}); // { [campaignId]: {form_no, report_form_no} }

  useEffect(() => {
    fetchCampaigns();
  }, []);

  // Whenever the campaigns list changes, refresh the on-screen Document Control
  // stamp using the LATEST campaign's preferred form_no first.
  useEffect(() => {
    (async () => {
      const latest = campaigns[0];
      const formHint = latest?.form_no;
      const doc = await getControlledDocumentByFormOrModule(formHint, 'Customer Satisfaction');
      setDocControl(doc);
    })();
  }, [campaigns]);

  const fetchCampaigns = async () => {
    setLoading(true);
    try {
      const res = await api.get('/customer-satisfaction/campaigns');
      setCampaigns(res.data || []);
    } catch (e) {
      toast.error('Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  };

  const loadCampaignData = async (campaign) => {
    try {
      const [respRes, reportRes] = await Promise.all([
        api.get(`/customer-satisfaction/campaigns/${campaign.id}/responses`),
        api.get(`/customer-satisfaction/campaigns/${campaign.id}/report`),
      ]);
      setResponsesByCampaign((prev) => ({ ...prev, [campaign.id]: respRes.data }));
      setReportByCampaign((prev) => ({ ...prev, [campaign.id]: reportRes.data }));
    } catch (e) {
      toast.error('Failed to load campaign data');
    }
  };

  const toggleCampaign = async (campaign) => {
    const isOpen = expanded[campaign.id];
    setExpanded((prev) => ({ ...prev, [campaign.id]: !isOpen }));
    if (!isOpen) {
      setActiveTab((prev) => ({ ...prev, [campaign.id]: prev[campaign.id] || 'responses' }));
      await loadCampaignData(campaign);
    }
  };

  const createCampaign = async () => {
    setCreating(true);
    try {
      await api.post('/customer-satisfaction/campaigns', { year: Number(newYear) });
      toast.success(`Campaign for ${newYear} created`);
      setNewYear(new Date().getFullYear() + 1);
      await fetchCampaigns();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Create failed');
    } finally {
      setCreating(false);
    }
  };

  const setStatus = async (campaign, status) => {
    try {
      await api.put(`/customer-satisfaction/campaigns/${campaign.id}`, { status });
      toast.success(`Campaign ${status.toLowerCase()}`);
      await fetchCampaigns();
    } catch (e) {
      toast.error('Update failed');
    }
  };

  const rotateToken = async (campaign) => {
    if (!window.confirm('Rotating will invalidate the current survey link. Continue?')) return;
    try {
      await api.post(`/customer-satisfaction/campaigns/${campaign.id}/rotate-token`);
      toast.success('Link rotated');
      await fetchCampaigns();
    } catch (e) {
      toast.error('Rotate failed');
    }
  };

  const deleteCampaign = async (campaign) => {
    if (!window.confirm(`Delete the ${campaign.year} campaign? Responses must be removed first.`)) return;
    try {
      await api.delete(`/customer-satisfaction/campaigns/${campaign.id}`);
      toast.success('Campaign deleted');
      await fetchCampaigns();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Delete failed');
    }
  };

  const deleteResponse = async (campaign, response) => {
    if (!window.confirm(`Delete response ${response.response_no} (${response.company || ''})?`)) return;
    try {
      await api.delete(`/customer-satisfaction/responses/${response.id}`);
      toast.success('Response deleted');
      await loadCampaignData(campaign);
    } catch (e) {
      toast.error('Delete failed');
    }
  };

  /**
   * Persist edits to the form numbers used on the printed Survey form vs the
   * printed Analysis Report. Both numbers must exist in Document Control for
   * the auto-pull (Issue / Revision Date / Owner) to populate.
   */
  const saveFormNos = async (campaign) => {
    const edit = formNoEdit[campaign.id] || {};
    try {
      await api.put(`/customer-satisfaction/campaigns/${campaign.id}`, {
        form_no: (edit.form_no ?? campaign.form_no ?? '').trim() || null,
        report_form_no: (edit.report_form_no ?? campaign.report_form_no ?? '').trim() || null,
      });
      invalidateDocControlCache();
      toast.success('Form numbers updated');
      setFormNoEdit((p) => ({ ...p, [campaign.id]: undefined }));
      await fetchCampaigns();
    } catch (e) {
      toast.error('Save failed');
    }
  };

  const publicLink = (campaign) => `${window.location.origin}/survey/customer-satisfaction/${campaign.public_token}`;

  const copyLink = (campaign) => {
    navigator.clipboard.writeText(publicLink(campaign));
    toast.success('Survey link copied to clipboard');
  };

  const generateAi = async (campaign) => {
    setAiBusy((b) => ({ ...b, [campaign.id]: true }));
    try {
      await api.post(`/customer-satisfaction/campaigns/${campaign.id}/ai-recommendations`);
      toast.success('AI recommendations generated');
      await loadCampaignData(campaign);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'AI generation failed');
    } finally {
      setAiBusy((b) => ({ ...b, [campaign.id]: false }));
    }
  };

  /**
   * Persist the admin's selection of which AI recommendation items to include
   * on the printed report. Updates local state immediately, then PUTs to backend.
   * `nextIndexes` is an Array<number>; pass [] to deselect all.
   */
  const saveAiSelections = async (campaign, nextIndexes) => {
    // Optimistic UI update
    setReportByCampaign((prev) => ({
      ...prev,
      [campaign.id]: prev[campaign.id]
        ? { ...prev[campaign.id], ai_selected_indexes: nextIndexes }
        : prev[campaign.id],
    }));
    try {
      await api.put(`/customer-satisfaction/campaigns/${campaign.id}/ai-selections`, {
        selected_indexes: nextIndexes,
      });
    } catch (e) {
      toast.error('Failed to save selection');
      // Reload to resync
      await loadCampaignData(campaign);
    }
  };

  // ===================== PRINT REPORT =====================
  const printReport = async (campaign) => {
    const report = reportByCampaign[campaign.id];
    if (!report) {
      toast.error('Open the campaign first to load the report');
      return;
    }
    // Force-refresh the doc control cache so the latest revision pulls through
    invalidateDocControlCache();
    // The analysis report uses report_form_no if set, otherwise falls back to
    // the survey form_no. Look up by exact form number first, then by module.
    const reportFormNo = campaign.report_form_no || campaign.form_no;
    const reportDoc = await getControlledDocumentByFormOrModule(reportFormNo, 'Customer Satisfaction');
    const footer = buildDocControlFooter(reportDoc, {
      form_no: reportFormNo || 'QMSF 01A',
      issue: '1',
      revision_date: '',
      title: 'Customer Satisfaction Summary Report',
      owner: 'Quality Manager',
    });

    const stats = report.stats || {};
    const cats = report.category_averages || [];
    const companies = report.company_scores || [];
    const improvements = report.improvements || [];
    const suggestions = report.suggestions || [];
    const additional = report.additional_comments || [];

    const catsRows = cats.map((c) => `
      <tr>
        <td>${escapeHtml(c.label)}</td>
        <td class="num">${c.average_pct.toFixed(2)}%</td>
        <td class="num">${c.responses}</td>
      </tr>`).join('');

    const compRows = companies.map((c) => `
      <tr>
        <td>${escapeHtml(c.response_no)}</td>
        <td>${escapeHtml(c.company)}</td>
        <td>${escapeHtml(c.customer_name || '')}</td>
        <td class="num">${c.score} / ${c.max_score}</td>
        <td class="num"><strong>${c.pct.toFixed(2)}%</strong></td>
      </tr>`).join('');

    const feedbackBlock = (title, list) => list.length ? `
      <h3 class="section-h">${escapeHtml(title)}</h3>
      <table class="feedback-tbl">
        <thead><tr><th style="width:22%;">Company</th><th style="width:14%;">Response</th><th>Feedback</th></tr></thead>
        <tbody>${list.map((it) => `
          <tr><td>${escapeHtml(it.company || '')}</td><td>${escapeHtml(it.response_no || '')}</td><td>${escapeHtml(it.text || '').replace(/\n/g, '<br/>')}</td></tr>
        `).join('')}</tbody>
      </table>` : '';

    // Build the AI block honouring the admin's print-selections.
    let aiBlock = '';
    if (report.ai_recommendations) {
      const parsed = parseAiItems(report.ai_recommendations);
      const sel = report.ai_selected_indexes;
      const allSelected = sel == null;
      const selectedSet = new Set(allSelected ? parsed.items.map((it) => it.index) : sel);
      const selectedItems = parsed.items.filter((it) => selectedSet.has(it.index));
      if (selectedItems.length > 0 || (allSelected && parsed.items.length === 0 && (parsed.preamble || parsed.conclusion))) {
        const itemsHtml = selectedItems.map((it) => `
          <li>${escapeHtml(it.text).replace(/\n/g, '<br/>')}</li>
        `).join('');
        aiBlock = `
          <h3 class="section-h">Recommended Actions <span class="ai-tag">AI-generated</span></h3>
          <div class="ai-box">
            ${parsed.preamble ? `<p style="margin:0 0 6px 0;">${escapeHtml(parsed.preamble).replace(/\n/g, '<br/>')}</p>` : ''}
            ${itemsHtml ? `<ol style="margin: 0; padding-left: 22px;">${itemsHtml}</ol>` : ''}
            ${parsed.conclusion ? `<p style="margin:8px 0 0 0;">${escapeHtml(parsed.conclusion).replace(/\n/g, '<br/>')}</p>` : ''}
          </div>
          ${report.ai_generated_at ? `<div class="ai-meta">Generated: ${escapeHtml(formatDateTime(report.ai_generated_at))} &nbsp;|&nbsp; ${selectedItems.length} of ${parsed.items.length} actions selected for print</div>` : ''}
        `;
      }
    }

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Customer Satisfaction Report ${campaign.year}</title>
<style>
  ${buildPrintFooterCss()}
  * { box-sizing: border-box; }
  body { font-family: Calibri, Arial, sans-serif; color: #111; font-size: 10.5pt; }
  .doc-head { text-align: center; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 12px; }
  .doc-head h1 { font-size: 18pt; margin: 0; }
  .doc-head h2 { font-size: 13pt; margin: 4px 0 0 0; color: #1e3a8a; }
  .doc-meta-bar { display: flex; justify-content: space-between; font-size: 10pt; margin-top: 8px; }
  .summary-box { background: #eff6ff; border: 1px solid #1e3a8a; border-radius: 6px; padding: 12px 14px; margin: 12px 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .summary-cell { text-align: center; }
  .summary-num { font-size: 22pt; font-weight: bold; color: #1e3a8a; }
  .summary-label { font-size: 9pt; color: #555; text-transform: uppercase; letter-spacing: 0.5px; }
  .section-h { font-size: 12pt; margin: 14px 0 6px 0; color: #111; border-bottom: 1px solid #999; padding-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  table th, table td { border: 1px solid #444; padding: 6px 8px; vertical-align: top; font-size: 9.5pt; }
  table thead th { background: #1e3a8a; color: #fff; font-weight: bold; text-align: left; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  table thead { display: table-header-group; }
  table tr { page-break-inside: avoid; break-inside: avoid; }
  td.num, th.num { text-align: right; }
  .ai-box { border: 1px solid #6b21a8; background: #faf5ff; border-radius: 4px; padding: 10px 12px; font-size: 10pt; line-height: 1.45; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .ai-tag { display: inline-block; background: #6b21a8; color: #fff; padding: 1px 8px; border-radius: 4px; font-size: 8pt; margin-left: 8px; vertical-align: middle; }
  .ai-meta { font-size: 8pt; color: #666; margin-top: 4px; }
  .feedback-tbl td { font-size: 9pt; }
  .confidential { background: #fef2f2; border: 1px solid #dc2626; color: #991b1b; padding: 4px 8px; font-size: 8.5pt; text-align: center; margin-bottom: 8px; font-weight: bold; letter-spacing: 1px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style></head><body>${buildPrintBodyOpen(footer)}
  <div class="confidential">CONFIDENTIAL — ISO 9001 QUALITY RECORD</div>
  <div class="doc-head">
    <h1>ULTIMATE LASER PTY LTD</h1>
    <h2>CUSTOMER SATISFACTION SUMMARY REPORT — ${escapeHtml(campaign.year)}</h2>
    <div class="doc-meta-bar">
      <div><strong>Campaign:</strong> ${escapeHtml(campaign.title)}</div>
      <div><strong>Generated:</strong> ${escapeHtml(formatDate(new Date().toISOString()))}</div>
    </div>
  </div>

  <div class="summary-box">
    <div class="summary-cell">
      <div class="summary-num">${(stats.overall_pct ?? 0).toFixed(2)}%</div>
      <div class="summary-label">Overall Satisfaction</div>
    </div>
    <div class="summary-cell">
      <div class="summary-num">${stats.response_count || 0}</div>
      <div class="summary-label">Responses</div>
    </div>
    <div class="summary-cell">
      <div class="summary-num">${stats.total_score || 0} / ${stats.max_score || 0}</div>
      <div class="summary-label">Aggregate Score</div>
    </div>
  </div>

  <h3 class="section-h">Category Averages</h3>
  <table>
    <thead><tr><th>Category</th><th class="num" style="width:22%;">Average</th><th class="num" style="width:14%;">Responses</th></tr></thead>
    <tbody>${catsRows || '<tr><td colspan="3" style="text-align:center;">No data</td></tr>'}</tbody>
  </table>

  <h3 class="section-h">Individual Company Scores</h3>
  <table>
    <thead><tr>
      <th style="width:14%;">Response</th><th>Company</th><th style="width:22%;">Contact</th>
      <th class="num" style="width:14%;">Score</th><th class="num" style="width:14%;">%</th>
    </tr></thead>
    <tbody>${compRows || '<tr><td colspan="5" style="text-align:center;">No responses</td></tr>'}</tbody>
  </table>

  ${feedbackBlock('Areas for Improvement (Customer Verbatim)', improvements)}
  ${feedbackBlock('Suggestions (Customer Verbatim)', suggestions)}
  ${feedbackBlock('Additional Comments (Customer Verbatim)', additional)}
  ${aiBlock}

  ${buildPrintBodyClose()}
</body></html>`;

    const w = window.open('', '_blank', 'width=1100,height=1400');
    if (!w) { toast.error('Pop-up blocked. Allow pop-ups to print.'); return; }
    w.document.write(html);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 400);
  };

  // ===================== PRINT INDIVIDUAL RESPONSE =====================
  const printResponse = async (response, campaign) => {
    invalidateDocControlCache();
    const responseDoc = await getControlledDocumentByFormOrModule(campaign.form_no, 'Customer Satisfaction');
    const footer = buildDocControlFooter(responseDoc, {
      form_no: campaign.form_no || 'QMSF 01A', issue: '1', revision_date: '',
      title: 'Customer Satisfaction Survey', owner: 'Quality Manager'
    });

    const qRow = (label, key) => {
      const v = response[key];
      const opts = RATING_LABELS[key] || [];
      const checked = (i) => i + 1 === v;
      const cells = opts.map((opt, i) => `<td style="text-align:center;">${checked(i) ? '<strong style="color:#1e3a8a;">●</strong>' : '○'}<br/><span style="font-size:8pt;">${escapeHtml(opt)}</span></td>`).join('');
      return `<tr><td style="width:36%;"><strong>${escapeHtml(label)}</strong></td>${cells}</tr>`;
    };

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${escapeHtml(response.response_no)} — ${escapeHtml(response.company || '')}</title>
<style>
  ${buildPrintFooterCss()}
  body { font-family: Calibri, Arial, sans-serif; color: #111; font-size: 10.5pt; }
  .confidential { background: #fef2f2; border: 1px solid #dc2626; color: #991b1b; padding: 4px 8px; font-size: 8.5pt; text-align: center; font-weight: bold; letter-spacing: 1px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .doc-head { text-align: center; border-bottom: 2px solid #111; padding-bottom: 8px; margin: 8px 0 12px 0; }
  .doc-head h1 { font-size: 18pt; margin: 0; }
  .doc-head h2 { font-size: 13pt; margin: 4px 0 0 0; color: #1e3a8a; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 22px; margin: 10px 0 14px 0; padding-bottom: 10px; border-bottom: 1px solid #ddd; }
  .meta-cell .meta-label { font-weight: bold; color: #374151; }
  .section-h { font-size: 12pt; margin: 14px 0 4px 0; color: #1e3a8a; border-bottom: 1px solid #999; padding-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; }
  table th, table td { border: 1px solid #444; padding: 5px 6px; font-size: 9.5pt; }
  table tr { page-break-inside: avoid; break-inside: avoid; }
  .free-box { border: 1px solid #999; padding: 8px 10px; background: #fafafa; font-size: 10pt; min-height: 36px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style></head><body>${buildPrintBodyOpen(footer)}
  <div class="confidential">CONFIDENTIAL — ISO 9001 QUALITY RECORD</div>
  <div class="doc-head">
    <h1>ULTIMATE LASER PTY LTD</h1>
    <h2>CUSTOMER SATISFACTION SURVEY — Response ${escapeHtml(response.response_no)}</h2>
  </div>

  <div class="meta-grid">
    <div class="meta-cell"><div class="meta-label">Date</div><div>${escapeHtml(formatDate(response.submitted_at))}</div></div>
    <div class="meta-cell"><div class="meta-label">Campaign Year</div><div>${escapeHtml(response.campaign_year)}</div></div>
    <div class="meta-cell"><div class="meta-label">Name</div><div>${escapeHtml(response.customer_name || '')}</div></div>
    <div class="meta-cell"><div class="meta-label">Company</div><div>${escapeHtml(response.company || '')}</div></div>
    <div class="meta-cell"><div class="meta-label">Contact Email</div><div>${escapeHtml(response.contact_email || '')}</div></div>
    <div class="meta-cell"><div class="meta-label">Contact Number</div><div>${escapeHtml(response.contact_number || '')}</div></div>
  </div>

  <h3 class="section-h">Service Experience</h3>
  <table>
    <tbody>
      ${qRow('Overall Satisfaction with Laser Cutting', 'q_overall_quality')}
      ${qRow('Accuracy & Precision', 'q_accuracy')}
      ${qRow('Deadlines Met as Promised', 'q_deadlines')}
      ${qRow('Communication (Updates & Clarifications)', 'q_communication')}
    </tbody>
  </table>

  <h3 class="section-h">Team Interaction</h3>
  <table>
    <tbody>
      ${qRow('Staff Professionalism & Courtesy', 'q_professionalism')}
      ${qRow('Inquiries Addressed Promptly', 'q_responsiveness')}
    </tbody>
  </table>

  <h3 class="section-h">Improvements & Suggestions</h3>
  <div style="margin-bottom: 8px;"><strong>Aspect needing improvement:</strong></div>
  <div class="free-box">${escapeHtml(response.improvements_text || '').replace(/\n/g, '<br/>') || '<em style="color:#888;">No response</em>'}</div>
  <div style="margin: 10px 0 6px 0;"><strong>Suggestions for enhancement:</strong></div>
  <div class="free-box">${escapeHtml(response.suggestions_text || '').replace(/\n/g, '<br/>') || '<em style="color:#888;">No response</em>'}</div>

  <h3 class="section-h">Overall Satisfaction</h3>
  <table><tbody>${qRow('Likelihood to Recommend Ultimate Laser', 'q_recommend')}</tbody></table>

  <h3 class="section-h">Additional Comments</h3>
  <div class="free-box">${escapeHtml(response.additional_comments || '').replace(/\n/g, '<br/>') || '<em style="color:#888;">No response</em>'}</div>

  ${buildPrintBodyClose()}
</body></html>`;

    const w = window.open('', '_blank', 'width=1100,height=1400');
    if (!w) { toast.error('Pop-up blocked'); return; }
    w.document.write(html);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 400);
  };

  // ============= RENDER =============
  if (!isAdmin) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Card className="p-8 text-center">
          <Lock className="w-10 h-10 mx-auto text-slate-400 mb-2" />
          <h2 className="text-xl font-semibold mb-1">Confidential Module</h2>
          <p className="text-slate-600">Only Administrators and Quality Managers can access customer satisfaction records.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto" data-testid="customer-satisfaction-page">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-7 h-7 text-blue-700" /> Customer Satisfaction
          </h1>
          <p className="text-slate-600 mt-1 text-sm">
            ISO 9001 yearly survey campaigns. Each year has one public survey link you share with customers.
            Responses are stored confidentially and reviewable per year.
          </p>
          {docControl && (
            <div className="mt-2 text-xs text-slate-500" data-testid="cs-doc-control-stamp">
              Form No: <strong>{docControl.form_no}</strong> &nbsp;|&nbsp;
              Issue: <strong>{docControl.issue || '—'}</strong> &nbsp;|&nbsp;
              Revision Date: <strong>{docControl.revision_date ? formatDate(docControl.revision_date) : '—'}</strong>
              {docControl.owner ? ` | Owner: ${docControl.owner}` : ''}
            </div>
          )}
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="text-xs text-slate-500 block mb-1">New Year</label>
            <Input
              type="number"
              value={newYear}
              onChange={(e) => setNewYear(e.target.value)}
              className="w-28"
              data-testid="new-campaign-year-input"
            />
          </div>
          <Button onClick={createCampaign} disabled={creating} className="bg-blue-700" data-testid="create-campaign-btn">
            <Plus className="w-4 h-4 mr-1" /> {creating ? 'Creating...' : 'Add Year'}
          </Button>
        </div>
      </div>

      {loading ? (
        <Card className="p-8 text-center text-slate-500">Loading…</Card>
      ) : campaigns.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-slate-600">No campaigns yet. Click <strong>+ Add Year</strong> to start the first one.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => {
            const isOpen = !!expanded[c.id];
            const responses = responsesByCampaign[c.id] || [];
            const report = reportByCampaign[c.id];
            const tab = activeTab[c.id] || 'responses';
            return (
              <Card key={c.id} className="overflow-hidden" data-testid={`campaign-card-${c.year}`}>
                {/* Header row */}
                <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b cursor-pointer hover:bg-slate-100"
                  onClick={() => toggleCampaign(c)}>
                  <div className="flex items-center gap-3">
                    {isOpen ? <ChevronDown className="w-5 h-5 text-slate-500" /> : <ChevronRight className="w-5 h-5 text-slate-500" />}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-slate-900">{c.year}</span>
                        <Badge variant={c.status === 'Active' ? 'default' : 'secondary'}>{c.status}</Badge>
                        <Badge variant="outline">{c.response_count || 0} responses</Badge>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">{c.title}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="outline" onClick={() => copyLink(c)} data-testid={`copy-link-${c.year}`}>
                      <Copy className="w-3.5 h-3.5 mr-1" /> Copy Link
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => window.open(publicLink(c), '_blank')}>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                    {c.status === 'Active' ? (
                      <Button size="sm" variant="outline" onClick={() => setStatus(c, 'Closed')}>Close</Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setStatus(c, 'Active')}>Reopen</Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => rotateToken(c)} title="Rotate public link">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-600" onClick={() => deleteCampaign(c)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {isOpen && (
                  <div className="p-4">
                    {/* Form Numbers (Document Control linkage) */}
                    <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded text-sm" data-testid={`form-nos-${c.year}`}>
                      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                        <strong className="text-amber-900">Document Control linkage</strong>
                        <span className="text-xs text-amber-800">
                          These form numbers must exist in your Document Control register so the printed footer auto-pulls Issue / Revision Date / Owner.
                        </span>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-3 items-end">
                        <div>
                          <label className="text-xs text-slate-600 block mb-1">Survey form number (per response)</label>
                          <Input
                            value={formNoEdit[c.id]?.form_no ?? c.form_no ?? ''}
                            onChange={(e) => setFormNoEdit((p) => ({ ...p, [c.id]: { ...(p[c.id] || {}), form_no: e.target.value } }))}
                            placeholder="e.g. QMSF 01"
                            data-testid={`form-no-input-${c.year}`}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-600 block mb-1">
                            Analysis report form number <span className="text-slate-400">(optional — leave blank to use the survey form number)</span>
                          </label>
                          <Input
                            value={formNoEdit[c.id]?.report_form_no ?? c.report_form_no ?? ''}
                            onChange={(e) => setFormNoEdit((p) => ({ ...p, [c.id]: { ...(p[c.id] || {}), report_form_no: e.target.value } }))}
                            placeholder="e.g. QMSF 01R"
                            data-testid={`report-form-no-input-${c.year}`}
                          />
                        </div>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => saveFormNos(c)}
                          disabled={
                            (formNoEdit[c.id]?.form_no == null || formNoEdit[c.id]?.form_no === c.form_no) &&
                            (formNoEdit[c.id]?.report_form_no == null || formNoEdit[c.id]?.report_form_no === c.report_form_no)
                          }
                          data-testid={`save-form-nos-${c.year}`}
                        >
                          Save form numbers
                        </Button>
                        {formNoEdit[c.id] && (
                          <Button size="sm" variant="outline" onClick={() => setFormNoEdit((p) => ({ ...p, [c.id]: undefined }))}>Cancel</Button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between mb-3">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant={tab === 'responses' ? 'default' : 'outline'}
                          onClick={() => setActiveTab((p) => ({ ...p, [c.id]: 'responses' }))}
                          data-testid={`tab-responses-${c.year}`}
                        >
                          <FileText className="w-4 h-4 mr-1" /> Responses ({responses.length})
                        </Button>
                        <Button
                          size="sm"
                          variant={tab === 'report' ? 'default' : 'outline'}
                          onClick={() => setActiveTab((p) => ({ ...p, [c.id]: 'report' }))}
                          data-testid={`tab-report-${c.year}`}
                        >
                          <BarChart3 className="w-4 h-4 mr-1" /> Analysis Report
                        </Button>
                      </div>
                      <div className="text-xs text-slate-500 break-all max-w-xl">
                        <strong>Survey link:</strong> {publicLink(c)}
                      </div>
                    </div>

                    {tab === 'responses' && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm border">
                          <thead className="bg-slate-100">
                            <tr>
                              <th className="border px-2 py-1.5 text-left">Response #</th>
                              <th className="border px-2 py-1.5 text-left">Company</th>
                              <th className="border px-2 py-1.5 text-left">Contact</th>
                              <th className="border px-2 py-1.5 text-left">Email</th>
                              <th className="border px-2 py-1.5 text-center">Score</th>
                              <th className="border px-2 py-1.5 text-center">%</th>
                              <th className="border px-2 py-1.5 text-left">Submitted</th>
                              <th className="border px-2 py-1.5 text-center">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {responses.length === 0 ? (
                              <tr><td colSpan={8} className="text-center py-6 text-slate-500">No responses yet</td></tr>
                            ) : responses.map((r) => (
                              <tr key={r.id} className="hover:bg-slate-50">
                                <td className="border px-2 py-1.5 font-mono text-xs">{r.response_no}</td>
                                <td className="border px-2 py-1.5">{r.company || '—'}</td>
                                <td className="border px-2 py-1.5">{r.customer_name || '—'}</td>
                                <td className="border px-2 py-1.5 text-xs">{r.contact_email || '—'}</td>
                                <td className="border px-2 py-1.5 text-center">{r.computed?.score ?? 0}/{r.computed?.max_score ?? 35}</td>
                                <td className="border px-2 py-1.5 text-center">
                                  <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${PCT_COLOR(r.computed?.overall_pct ?? 0)}`}>
                                    {(r.computed?.overall_pct ?? 0).toFixed(1)}%
                                  </span>
                                </td>
                                <td className="border px-2 py-1.5 text-xs">{formatDate(r.submitted_at)}</td>
                                <td className="border px-2 py-1.5 text-center">
                                  <Button size="sm" variant="ghost" onClick={() => setViewResponse({ ...r, _campaign: c })}><Eye className="w-3.5 h-3.5" /></Button>
                                  <Button size="sm" variant="ghost" onClick={() => printResponse(r, c)}><Printer className="w-3.5 h-3.5" /></Button>
                                  <Button size="sm" variant="ghost" className="text-red-600" onClick={() => deleteResponse(c, r)}><Trash2 className="w-3.5 h-3.5" /></Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {tab === 'report' && (
                      <div className="space-y-4">
                        {!report ? (
                          <div className="text-center text-slate-500 py-6">Loading report…</div>
                        ) : (
                          <>
                            <div className="grid grid-cols-3 gap-3">
                              <Card className="p-3 text-center bg-blue-50 border-blue-200">
                                <div className="text-3xl font-bold text-blue-800">{(report.stats.overall_pct || 0).toFixed(2)}%</div>
                                <div className="text-xs text-slate-600 uppercase mt-1">Overall Satisfaction</div>
                              </Card>
                              <Card className="p-3 text-center">
                                <div className="text-3xl font-bold text-slate-800">{report.stats.response_count}</div>
                                <div className="text-xs text-slate-600 uppercase mt-1">Responses</div>
                              </Card>
                              <Card className="p-3 text-center">
                                <div className="text-3xl font-bold text-slate-800">{report.stats.total_score} / {report.stats.max_score}</div>
                                <div className="text-xs text-slate-600 uppercase mt-1">Aggregate Score</div>
                              </Card>
                            </div>

                            <div>
                              <h3 className="font-semibold mb-2">Category Averages</h3>
                              <table className="w-full text-sm border">
                                <thead className="bg-slate-100">
                                  <tr>
                                    <th className="border px-2 py-1.5 text-left">Category</th>
                                    <th className="border px-2 py-1.5 text-right">Average</th>
                                    <th className="border px-2 py-1.5 text-right">Responses</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(report.category_averages || []).map((cat) => (
                                    <tr key={cat.key}>
                                      <td className="border px-2 py-1.5">{cat.label}</td>
                                      <td className="border px-2 py-1.5 text-right">
                                        <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${PCT_COLOR(cat.average_pct)}`}>
                                          {cat.average_pct.toFixed(2)}%
                                        </span>
                                      </td>
                                      <td className="border px-2 py-1.5 text-right">{cat.responses}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 pt-2">
                              <Button
                                onClick={() => generateAi(c)}
                                disabled={!!aiBusy[c.id] || (report.stats.response_count || 0) === 0}
                                className="bg-purple-700 hover:bg-purple-800"
                                data-testid={`ai-generate-${c.year}`}
                              >
                                <Sparkles className="w-4 h-4 mr-1" /> {aiBusy[c.id] ? 'Generating…' : 'AI Recommended Actions'}
                              </Button>
                              <Button variant="outline" onClick={() => printReport(c)} data-testid={`print-report-${c.year}`}>
                                <Printer className="w-4 h-4 mr-1" /> Print Report
                              </Button>
                              {report.ai_generated_at && (
                                <span className="text-xs text-slate-500">Last AI run: {formatDateTime(report.ai_generated_at)}</span>
                              )}
                            </div>

                            {report.ai_recommendations && (() => {
                              const parsed = parseAiItems(report.ai_recommendations);
                              const allIndexes = parsed.items.map((it) => it.index);
                              const sel = report.ai_selected_indexes;
                              // null/undefined => "all selected" default
                              const selectedSet = new Set(sel == null ? allIndexes : sel);
                              const selectedCount = parsed.items.filter((it) => selectedSet.has(it.index)).length;

                              const toggle = (idx) => {
                                const next = selectedSet.has(idx)
                                  ? [...selectedSet].filter((i) => i !== idx)
                                  : [...selectedSet, idx];
                                saveAiSelections(c, next.sort((a, b) => a - b));
                              };
                              const selectAll = () => saveAiSelections(c, allIndexes);
                              const selectNone = () => saveAiSelections(c, []);

                              return (
                                <Card className="p-4 bg-purple-50 border-purple-300" data-testid={`ai-card-${c.year}`}>
                                  <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                                    <h4 className="font-semibold text-purple-900 flex items-center gap-2">
                                      <Sparkles className="w-4 h-4" /> Recommended Actions (AI)
                                      <span className="text-xs font-normal text-purple-700 bg-purple-100 px-2 py-0.5 rounded">
                                        {selectedCount} of {parsed.items.length} selected for print
                                      </span>
                                    </h4>
                                    <div className="flex gap-2">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={selectAll}
                                        disabled={selectedCount === parsed.items.length}
                                        data-testid={`ai-select-all-${c.year}`}
                                      >
                                        Select All
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={selectNone}
                                        disabled={selectedCount === 0}
                                        data-testid={`ai-select-none-${c.year}`}
                                      >
                                        Deselect All
                                      </Button>
                                    </div>
                                  </div>
                                  <p className="text-xs text-purple-800 mb-3">
                                    Tick the actions you want to include on the printed report. You can override the AI&apos;s suggestions before printing.
                                  </p>

                                  {parsed.preamble && (
                                    <p className="text-sm mb-3 text-slate-700 whitespace-pre-wrap">{parsed.preamble}</p>
                                  )}

                                  {parsed.items.length === 0 ? (
                                    <div className="text-sm whitespace-pre-wrap leading-relaxed">{report.ai_recommendations}</div>
                                  ) : (
                                    <ol className="space-y-2">
                                      {parsed.items.map((it) => {
                                        const checked = selectedSet.has(it.index);
                                        return (
                                          <li
                                            key={it.index}
                                            className={`flex gap-3 items-start p-2 rounded border ${checked ? 'bg-white border-purple-300' : 'bg-purple-100/40 border-purple-200 opacity-70'}`}
                                            data-testid={`ai-item-${c.year}-${it.index}`}
                                          >
                                            <Checkbox
                                              checked={checked}
                                              onCheckedChange={() => toggle(it.index)}
                                              data-testid={`ai-checkbox-${c.year}-${it.index}`}
                                              className="mt-0.5"
                                            />
                                            <div className="text-sm leading-relaxed flex-1">
                                              <span className="font-semibold text-purple-900 mr-1">{it.index + 1}.</span>
                                              <span className="whitespace-pre-wrap">{it.text}</span>
                                            </div>
                                          </li>
                                        );
                                      })}
                                    </ol>
                                  )}

                                  {parsed.conclusion && (
                                    <p className="text-sm mt-3 text-slate-700 italic whitespace-pre-wrap">{parsed.conclusion}</p>
                                  )}
                                </Card>
                              );
                            })()}

                            {(report.improvements?.length > 0 || report.suggestions?.length > 0 || report.additional_comments?.length > 0) && (
                              <div className="grid md:grid-cols-3 gap-3 mt-3">
                                {[
                                  ['Improvements', report.improvements],
                                  ['Suggestions', report.suggestions],
                                  ['Additional Comments', report.additional_comments],
                                ].map(([title, list]) => (
                                  <Card key={title} className="p-3">
                                    <h5 className="font-semibold text-sm mb-2">{title} ({list?.length || 0})</h5>
                                    <div className="space-y-2 max-h-60 overflow-y-auto">
                                      {(list || []).map((it, i) => (
                                        <div key={i} className="text-xs border-l-2 border-slate-300 pl-2">
                                          <div className="font-medium">{it.company} <span className="text-slate-400">({it.response_no})</span></div>
                                          <div className="text-slate-700 whitespace-pre-wrap">{it.text}</div>
                                        </div>
                                      ))}
                                      {(!list || list.length === 0) && <div className="text-xs text-slate-400 italic">No entries</div>}
                                    </div>
                                  </Card>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* View response modal */}
      <Dialog open={!!viewResponse} onOpenChange={(o) => !o && setViewResponse(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Response {viewResponse?.response_no} — {viewResponse?.company}</DialogTitle>
          </DialogHeader>
          {viewResponse && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-slate-500">Name:</span> {viewResponse.customer_name || '—'}</div>
                <div><span className="text-slate-500">Company:</span> {viewResponse.company || '—'}</div>
                <div><span className="text-slate-500">Email:</span> {viewResponse.contact_email || '—'}</div>
                <div><span className="text-slate-500">Phone:</span> {viewResponse.contact_number || '—'}</div>
                <div><span className="text-slate-500">Submitted:</span> {formatDateTime(viewResponse.submitted_at)}</div>
                <div><span className="text-slate-500">Score:</span> {viewResponse.computed?.score} / {viewResponse.computed?.max_score} ({(viewResponse.computed?.overall_pct ?? 0).toFixed(2)}%)</div>
              </div>
              <div className="border-t pt-3">
                <h4 className="font-semibold mb-2">Ratings</h4>
                {Object.entries(RATING_LABELS).map(([key, opts]) => (
                  <div key={key} className="flex justify-between border-b py-1">
                    <span>{key.replace(/_/g, ' ').replace(/^q /, '')}</span>
                    <span className="font-medium">{viewResponse[key] ? `${opts[viewResponse[key] - 1]} (${viewResponse[key]}/5)` : '—'}</span>
                  </div>
                ))}
              </div>
              <div className="border-t pt-3 space-y-2">
                <div>
                  <h5 className="font-semibold text-sm">Improvements</h5>
                  <p className="text-slate-700 whitespace-pre-wrap">{viewResponse.improvements_text || <em className="text-slate-400">No response</em>}</p>
                </div>
                <div>
                  <h5 className="font-semibold text-sm">Suggestions</h5>
                  <p className="text-slate-700 whitespace-pre-wrap">{viewResponse.suggestions_text || <em className="text-slate-400">No response</em>}</p>
                </div>
                <div>
                  <h5 className="font-semibold text-sm">Additional Comments</h5>
                  <p className="text-slate-700 whitespace-pre-wrap">{viewResponse.additional_comments || <em className="text-slate-400">No response</em>}</p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => printResponse(viewResponse, viewResponse?._campaign || { form_no: 'QMSF 01A', year: viewResponse?.campaign_year })}>
              <Printer className="w-4 h-4 mr-1" /> Print
            </Button>
            <Button onClick={() => setViewResponse(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CustomerSatisfaction;
