/**
 * QMSF 02 — Employment Application.
 *
 * Renders the controlled blank/filled Employment Application as audit-compliant
 * print HTML. Layout is tuned to fit on **2 A4 pages** (matching the original
 * QMS Word template):
 *   • Page 1: Applicant Information + Education + References (3 contacts)
 *   • Page 2: Previous Employment (3 entries) + Disclaimer
 *
 * @param footer  Document Control footer object from buildDocControlFooter()
 * @param values  Optional dict of field values to pre-fill (used by the
 *                fillable digital version). If omitted, all fields print blank.
 */
import { buildPrintFooterCss, buildPrintBodyOpen, buildPrintBodyClose } from '../utils/documentControl';

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[c]);

// Helper to render a field cell. If a value is provided, show it; otherwise blank
const f = (label, val) => `<td><div class="lbl">${esc(label)}</div><div class="val">${esc(val) || '&nbsp;'}</div></td>`;

// Yes/No picker: marks the selected one
const ynRow = (label, val) => {
  const yes = String(val).toLowerCase() === 'yes' ? '<strong>☒ YES</strong>' : '☐ YES';
  const no = String(val).toLowerCase() === 'no' ? '<strong>☒ NO</strong>' : '☐ NO';
  return `<td><div class="lbl">${esc(label)}</div><div class="val">${yes} &nbsp;&nbsp; ${no}</div></td>`;
};

const sec = (text) => `<tr><td colspan="6" class="section">${esc(text)}</td></tr>`;

