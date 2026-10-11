"""
PDF Generator for ISO/IMS Audit Reports
Matches the exact format with black bold headers and Calibri font
Includes page numbers and footer for ISO compliance
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm, mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY, TA_RIGHT
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle, KeepTogether
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from datetime import datetime
from io import BytesIO
import os
import re

# Try to register Calibri font, fallback to Helvetica if not available
try:
    # For Linux systems, try common font locations
    calibri_paths = [
        '/usr/share/fonts/truetype/msttcorefonts/calibri.ttf',
        '/usr/share/fonts/truetype/calibri/calibri.ttf',
        'C:/Windows/Fonts/calibri.ttf',  # Windows
    ]
    
    calibri_found = False
    for path in calibri_paths:
        if os.path.exists(path):
            pdfmetrics.registerFont(TTFont('Calibri', path))
            calibri_found = True
            break
    
    if not calibri_found:
        # Fallback: use Helvetica
        from reportlab.pdfbase._fontdata import _fonts
        # Map Calibri to Helvetica
        FONT_NORMAL = 'Helvetica'
        FONT_BOLD = 'Helvetica-Bold'
    else:
        FONT_NORMAL = 'Calibri'
        FONT_BOLD = 'Calibri-Bold'
except Exception:
    # If any error, use Helvetica
    FONT_NORMAL = 'Helvetica'
    FONT_BOLD = 'Helvetica-Bold'


class FooterCanvas(canvas.Canvas):
    """Custom canvas to add footer with page numbers to each page"""
    
    def __init__(self, *args, **kwargs):
        canvas.Canvas.__init__(self, *args, **kwargs)
        self._saved_page_states = []
        self.audit_info = kwargs.get('audit_info', {})

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        """Add page numbers to all pages"""
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_footer(num_pages)
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)

    def draw_footer(self, page_count):
        """Draw footer with page numbers and Document Control info pulled from
        the Document Control register (Form No / Issue / Revision Date / Owner)."""
        page_num = self._pageNumber

        # ── Document Control line (top) ────────────────────────────────
        dc = self.audit_info.get('doc_control') or {}
        rev = dc.get('revision_date') or ''
        # Format ISO date YYYY-MM-DD → DD/MM/YYYY for AU readers
        if rev and len(rev) >= 10 and rev[4] == '-' and rev[7] == '-':
            rev = f"{rev[8:10]}/{rev[5:7]}/{rev[0:4]}"
        dc_line = (
            f"Form No: {dc.get('form_no') or '—'}"
            f"   |   Issue: {dc.get('issue') or '—'}"
            f"   |   Revision Date: {rev or '—'}"
            f"   |   Owner: {dc.get('owner') or '—'}"
            f"   |   Title: {dc.get('title') or 'ISO Audit Report'}"
        )
        self.saveState()
        self.setStrokeColor(colors.HexColor('#444444'))
        self.setLineWidth(0.6)
        # Doc-control line sits ABOVE the page-info line
        self.line(2*cm, 1.95*cm, A4[0] - 2*cm, 1.95*cm)
        self.setFont(FONT_BOLD, 8)
        self.setFillColor(colors.black)
        self.drawString(2*cm, 1.7*cm, dc_line)

        # ── Page-info line (bottom) ────────────────────────────────────
        self.setStrokeColor(colors.HexColor('#CCCCCC'))
        self.setLineWidth(0.4)
        self.line(2*cm, 1.5*cm, A4[0] - 2*cm, 1.5*cm)
        self.setFont(FONT_NORMAL, 8)
        self.setFillColor(colors.HexColor('#666666'))

        report_text = f"{self.audit_info.get('report_number', 'N/A')} - {self.audit_info.get('client_name', 'N/A')}"
        self.drawString(2*cm, 1.2*cm, report_text)

        standards_text = " / ".join(self.audit_info.get('standards_audited', []))
        text_width = self.stringWidth(standards_text, FONT_NORMAL, 8)
        self.drawString((A4[0] - text_width) / 2, 1.2*cm, standards_text)

        page_text = f"Page {page_num} of {page_count}"
        page_width = self.stringWidth(page_text, FONT_BOLD, 9)
        self.setFont(FONT_BOLD, 9)
        self.setFillColor(colors.black)
        self.drawString(A4[0] - 2*cm - page_width, 1.2*cm, page_text)

        self.restoreState()



def clean_html_for_reportlab(html_text):
    """
    Convert contentEditable HTML to ReportLab format
    - Preserves <b> for bold
    - Preserves line breaks and spacing
    - Converts bullets to • symbol
    - Maintains formatting exactly as shown on screen
    """
    if not html_text:
        return ""
    
    # Ensure we're working with a string
    if not isinstance(html_text, str):
        return str(html_text)
    
    try:
        # Handle <br> variants - preserve all line breaks
        html_text = html_text.replace('<br>', '<br/>')
        html_text = html_text.replace('<br />', '<br/>')
        
        # Preserve bold - convert <strong> to <b>
        html_text = re.sub(r'<strong>(.*?)</strong>', r'<b>\1</b>', html_text, flags=re.DOTALL)
        
        # Handle bullet lists - convert to bullet symbol with proper formatting
        # Remove <ul> tags but keep structure
        html_text = re.sub(r'<ul[^>]*>', '', html_text)
        html_text = re.sub(r'</ul>', '<br/>', html_text)
        
        # Convert <li> to bullets - preserve content exactly
        html_text = re.sub(r'<li[^>]*>', '• ', html_text)
        html_text = re.sub(r'</li>', '<br/>', html_text)
        
        # Remove <div> and <p> but keep content and breaks
        html_text = re.sub(r'<div[^>]*>', '', html_text)
        html_text = re.sub(r'</div>', '<br/>', html_text)
        html_text = re.sub(r'<p[^>]*>', '', html_text)
        html_text = re.sub(r'</p>', '<br/>', html_text)
        
        # Remove any other HTML tags except <b>, <i>, <br/>
        html_text = re.sub(r'<(?!/?(b|i|br/?))[^>]+>', '', html_text)
        
        # Clean up excessive line breaks (more than 2 consecutive)
        html_text = re.sub(r'(<br/>){4,}', '<br/><br/><br/>', html_text)
        
        # Remove leading/trailing breaks
        html_text = re.sub(r'^(<br/>)+', '', html_text)
        html_text = re.sub(r'(<br/>)+$', '', html_text)
        
        return html_text.strip()
    except Exception as e:
        # Fallback to plain text
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error cleaning HTML: {e}, HTML was: {html_text[:200]}")
        return re.sub(r'<[^>]+>', '', str(html_text))


def generate_audit_pdf(audit_data, findings_data, samples_data=None):
    """
    Generate PDF report matching John Tsoukalas template format
    
    Args:
        audit_data: Dict containing audit report information
        findings_data: List of findings with evidence and details
    
    Returns:
        BytesIO buffer containing the generated PDF
    """
    import logging
    logger = logging.getLogger(__name__)
    
    logger.info("Starting PDF generation")
    logger.info(f"Audit data keys: {audit_data.keys()}")
    logger.info(f"Number of findings: {len(findings_data)}")
    
    buffer = BytesIO()
    
    # Create custom canvas function with audit info
    def get_canvas(buffer, audit_info):
        def canvas_factory(*args, **kwargs):
            kwargs['audit_info'] = audit_info
            return FooterCanvas(*args, **kwargs)
        return canvas_factory
    
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=2*cm,
        leftMargin=2*cm,
        topMargin=2*cm,
        bottomMargin=2.9*cm  # Increased for two-line footer (Doc Control + page info)
    )
    # Usable body height of one page — used to control finding pagination below
    usable_h = A4[1] - doc.topMargin - doc.bottomMargin
    
    # Define custom styles matching the template
    styles = getSampleStyleSheet()
    
    # Black header style for auditor name and main title
    black_header_style = ParagraphStyle(
        'BlackHeader',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.black,
        alignment=TA_CENTER,
        spaceAfter=10,
        fontName=FONT_BOLD
    )
    
    # Black centered title style for main report title
    black_title_style = ParagraphStyle(
        'BlackTitle',
        parent=styles['Heading1'],
        fontSize=18,
        textColor=colors.black,
        alignment=TA_CENTER,
        spaceAfter=20,
        fontName=FONT_BOLD
    )
    
    # Bold label style
    bold_label_style = ParagraphStyle(
        'BoldLabel',
        parent=styles['Normal'],
        fontSize=11,
        fontName=FONT_BOLD,
        spaceAfter=2
    )
    
    # Normal text style
    normal_style = ParagraphStyle(
        'NormalText',
        parent=styles['Normal'],
        fontSize=11,
        fontName=FONT_NORMAL,
        spaceAfter=8,
        alignment=TA_JUSTIFY
    )
    
    # Clause number style
    clause_number_style = ParagraphStyle(
        'ClauseNumber',
        parent=styles['Normal'],
        fontSize=12,
        fontName=FONT_BOLD,
        textColor=colors.HexColor('#2563EB'),
        spaceAfter=4
    )
    
    # Clause title style
    clause_title_style = ParagraphStyle(
        'ClauseTitle',
        parent=styles['Normal'],
        fontSize=11,
        fontName=FONT_BOLD,
        spaceAfter=2
    )
    
    # ISO reference style
    iso_ref_style = ParagraphStyle(
        'ISORef',
        parent=styles['Normal'],
        fontSize=9,
        fontName=FONT_NORMAL,
        textColor=colors.HexColor('#64748B'),
        spaceAfter=6
    )
    
    # Evidence/Findings label style
    finding_label_style = ParagraphStyle(
        'FindingLabel',
        parent=styles['Normal'],
        fontSize=10,
        fontName=FONT_BOLD,
        spaceAfter=2,
        keepWithNext=True  # keep labels like "Summary:" attached to their text
    )
    
    # Evidence/Findings text style
    finding_text_style = ParagraphStyle(
        'FindingText',
        parent=styles['Normal'],
        fontSize=10,
        fontName=FONT_NORMAL,
        spaceAfter=8,
        alignment=TA_JUSTIFY
    )
    
    # Build PDF content
    story = []
    
    # 1. HEADER: Auditor Name (Black, Bold, Centered)
    auditor_header = Paragraph(
        f"{audit_data['auditor_name']} – Audit Report",
        black_header_style
    )
    story.append(auditor_header)
    story.append(Spacer(1, 15))
    
    # 2. Report Number and Date
    report_no = Paragraph(f"<b>Report No.:</b> {audit_data.get('report_number', 'N/A')}", normal_style)
    story.append(report_no)
    
    # Format Audit Start / End dates in DD/MM/YYYY (fall back to report_date if start not provided)
    def _fmt_date(val):
        try:
            if not val:
                return None
            if isinstance(val, str):
                d = datetime.fromisoformat(val.replace('Z', '+00:00'))
            else:
                d = val
            return d.strftime('%d/%m/%Y')
        except Exception:
            return None

    start_str = _fmt_date(audit_data.get('audit_start_date')) or _fmt_date(audit_data.get('report_date')) or datetime.now().strftime('%d/%m/%Y')
    end_str = _fmt_date(audit_data.get('audit_end_date'))

    audit_start = Paragraph(f"<b>Audit Start Date:</b> {start_str}", normal_style)
    story.append(audit_start)
    if end_str:
        audit_end = Paragraph(f"<b>Audit End Date:</b> {end_str}", normal_style)
        story.append(audit_end)
    story.append(Spacer(1, 20))
    
    # 3. MAIN TITLE (Black, Bold, Centered, All Caps)
    main_title = Paragraph(
        audit_data.get('report_type', 'INTERNAL AUDIT REPORT – IMS (QUALITY / ENVIRONMENTAL / OHS)'),
        black_title_style
    )
    story.append(main_title)
    story.append(Spacer(1, 20))
    
    # 4. Client
    client = Paragraph(f"<b>Client:</b> {audit_data['client_name']}", normal_style)
    story.append(client)
    story.append(Spacer(1, 15))
    
    # 5. Assessed Sites
    story.append(Paragraph("<b>Assessed Site(s):</b>", bold_label_style))
    assessed_sites_lines = audit_data['assessed_sites'].split(',')
    for line in assessed_sites_lines:
        story.append(Paragraph(line.strip(), normal_style))
    story.append(Spacer(1, 15))
    
    # 6. Standards
    standards_text = " / ".join(audit_data['standards_audited'])
    standards = Paragraph(f"<b>Standards:</b> {standards_text}", normal_style)
    story.append(standards)
    story.append(Spacer(1, 15))
    
    # 7. Scope
    story.append(Paragraph("<b>Scope:</b>", bold_label_style))
    story.append(Spacer(1, 5))
    scope = Paragraph(audit_data['scope_of_audit'], normal_style)
    story.append(scope)
    story.append(Spacer(1, 15))
    
    # 8. Exclusion (if exists)
    if audit_data.get('exclusions'):
        story.append(Paragraph("<b>Exclusion:</b>", bold_label_style))
        exclusion = Paragraph(audit_data['exclusions'], normal_style)
        story.append(exclusion)
        story.append(Spacer(1, 20))
    
    # Page break before findings
    story.append(PageBreak())
    
    # 9. FINDINGS SECTION
    story.append(Paragraph("<b>AUDIT FINDINGS</b>", black_title_style))
    story.append(Spacer(1, 15))
    
    # Sort findings by clause number
    sorted_findings = sorted(findings_data, key=lambda x: parse_clause_number(x['clause_number']))
    
    for finding in sorted_findings:
        try:
            logger.info(f"Processing finding: {finding.get('clause_number', 'unknown')}")
            
            # Create a box for each finding
            finding_content = []
            
            # Clause number and title
            clause_header = f"<b><font color='#2563EB'>{finding['clause_number']}</font></b> - {finding['clause_title']}"
            finding_content.append(Paragraph(clause_header, clause_title_style))
        except Exception as e:
            logger.error(f"Error in finding header for clause {finding.get('clause_number')}: {str(e)}")
            continue
        
        # ISO reference
        if finding.get('iso_clause_reference'):
            finding_content.append(Paragraph(
                f"<i>{finding['iso_clause_reference']}</i>",
                iso_ref_style
            ))
        
        # Finding type badge with color coding
        finding_type = finding.get('finding_type', 'Conformity')
        badge_color = get_finding_badge_color(finding_type)
        
        # Create finding type display with reference numbers
        finding_type_text = finding_type
        if finding_type == 'OFI' and finding.get('ofi_reference'):
            finding_type_text += f" - {finding['ofi_reference']}"
        elif finding_type in ['Minor NCR', 'Major NCR'] and finding.get('ncr_number'):
            finding_type_text += f" - {finding['ncr_number']}"
        
        # Finding type with colored background
        finding_badge_table = Table(
            [[Paragraph(f"<b>{finding_type_text}</b>", finding_label_style)]],
            colWidths=[None]
        )
        finding_badge_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), badge_color),
            ('TEXTCOLOR', (0, 0), (-1, -1), get_finding_text_color(finding_type)),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('ROUNDEDCORNERS', (0, 0), (-1, -1), 3),
        ]))
        finding_content.append(finding_badge_table)
        finding_content.append(Spacer(1, 8))
        
        # Evidence (no heading label, just content)
        if finding.get('evidence'):
            try:
                clean_evidence = clean_html_for_reportlab(finding['evidence'])
                logger.info(f"Cleaned evidence for {finding['clause_number']}: {clean_evidence[:100]}")
                
                if clean_evidence and clean_evidence.strip():
                    finding_content.append(Paragraph(clean_evidence, finding_text_style))
                    finding_content.append(Spacer(1, 6))
            except Exception as e:
                logger.error(f"Error processing evidence for {finding['clause_number']}: {str(e)}, Content: {finding.get('evidence', '')[:200]}")
                # Try to add plain text as fallback
                try:
                    import html
                    plain_text = html.unescape(re.sub('<[^<]+?>', '', finding['evidence']))
                    if plain_text and plain_text.strip():
                        finding_content.append(Paragraph(plain_text, finding_text_style))
                        finding_content.append(Spacer(1, 6))
                except Exception:
                    pass  # Skip if we can't process evidence
        
        # Summary (renamed from Findings)
        if finding.get('findings'):
            try:
                finding_content.append(Paragraph("<b>Summary:</b>", finding_label_style))
                clean_findings = clean_html_for_reportlab(finding['findings'])
                logger.info(f"Cleaned summary for {finding['clause_number']}: {clean_findings[:100]}")
                
                # Try to create the paragraph
                if clean_findings and clean_findings.strip():
                    finding_content.append(Paragraph(clean_findings, finding_text_style))
                else:
                    finding_content.append(Paragraph("No summary provided", finding_text_style))
            except Exception as e:
                logger.error(f"Error processing summary for {finding['clause_number']}: {str(e)}, Content: {finding.get('findings', '')[:200]}")
                # Add the raw text as fallback
                try:
                    import html
                    from reportlab.lib.utils import simpleSplit
                    plain_text = html.unescape(re.sub('<[^<]+?>', '', finding['findings']))
                    finding_content.append(Paragraph(plain_text or "Unable to process summary", finding_text_style))
                except Exception:
                    finding_content.append(Paragraph("[Unable to process summary content]", finding_text_style))
        
        # NCR Details (if applicable)
        if finding_type in ['Minor NCR', 'Major NCR']:
            if finding.get('ncr_date'):
                try:
                    ncr_date_str = finding['ncr_date']
                    if isinstance(ncr_date_str, str):
                        ncr_date_obj = datetime.fromisoformat(ncr_date_str.replace('Z', '+00:00'))
                    else:
                        ncr_date_obj = ncr_date_str
                    formatted_ncr_date = ncr_date_obj.strftime('%d/%m/%Y')
                    finding_content.append(Paragraph(f"<b>NCR Date:</b> {formatted_ncr_date}", finding_text_style))
                except Exception:
                    pass
            
            if finding.get('ncr_customer_supplier'):
                finding_content.append(Paragraph(
                    f"<b>Customer/Supplier:</b> {finding['ncr_customer_supplier']}", 
                    finding_text_style
                ))
            
            if finding.get('ncr_root_cause'):
                finding_content.append(Paragraph("<b>Root Cause:</b>", finding_label_style))
                clean_root_cause = clean_html_for_reportlab(finding['ncr_root_cause'])
                finding_content.append(Paragraph(clean_root_cause, finding_text_style))
            
            if finding.get('ncr_action_taken'):
                finding_content.append(Paragraph("<b>Corrective Action Taken:</b>", finding_label_style))
                clean_action_taken = clean_html_for_reportlab(finding['ncr_action_taken'])
                finding_content.append(Paragraph(clean_action_taken, finding_text_style))
        
        # Samples checked for this section (Type / ID / Name / Location / Result)
        f_samples = [s for s in (samples_data or []) if s.get('finding_id') == finding.get('id')]
        if f_samples:
            finding_content.append(Paragraph("<b>Samples checked:</b>", finding_label_style))
            s_rows = [[Paragraph('<b>Type</b>', finding_text_style), Paragraph('<b>ID</b>', finding_text_style),
                       Paragraph('<b>Name</b>', finding_text_style), Paragraph('<b>Location</b>', finding_text_style),
                       Paragraph('<b>Result</b>', finding_text_style)]]
            for s in f_samples:
                s_rows.append([Paragraph(str(s.get(k) or ''), finding_text_style)
                               for k in ('sample_type', 'sample_id', 'name', 'location', 'result')])
            s_tbl = Table(s_rows, colWidths=[90, 80, 110, 110, 70])
            s_tbl.setStyle(TableStyle([
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#94a3b8')),
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f1f5f9')),
                ('TOPPADDING', (0, 0), (-1, -1), 2), ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
                ('LEFTPADDING', (0, 0), (-1, -1), 4), ('RIGHTPADDING', (0, 0), (-1, -1), 4),
            ]))
            finding_content.append(s_tbl)
            finding_content.append(Spacer(1, 6))

        # Corrective action details (extended IMS fields)
        _ca_bits = []
        if finding.get('corrective_action'):
            _ca_bits.append(f"<b>Corrective action:</b> {finding['corrective_action']}")
        if finding.get('responsible_person'):
            _ca_bits.append(f"<b>Responsible:</b> {finding['responsible_person']}")
        if finding.get('due_date'):
            _ca_bits.append(f"<b>Due:</b> {finding['due_date']}")
        if finding.get('effectiveness_verified_by'):
            _ca_bits.append(f"<b>Effectiveness verified by:</b> {finding['effectiveness_verified_by']} {finding.get('effectiveness_verification_date') or ''}")
        if _ca_bits:
            finding_content.append(Paragraph(" &nbsp;·&nbsp; ".join(_ca_bits), finding_text_style))

        # Follow-up indicator
        if finding.get('is_follow_up_required'):
            finding_content.append(Paragraph(
                "<b>⚠ Follow-up Required</b>", 
                finding_label_style
            ))
        
        # Add spacing after each finding
        finding_content.append(Spacer(1, 12))
        
        # Pagination: keep short/medium findings whole on one page. Very long
        # findings are allowed to flow and split across pages — otherwise they
        # get pushed to a fresh page, leaving large blank areas behind.
        content_chars = sum(len(finding.get(k) or '') for k in
                            ('evidence', 'findings', 'ncr_root_cause', 'ncr_action_taken'))
        if content_chars <= 1800:
            story.append(KeepTogether(finding_content))
        else:
            # maxHeight = full page ⇒ never pushed to next page; splits in place
            story.append(KeepTogether(finding_content, maxHeight=usable_h))
    
    # 10. CONCLUSION (if exists) — flows after the last finding (no forced page break)
    if audit_data.get('conclusion') or audit_data.get('overall_recommendation'):
        concl_content = [Spacer(1, 10), Paragraph("<b>CONCLUSION AND RECOMMENDATIONS</b>", black_title_style), Spacer(1, 15)]
        
        if audit_data.get('conclusion'):
            concl_content.append(Paragraph("<b>Conclusion:</b>", bold_label_style))
            concl_content.append(Paragraph(audit_data['conclusion'], normal_style))
            concl_content.append(Spacer(1, 10))
        
        if audit_data.get('overall_recommendation'):
            concl_content.append(Paragraph("<b>Overall Recommendation:</b>", bold_label_style))
            concl_content.append(Paragraph(audit_data['overall_recommendation'], normal_style))
        
        concl_chars = len(audit_data.get('conclusion') or '') + len(audit_data.get('overall_recommendation') or '')
        if concl_chars <= 1800:
            story.append(KeepTogether(concl_content))
        else:
            story.append(KeepTogether(concl_content, maxHeight=usable_h))
    
    # 11. CORRECTIVE ACTION SUMMARY TABLE (open items across the audit)
    ca_rows = [f for f in findings_data if f.get('corrective_action_required') or
               f.get('finding_type') in ('Minor NCR', 'Major NCR', 'Minor Nonconformity', 'Major Nonconformity', 'Correction Required')]
    if ca_rows:
        ca_content = [Spacer(1, 12), Paragraph("<b>CORRECTIVE ACTION SUMMARY</b>", bold_label_style), Spacer(1, 6)]
        t_rows = [[Paragraph(f'<b>{h}</b>', finding_text_style) for h in
                   ('Clause', 'Finding', 'Corrective action', 'Responsible', 'Due date', 'Status')]]
        for f in ca_rows:
            t_rows.append([
                Paragraph(str(f.get('clause_number') or ''), finding_text_style),
                Paragraph(str(f.get('finding_type') or ''), finding_text_style),
                Paragraph(str(f.get('corrective_action') or f.get('ncr_action_taken') or '')[:200], finding_text_style),
                Paragraph(str(f.get('responsible_person') or ''), finding_text_style),
                Paragraph(str(f.get('due_date') or ''), finding_text_style),
                Paragraph(str(f.get('final_status') or f.get('status') or 'Open'), finding_text_style),
            ])
        ca_tbl = Table(t_rows, colWidths=[45, 75, 175, 80, 60, 60])
        ca_tbl.setStyle(TableStyle([
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#94a3b8')),
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f1f5f9')),
            ('TOPPADDING', (0, 0), (-1, -1), 3), ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('LEFTPADDING', (0, 0), (-1, -1), 4), ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ]))
        ca_content.append(ca_tbl)
        story.append(KeepTogether(ca_content, maxHeight=usable_h))
    
    # 12. SIGN-OFF
    signoff = [
        Spacer(1, 18),
        Paragraph("<b>AUDITOR SIGN-OFF</b>", bold_label_style),
        Spacer(1, 8),
        Paragraph(f"Auditor: {audit_data.get('auditor_name', '')} &nbsp;&nbsp;&nbsp; Signature: ______________________ &nbsp;&nbsp;&nbsp; Date: ______________", normal_style),
        Spacer(1, 6),
        Paragraph("Management representative: ______________________ &nbsp;&nbsp;&nbsp; Signature: ______________________ &nbsp;&nbsp;&nbsp; Date: ______________", normal_style),
    ]
    story.append(KeepTogether(signoff))
    
    # Build PDF with custom canvas
    canvas_factory = get_canvas(buffer, audit_data)
    doc.build(story, canvasmaker=canvas_factory)
    buffer.seek(0)
    return buffer


def parse_clause_number(clause_num_str):
    """Parse clause number for proper sorting (e.g., '2.10' should come after '2.9')"""
    try:
        parts = clause_num_str.split('.')
        if len(parts) == 1:
            return (float(parts[0]), 0)
        elif len(parts) == 2:
            return (float(parts[0]), float(parts[1]))
        else:
            return (float(parts[0]), float('.'.join(parts[1:])))
    except Exception:
        return (0, 0)


def get_finding_badge_color(finding_type):
    """Get background color for finding badge based on type"""
    colors_map = {
        'Conformity': colors.HexColor('#DCFCE7'),  # Light green
        'OFI': colors.HexColor('#DBEAFE'),  # Light blue
        'Minor NCR': colors.HexColor('#FEF3C7'),  # Light yellow
        'Major NCR': colors.HexColor('#FEE2E2'),  # Light red
    }
    return colors_map.get(finding_type, colors.HexColor('#F3F4F6'))


def get_finding_text_color(finding_type):
    """Get text color for finding badge based on type"""
    text_colors_map = {
        'Conformity': colors.HexColor('#166534'),  # Dark green
        'OFI': colors.HexColor('#1E40AF'),  # Dark blue
        'Minor NCR': colors.HexColor('#854D0E'),  # Dark yellow/brown
        'Major NCR': colors.HexColor('#991B1B'),  # Dark red
    }
    return text_colors_map.get(finding_type, colors.HexColor('#374151'))


def generate_quote_pdf(quote: dict) -> bytes:
    """
    Generate PDF for a quote
    
    Args:
        quote: Quote dictionary with all quote details
        
    Returns:
        PDF content as bytes
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=2*cm, bottomMargin=2*cm)
    story = []
    styles = getSampleStyleSheet()
    
    # Title
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor('#2563eb'),
        spaceAfter=30,
        alignment=TA_CENTER
    )
    story.append(Paragraph(f"QUOTE #{quote.get('quote_number', 'N/A')}", title_style))
    story.append(Spacer(1, 0.5*cm))
    
    # Company Info
    company_style = ParagraphStyle(
        'Company',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.HexColor('#666666')
    )
    story.append(Paragraph("<b>Nestix ERP</b>", company_style))
    story.append(Paragraph("Quote Management System", company_style))
    story.append(Spacer(1, 0.5*cm))
    
    # Quote Details
    created_at = quote.get('created_at', datetime.now())
    if isinstance(created_at, str):
        date_str = created_at[:10]
    else:
        date_str = created_at.strftime('%Y-%m-%d') if hasattr(created_at, 'strftime') else str(created_at)[:10]
    
    details_data = [
        ['Quote Number:', quote.get('quote_number', 'N/A')],
        ['Date:', date_str],
        ['Customer:', quote.get('customer_name', 'N/A')],
        ['Status:', quote.get('status', 'Draft')],
    ]
    
    details_table = Table(details_data, colWidths=[4*cm, 10*cm])
    details_table.setStyle(TableStyle([
        ('FONT', (0, 0), (0, -1), FONT_BOLD, 10),
        ('FONT', (1, 0), (1, -1), FONT_NORMAL, 10),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(details_table)
    story.append(Spacer(1, 1*cm))
    
    # Part Description
    if quote.get('part_description'):
        story.append(Paragraph(f"<b>Part Description:</b> {quote.get('part_description')}", styles['Normal']))
        story.append(Spacer(1, 0.5*cm))
    
    # Multi-item quote handling
    if quote.get('is_multi_item') and quote.get('line_items'):
        story.append(Paragraph("<b>Line Items:</b>", styles['Heading2']))
        story.append(Spacer(1, 0.3*cm))
        
        for idx, item in enumerate(quote.get('line_items', []), 1):
            item_data = [
                [f"Item {idx}: {item.get('part_description', 'N/A')}"],
                [f"Quantity: {item.get('quantity', 0)}"],
                [f"Material: {item.get('material_type', 'N/A')}"],
                [f"Total: ${item.get('total', 0):,.2f}"],
            ]
            item_table = Table(item_data, colWidths=[14*cm])
            item_table.setStyle(TableStyle([
                ('FONT', (0, 0), (0, 0), FONT_BOLD, 11),
                ('FONT', (0, 1), (0, -1), FONT_NORMAL, 10),
                ('BACKGROUND', (0, 0), (0, 0), colors.HexColor('#f3f4f6')),
                ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#e5e7eb')),
            ]))
            story.append(item_table)
            story.append(Spacer(1, 0.3*cm))
    else:
        # Single item quote
        if quote.get('material_type'):
            story.append(Paragraph(f"<b>Material:</b> {quote.get('material_type')} - {quote.get('material_grade', '')} - {quote.get('thickness', '')}mm", styles['Normal']))
            story.append(Spacer(1, 0.3*cm))
        
        if quote.get('quantity_required'):
            story.append(Paragraph(f"<b>Quantity:</b> {quote.get('quantity_required')}", styles['Normal']))
            story.append(Spacer(1, 0.3*cm))
    
    story.append(Spacer(1, 1*cm))
    
    # Pricing Summary
    story.append(Paragraph("<b>Pricing Summary:</b>", styles['Heading2']))
    story.append(Spacer(1, 0.3*cm))
    
    pricing_data = [
        ['Subtotal (Ex GST):', f"${quote.get('subtotal_ex_gst', quote.get('total_job_cost', 0)):,.2f}"],
        ['GST (10%):', f"${quote.get('gst_value', 0):,.2f}"],
        ['<b>Total (Inc GST):</b>', f"<b>${quote.get('quote_total', 0):,.2f}</b>"],
    ]
    
    pricing_table = Table(pricing_data, colWidths=[10*cm, 4*cm])
    pricing_table.setStyle(TableStyle([
        ('FONT', (0, 0), (0, 1), FONT_NORMAL, 10),
        ('FONT', (1, 0), (1, 1), FONT_NORMAL, 10),
        ('FONT', (0, 2), (-1, 2), FONT_BOLD, 12),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LINEABOVE', (0, 2), (-1, 2), 2, colors.black),
    ]))
    story.append(pricing_table)
    story.append(Spacer(1, 1*cm))
    
    # Terms
    story.append(Paragraph("<b>Terms & Conditions:</b>", styles['Heading3']))
    story.append(Paragraph("This quote is valid for 30 days from the date of issue.", styles['Normal']))
    story.append(Paragraph("Payment terms: Net 30 days from invoice date.", styles['Normal']))
    
    # Build PDF
    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()


def generate_invoice_pdf(invoice: dict) -> bytes:
    """
    Generate PDF for an invoice
    
    Args:
        invoice: Invoice dictionary with all invoice details
        
    Returns:
        PDF content as bytes
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=2*cm, bottomMargin=2*cm)
    story = []
    styles = getSampleStyleSheet()
    
    # Title
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor('#dc2626'),
        spaceAfter=30,
        alignment=TA_CENTER
    )
    story.append(Paragraph(f"INVOICE #{invoice.get('invoice_number', 'N/A')}", title_style))
    story.append(Spacer(1, 0.5*cm))
    
    # Company Info
    company_style = ParagraphStyle(
        'Company',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.HexColor('#666666')
    )
    story.append(Paragraph("<b>Nestix ERP</b>", company_style))
    story.append(Paragraph("Invoice Management System", company_style))
    story.append(Spacer(1, 0.5*cm))
    
    # Invoice Details
    invoice_date = invoice.get('invoice_date', datetime.now())
    if isinstance(invoice_date, str):
        invoice_date_str = invoice_date[:10] if len(invoice_date) >= 10 else invoice_date
    else:
        invoice_date_str = invoice_date.strftime('%Y-%m-%d') if hasattr(invoice_date, 'strftime') else str(invoice_date)[:10]
    
    due_date = invoice.get('due_date', 'Upon receipt')
    if isinstance(due_date, str):
        due_date_str = due_date[:10] if len(due_date) >= 10 else due_date
    else:
        due_date_str = due_date.strftime('%Y-%m-%d') if hasattr(due_date, 'strftime') else str(due_date)[:10]
    
    details_data = [
        ['Invoice Number:', invoice.get('invoice_number', 'N/A')],
        ['Date:', invoice_date_str],
        ['Due Date:', due_date_str],
        ['Customer:', invoice.get('customer_name', 'N/A')],
        ['Job Sheet:', invoice.get('job_sheet_number', 'N/A')],
    ]
    
    details_table = Table(details_data, colWidths=[4*cm, 10*cm])
    details_table.setStyle(TableStyle([
        ('FONT', (0, 0), (0, -1), FONT_BOLD, 10),
        ('FONT', (1, 0), (1, -1), FONT_NORMAL, 10),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(details_table)
    story.append(Spacer(1, 1*cm))
    
    # Line Items
    if invoice.get('line_items'):
        story.append(Paragraph("<b>Items:</b>", styles['Heading2']))
        story.append(Spacer(1, 0.3*cm))
        
        items_data = [['Description', 'Quantity', 'Unit Price', 'Total']]
        for item in invoice.get('line_items', []):
            items_data.append([
                item.get('description', 'N/A'),
                str(item.get('quantity', 0)),
                f"${item.get('unit_price', 0):,.2f}",
                f"${item.get('total', 0):,.2f}"
            ])
        
        items_table = Table(items_data, colWidths=[7*cm, 2*cm, 3*cm, 3*cm])
        items_table.setStyle(TableStyle([
            ('FONT', (0, 0), (-1, 0), FONT_BOLD, 10),
            ('FONT', (0, 1), (-1, -1), FONT_NORMAL, 10),
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f3f4f6')),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),
            ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#e5e7eb')),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
        ]))
        story.append(items_table)
        story.append(Spacer(1, 1*cm))
    
    # Pricing Summary
    story.append(Paragraph("<b>Payment Summary:</b>", styles['Heading2']))
    story.append(Spacer(1, 0.3*cm))
    
    pricing_data = [
        ['Subtotal (Ex GST):', f"${invoice.get('subtotal', 0):,.2f}"],
        ['GST (10%):', f"${invoice.get('gst', 0):,.2f}"],
        ['<b>Total Amount Due:</b>', f"<b>${invoice.get('total', 0):,.2f}</b>"],
    ]
    
    pricing_table = Table(pricing_data, colWidths=[10*cm, 4*cm])
    pricing_table.setStyle(TableStyle([
        ('FONT', (0, 0), (0, 1), FONT_NORMAL, 10),
        ('FONT', (1, 0), (1, 1), FONT_NORMAL, 10),
        ('FONT', (0, 2), (-1, 2), FONT_BOLD, 12),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LINEABOVE', (0, 2), (-1, 2), 2, colors.black),
    ]))
    story.append(pricing_table)
    story.append(Spacer(1, 1*cm))
    
    # Payment Instructions
    story.append(Paragraph("<b>Payment Instructions:</b>", styles['Heading3']))
    story.append(Paragraph("Please remit payment by the due date to avoid late fees.", styles['Normal']))
    story.append(Paragraph("For payment inquiries, please contact our accounts department.", styles['Normal']))
    
    # Build PDF
    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()

