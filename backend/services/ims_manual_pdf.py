"""IMS Manual PDF export — styled to match the company's original Word manual:
centered cover with company address + authorisation block, INDEX tables
(Section | Std. Reference | Revision | Date | Title), centred bold section
headings, pipe-table rendering, and the classic Word footer.
Content lines starting with '|' are rendered as tables."""
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, PageBreak,
                                Table, TableStyle, KeepTogether, CondPageBreak, Image)
from reportlab.pdfgen import canvas
from io import BytesIO
from datetime import datetime
import base64
import re

FONT = 'Helvetica'
FONT_B = 'Helvetica-Bold'

S_COVER_TITLE = ParagraphStyle('ct', fontName=FONT_B, fontSize=26, leading=32, alignment=TA_CENTER, spaceAfter=18)
S_COVER_CO = ParagraphStyle('cc', fontName=FONT_B, fontSize=16, leading=20, alignment=TA_CENTER, spaceAfter=4)
S_COVER_ADDR = ParagraphStyle('ca', fontName=FONT_B, fontSize=12, leading=16, alignment=TA_CENTER, spaceAfter=2)
S_COVER_SM = ParagraphStyle('cs', fontName=FONT_B, fontSize=10.5, leading=14, alignment=TA_CENTER, spaceAfter=2)
S_SEC_HEAD = ParagraphStyle('sh', fontName=FONT_B, fontSize=15, leading=19, alignment=TA_CENTER,
                            spaceBefore=6, spaceAfter=10)
S_CLAUSE = ParagraphStyle('cl', fontName='Helvetica-Oblique', fontSize=9, textColor=colors.HexColor('#555555'),
                          alignment=TA_CENTER, spaceAfter=10)
S_H2 = ParagraphStyle('h2', fontName=FONT_B, fontSize=11.5, spaceBefore=10, spaceAfter=5)
S_BODY = ParagraphStyle('b', fontName=FONT, fontSize=10, leading=14, alignment=TA_JUSTIFY, spaceAfter=6)
S_CELL = ParagraphStyle('cell', fontName=FONT, fontSize=8.5, leading=11)
S_CELL_B = ParagraphStyle('cellb', fontName=FONT_B, fontSize=8.5, leading=11)
S_IDX_HEAD = ParagraphStyle('ih', fontName=FONT_B, fontSize=16, alignment=TA_CENTER, spaceBefore=6, spaceAfter=12)

_HEAD_RE = re.compile(r'^(SECTION \d+|\d+\.\d+(\.\d+)?)([ :\-–].*)?$')
_PAGE_W = A4[0] - 4 * cm  # usable width with 2cm margins