export const employmentApplication = {
  id: 'employment-application',
  form_no: 'QMSF 02',
  related_module: 'Employment Application Form',
  fallback_module: 'Employment Application',
  title: 'Employment Application',
  group: 'Quality',
  description: 'Blank application form for new candidates. Fill online or print blank.',
  fill_route: '/quality/forms/employment-application',
  submissions_route: '/quality/forms/employment-application/submissions',
  public_route: '/apply/employment-application',

  render(footer, v = {}) {
    const ed = v.education || [{}, {}, {}];  // 3 rows: High School, University, Other
    const refs = v.references || [{}, {}, {}];
    const jobs = v.previous_employment || [{}, {}, {}];

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Employment Application${v.last_name ? ' — ' + esc(v.last_name) : ''}</title>
<style>
  ${buildPrintFooterCss()}
  body { font-family: Calibri, Arial, sans-serif; color: #111; font-size: 9pt; }
  .doc-head { display: flex; justify-content: space-between; align-items: center; border: 1px solid #999; padding: 5px 10px; margin-bottom: 5px; }
  .brand { font-weight: bold; color: #b91c1c; font-size: 13pt; }
  .doc-title { text-align: right; font-size: 9pt; color: #444; }
  .doc-title strong { display: block; font-size: 10.5pt; color: #111; }
  table.form-tbl { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  table.form-tbl td { border: 1px solid #444; padding: 2px 5px; vertical-align: top; }
  table.form-tbl td.section { background: #d1d5db; font-weight: bold; padding: 3px 6px; font-size: 9.5pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .lbl { font-size: 7.5pt; color: #555; line-height: 1.15; }
  .val { min-height: 11px; line-height: 1.25; word-wrap: break-word; }
  .row-2 td { width: 50%; }
  .row-3 td { width: 33.33%; }
  .row-4 td { width: 25%; }
  .disclaimer { font-size: 8.5pt; line-height: 1.35; margin: 2px 0; }
  .page-break { page-break-before: always; }
  tr { page-break-inside: avoid; break-inside: avoid; }
</style></head><body>
${buildPrintBodyOpen(footer)}
  <div class="doc-head">
    <div class="brand">ULTIMATE LASER PTY LTD</div>
    <div class="doc-title"><strong>ULTIMATE LASER</strong>Employment Application</div>
  </div>

  <table class="form-tbl">
    ${sec('APPLICANT INFORMATION')}
    <tr class="row-3">${f('Last Name', v.last_name)}${f('First', v.first_name)}${f('Date', v.application_date)}</tr>
    <tr class="row-2">${f('Street Address', v.street_address)}${f('Apartment/Unit #', v.apartment)}</tr>
    <tr class="row-3">${f('City', v.city)}${f('State', v.state)}${f('P/C', v.postcode)}</tr>
    <tr class="row-2">${f('Phone', v.phone)}${f('E-mail Address', v.email)}</tr>
    <tr class="row-3">${f('Date Available', v.date_available)}${f('Desired Salary', v.desired_salary)}${f('Position Applied for', v.position)}</tr>
    <tr>${ynRow('Are you a citizen of Australia?', v.is_citizen)}<td colspan="2"><div class="lbl">If no, are you authorised to work in Australia?</div><div class="val">${esc(v.work_auth) || '&nbsp;'}</div></td></tr>
    <tr>${ynRow('Have you ever worked for this company?', v.worked_before)}<td colspan="2">${f('If so, when?', v.worked_before_when).replace('<td>', '').replace('</td>', '')}</td></tr>
    <tr>${ynRow('Have you ever been convicted of a criminal offence?', v.criminal)}<td colspan="2">${f('If yes, explain', v.criminal_explain).replace('<td>', '').replace('</td>', '')}</td></tr>
  </table>

  <table class="form-tbl">
    ${sec('EDUCATION')}
    ${[
      ['High School', ed[0]],
      ['University', ed[1]],
      ['Other', ed[2]],
    ].map(([label, e]) => `
      <tr class="row-2">${f(label, e.name)}${f('Address', e.address)}</tr>
      <tr class="row-4">${f('From', e.from_date)}${f('To', e.to_date)}<td><div class="lbl">Did you graduate?</div><div class="val">${String(e.graduated).toLowerCase() === 'yes' ? '<strong>☒ YES</strong>' : '☐ YES'} &nbsp; ${String(e.graduated).toLowerCase() === 'no' ? '<strong>☒ NO</strong>' : '☐ NO'}</div></td>${f(label === 'High School' ? 'Year 12 / VCE' : 'Degree', e.degree)}</tr>
    `).join('')}
  </table>

  <table class="form-tbl">
    ${sec('REFERENCES — Please list three professional references')}
    ${refs.map((r) => `
      <tr class="row-3">${f('Full Name', r.name)}${f('Relationship', r.relationship)}${f('Phone', r.phone)}</tr>
      <tr class="row-2">${f('Company', r.company)}${f('Address', r.address)}</tr>
    `).join('')}
  </table>

  <div class="page-break"></div>

  <table class="form-tbl">
    ${sec('PREVIOUS EMPLOYMENT')}
    ${jobs.map((j) => `
      <tr class="row-2">${f('Company', j.company)}${f('Phone', j.phone)}</tr>
      <tr class="row-2">${f('Address', j.address)}${f('Supervisor', j.supervisor)}</tr>
      <tr class="row-3">${f('Job Title', j.title)}${f('Starting Salary', j.start_salary)}${f('Ending Salary', j.end_salary)}</tr>
      <tr><td colspan="3"><div class="lbl">Responsibilities</div><div class="val">${esc(j.responsibilities) || '&nbsp;'}</div></td></tr>
      <tr class="row-3">${f('From', j.from_date)}${f('To', j.to_date)}${f('Reason for Leaving', j.reason)}</tr>
      <tr>${ynRow('May we contact your previous supervisor for a reference?', j.may_contact)}<td colspan="2">&nbsp;</td></tr>
    `).join('')}
  </table>

  <table class="form-tbl">
    ${sec('DISCLAIMER AND SIGNATURE')}
    <tr><td colspan="2">
      <p class="disclaimer">I certify that my answers are true and complete to the best of my knowledge.</p>
      <p class="disclaimer">If this application leads to employment, I understand that false or misleading information in my application or interview may result in my release.</p>
    </td></tr>
    <tr class="row-2">${f('Signature', v.signature)}${f('Date', v.signature_date)}</tr>
    <tr class="row-2">${f('Marital Status', v.marital_status)}${f('No. of Dependants', v.dependants)}</tr>
  </table>
${buildPrintBodyClose()}
</body></html>`;
  },
};