def _esc(t):
    return (t or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def _fmt_date(iso):
    if not iso:
        return ''
    try:
        return f"{iso[8:10]}/{iso[5:7]}/{iso[0:4]}"
    except Exception:
        return iso[:10]


def _issue_line(manual):
    src = manual.get('issue_date') or manual.get('approved_at') or datetime.now().isoformat()
    try:
        dt = datetime.fromisoformat(str(src)[:10])
        return f"ISSUE {manual.get('revision', 1)}: {dt.strftime('%B %Y').upper()}"
    except Exception:
        return f"ISSUE {manual.get('revision', 1)}"


class _Footer(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        canvas.Canvas.__init__(self, *args, **kwargs)
        self._states = []
        self.meta = {}

    def showPage(self):
        self._states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        n = len(self._states)
        for st in self._states:
            self.__dict__.update(st)
            self._footer(n)
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)

    def _footer(self, total):
        m = self.meta
        self.saveState()
        self.setStrokeColor(colors.HexColor('#444444'))
        self.setLineWidth(0.6)
        self.line(2 * cm, 1.85 * cm, A4[0] - 2 * cm, 1.85 * cm)
        # Word-style footer: "COMPANY MANUAL    ISSUE n: MONTH YEAR" left, page right
        pt = f"Page {self._pageNumber} of {total}"
        left = f"{m.get('footer_left', '')}        {m.get('issue_line', '')}"
        size = 8.5
        max_w = A4[0] - 4 * cm - self.stringWidth(pt, FONT_B, 8.5) - 0.4 * cm
        while size > 6 and self.stringWidth(left, FONT_B, size) > max_w:
            size -= 0.5
        self.setFont(FONT_B, size)
        self.setFillColor(colors.black)
        self.drawString(2 * cm, 1.55 * cm, left)
        self.setFont(FONT_B, 8.5)
        self.drawString(A4[0] - 2 * cm - self.stringWidth(pt, FONT_B, 8.5), 1.55 * cm, pt)
        # small control line
        self.setFont(FONT, 7.5)
        self.setFillColor(colors.HexColor('#666666'))
        status = m.get('status', 'Draft')
        note = f"Doc No: {m.get('doc_number', '—')}"
        if status != 'Approved':
            note += f"   |   {status.upper()} — PENDING APPROVAL"
        note += "   |   UNCONTROLLED WHEN PRINTED"
        self.drawString(2 * cm, 1.22 * cm, note)
        self.restoreState()


def _logo_flowable(company):
    url = (company or {}).get('company_logo_url') or ''
    if not url.startswith('data:'):
        return None
    try:
        b64 = url.split(',', 1)[1]
        raw = base64.b64decode(b64)
        if 'svg' in url[:30]:
            from svglib.svglib import svg2rlg
            drawing = svg2rlg(BytesIO(raw))
            if not drawing:
                return None
            ratio = min((4.5 * cm) / drawing.width, (3 * cm) / drawing.height, 1)
            drawing.scale(ratio, ratio)
            drawing.width *= ratio
            drawing.height *= ratio
            drawing.hAlign = 'CENTER'
            return drawing
        img = Image(BytesIO(raw))
        # scale to max 4.5cm wide / 3cm high keeping aspect
        ratio = min((4.5 * cm) / img.imageWidth, (3 * cm) / img.imageHeight, 1)
        img.drawWidth = img.imageWidth * ratio
        img.drawHeight = img.imageHeight * ratio
        img.hAlign = 'CENTER'
        return img
    except Exception:
        return None


def _cover(manual, company):
    company = company or {}
    flow = [Spacer(1, 1.2 * cm)]
    logo = _logo_flowable(company)
    if logo:
        flow += [logo, Spacer(1, 0.8 * cm)]
    else:
        flow.append(Spacer(1, 1.5 * cm))
    flow.append(Paragraph(_esc(manual.get('title', 'QUALITY / ENVIRONMENTAL / OHS MANUAL').upper()), S_COVER_TITLE))
    flow.append(Spacer(1, 0.6 * cm))
    name = manual.get('company_name') or company.get('company_name') or ''
    flow.append(Paragraph(_esc(name.upper()), S_COVER_CO))
    addr1 = company.get('street_address') or ''
    addr2 = ' '.join(filter(None, [company.get('suburb'), company.get('state'), str(company.get('postcode') or '')]))
    for line in (addr1, addr2, company.get('country')):
        if line:
            flow.append(Paragraph(_esc(str(line).upper()), S_COVER_ADDR))
    flow.append(Spacer(1, 0.4 * cm))
    if company.get('company_phone'):
        flow.append(Paragraph(f"TELEPHONE: {_esc(company['company_phone'])}", S_COVER_SM))
    if company.get('company_email'):
        flow.append(Paragraph(f"E-MAIL: {_esc(company['company_email'])}", S_COVER_SM))
    flow.append(Spacer(1, 1.1 * cm))
    flow.append(Paragraph('AUTHORIZATION', S_COVER_CO))
    flow.append(Spacer(1, 0.2 * cm))
    flow.append(Paragraph('THIS MANUAL HAS BEEN APPROVED FOR ISSUE BY:', S_COVER_SM))
    approver = manual.get('approved_by') or 'PENDING APPROVAL'
    flow.append(Paragraph(_esc(str(approver).upper()), S_COVER_SM))
    flow.append(Spacer(1, 0.5 * cm))
    flow.append(Paragraph('ISSUED', S_COVER_SM))
    issued = _fmt_date(manual.get('issue_date') or manual.get('approved_at')) or 'PENDING'
    flow.append(Paragraph(_esc(issued), S_COVER_SM))
    flow.append(Spacer(1, 0.9 * cm))
    flow.append(Paragraph(f"Document No: {_esc(manual.get('doc_number', '—'))} &nbsp;&nbsp;·&nbsp;&nbsp; "
                          f"Revision: {manual.get('revision', 1)} &nbsp;&nbsp;·&nbsp;&nbsp; "
                          f"Status: {_esc(manual.get('status', 'Draft'))}", S_CLAUSE))
    flow.append(PageBreak())
    return flow


def _index_table(sections, label_col):
    rows = [[Paragraph(h, S_CELL_B) for h in ('Section', 'Std. Reference', 'Revision', 'Date', label_col)]]
    for s in sections:
        date = _fmt_date(s.get('approved_at') or s.get('updated_at'))
        rows.append([
            Paragraph(_esc(s.get('section_number', '')), S_CELL),
            Paragraph(_esc(s.get('clause_refs', '') or ''), S_CELL),
            Paragraph(str(s.get('revision', 1)), S_CELL),
            Paragraph(date, S_CELL),
            Paragraph(_esc(s.get('title', '')), S_CELL),
        ])
    t = Table(rows, colWidths=[1.8 * cm, 4.6 * cm, 1.7 * cm, 2.1 * cm, _PAGE_W - 10.2 * cm], repeatRows=1)
    t.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#DDDDDD')),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 3), ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    return t


def _index_pages(sections):
    flow = [Paragraph('INDEX', S_IDX_HEAD)]
    flow.append(Paragraph(
        'This Quality / Environmental / OH&amp;S Management System documentation is presented as verification of the '
        'organization\u2019s planned arrangements for the control of Quality, Environmental and OH&amp;S requirements.', S_BODY))
    flow.append(Spacer(1, 0.3 * cm))
    man = [s for s in sections if s.get('part') == 'manual' and s.get('key') != 'front_cover']
    proc = [s for s in sections if s.get('part') == 'procedure']
    if man:
        flow.append(Paragraph('SECTION 1: QUALITY / ENVIRONMENTAL / OH&amp;S MANUAL', S_H2))
        flow.append(_index_table(man, 'System Element Title'))
        flow.append(Spacer(1, 0.5 * cm))
    if proc:
        flow.append(Paragraph('SECTION 2: QUALITY / ENVIRONMENTAL / OH&amp;S PROCEDURES', S_H2))
        flow.append(_index_table(proc, 'System Element Title'))
    flow.append(PageBreak())
    return flow


def _pipe_table(lines):
    grid = [[c.strip() for c in ln.strip().strip('|').split('|')] for ln in lines]
    ncols = max(len(r) for r in grid)
    grid = [r + [''] * (ncols - len(r)) for r in grid]
    data = []
    for i, r in enumerate(grid):
        style = S_CELL_B if i == 0 else S_CELL
        data.append([Paragraph(_esc(c), style) for c in r])
    t = Table(data, colWidths=[_PAGE_W / ncols] * ncols, repeatRows=1)
    t.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#DDDDDD')),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 3), ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    return t


def _strip_redundant_heads(blocks, section):
    """Drop leading blocks that duplicate the generated section heading."""
    num = str(section.get('section_number', '')).strip()
    title = (section.get('title') or '').strip().upper()
    dropped = 0
    while blocks and dropped < 3:
        first = blocks[0].strip()
        u = first.upper()
        if (u == num or u.startswith(f"SECTION {num}") or
                (title and len(first) <= len(title) + 45 and title[:30] in u)):
            blocks.pop(0)
            dropped += 1
        else:
            break
    return blocks


def _content_flow(section):
    num = section.get('section_number', '')
    title = (section.get('title') or '').upper()
    if section.get('part') == 'procedure':
        head = Paragraph(f"{_esc(num)} — {_esc(title)}", S_SEC_HEAD)
    else:
        head = Paragraph(f"SECTION {_esc(num)} — {_esc(title)}", S_SEC_HEAD)
    meta = []
    refs = section.get('clause_refs') or ''
    mapped = section.get('mapped_clauses') or []
    if mapped:
        mtxt = ' · '.join(f"{c.get('standard_name', '')}:{c.get('version', '')} {c.get('clause_number', '')}".strip() for c in mapped)
        refs = f"{refs}   |   {mtxt}" if refs else mtxt
    if refs:
        meta.append(Paragraph(f"ISO Reference: {_esc(refs)}", S_CLAUSE))

    body = []
    blocks = [b for b in (section.get('content') or '').split('\n\n') if b.strip()]
    blocks = _strip_redundant_heads(blocks, section)
    for blk in blocks:
        lines = [ln for ln in blk.split('\n') if ln.strip()]
        table_lines = [ln for ln in lines if ln.strip().startswith('|')]
        if table_lines and len(table_lines) == len(lines):
            body.append(_pipe_table(lines))
            body.append(Spacer(1, 0.2 * cm))
            continue
        first = lines[0].strip() if lines else ''
        if _HEAD_RE.match(first) and len(first) < 120:
            body.append(Paragraph(_esc(first), S_H2))
            rest = '\n'.join(lines[1:]).strip()
            if rest:
                body.append(Paragraph(_esc(rest).replace('\n', '<br/>'), S_BODY))
        else:
            body.append(Paragraph(_esc(blk.strip()).replace('\n', '<br/>'), S_BODY))
    flow = [CondPageBreak(5 * cm), KeepTogether([head] + meta + body[:1])]
    flow += body[1:]
    return flow


def build_manual_pdf(manual, sections, single_section=None, company=None):
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=1.8 * cm, bottomMargin=2.5 * cm,
                            leftMargin=2 * cm, rightMargin=2 * cm)
    story = []
    if single_section is None:
        story += _cover(manual, company)
        story += _index_pages(sections)
        targets = [s for s in sections if s.get('key') != 'front_cover']
    else:
        targets = [single_section]
    for i, s in enumerate(targets):
        story += _content_flow(s)
        if single_section is None and i < len(targets) - 1:
            story.append(PageBreak())

    name = (manual.get('company_name') or (company or {}).get('company_name') or '').upper()
    meta = {
        'doc_number': manual.get('doc_number'),
        'status': manual.get('status', 'Draft'),
        'footer_left': f"{name} {manual.get('title', 'IMS MANUAL').upper()}"[:78],
        'issue_line': _issue_line(manual),
    }
    if single_section is not None:
        meta['status'] = single_section.get('status', 'Draft')

    def canv(*a, **k):
        c = _Footer(*a, **k)
        c.meta = meta
        return c
    doc.build(story, canvasmaker=canv)
    buf.seek(0)
    return buf
