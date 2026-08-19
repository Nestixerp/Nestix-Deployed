"""RFQ (Request for Quote) module — material purchasing enquiries sent to
suppliers via a public link (no email integration needed, like customer surveys).

Auth:   POST/GET /api/rfqs, GET /api/rfqs/{id}, PUT /api/rfqs/{id}/status, DELETE /api/rfqs/{id}
Public: GET /api/rfqs/public/{token}, POST /api/rfqs/public/{token}/respond
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import os
import uuid
import secrets

from auth import get_current_user

router = APIRouter(prefix="/api/rfqs", tags=["RFQs"])
client = AsyncIOMotorClient(os.environ.get('MONGO_URL'))
db = client[os.environ.get('DB_NAME')]

RFQS, RESPONSES = "rfqs", "rfq_responses"


def _now():
    return datetime.now(timezone.utc).isoformat()


class RFQItem(BaseModel):
    id: Optional[str] = None
    description: str
    material_type: Optional[str] = ""
    size: Optional[str] = ""
    code: Optional[str] = ""
    quantity: float = 1
    notes: Optional[str] = ""


class RFQIn(BaseModel):
    title: str
    notes: Optional[str] = ""
    required_by: Optional[str] = ""
    items: List[RFQItem]


class ResponseItem(BaseModel):
    item_id: str
    price: Optional[float] = None
    quoted_quantity: Optional[float] = None
    available: bool = True
    alternative_size: Optional[str] = ""
    alternative_price: Optional[float] = None
    notes: Optional[str] = ""


class ExtraCost(BaseModel):
    label: str = ""
    amount: Optional[float] = None


class SupplierResponse(BaseModel):
    supplier_company: str
    contact_name: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    overall_notes: Optional[str] = ""
    freight: Optional[float] = None
    extra_costs: List[ExtraCost] = []
    attachment_name: Optional[str] = ""
    attachment_b64: Optional[str] = ""
    items: List[ResponseItem]


async def _next_number():
    n = await db[RFQS].count_documents({})
    return f"RFQ-{n + 1:04d}"


@router.post("")
async def create_rfq(payload: RFQIn, current_user=Depends(get_current_user)):
    if not payload.items:
        raise HTTPException(400, "At least one material item is required")
    items = []
    for it in payload.items:
        d = it.model_dump()
        d["id"] = d.get("id") or str(uuid.uuid4())
        items.append(d)
    doc = {
        "id": str(uuid.uuid4()),
        "rfq_number": await _next_number(),
        "title": payload.title,
        "notes": payload.notes,
        "required_by": payload.required_by,
        "items": items,
        "public_token": secrets.token_urlsafe(24),
        "status": "Open",
        "created_at": _now(),
        "created_by": current_user.get("full_name") or current_user.get("username", ""),
    }
    await db[RFQS].insert_one({**doc})
    doc.pop("_id", None)
    return doc


@router.get("")
async def list_rfqs(current_user=Depends(get_current_user)):
    rfqs = await db[RFQS].find({}, {"_id": 0}).sort("created_at", -1).to_list(300)
    for r in rfqs:
        r["response_count"] = await db[RESPONSES].count_documents({"rfq_id": r["id"]})
    return {"items": rfqs}


@router.get("/{rfq_id}")
async def get_rfq(rfq_id: str, current_user=Depends(get_current_user)):
    rfq = await db[RFQS].find_one({"id": rfq_id}, {"_id": 0})
    if not rfq:
        raise HTTPException(404, "RFQ not found")
    rfq["responses"] = await db[RESPONSES].find({"rfq_id": rfq_id}, {"_id": 0, "attachment_b64": 0}).sort("submitted_at", 1).to_list(100)
    return rfq


@router.get("/{rfq_id}/responses/{resp_id}/attachment")
async def download_response_attachment(rfq_id: str, resp_id: str, current_user=Depends(get_current_user)):
    from fastapi.responses import Response as FastResponse
    import base64 as _b64
    resp = await db[RESPONSES].find_one({"id": resp_id, "rfq_id": rfq_id}, {"_id": 0})
    if not resp or not resp.get("attachment_b64"):
        raise HTTPException(404, "No attachment")
    raw = _b64.b64decode(resp["attachment_b64"])
    fname = resp.get("attachment_name") or "supplier_quote"
    return FastResponse(content=raw, media_type="application/octet-stream",
                        headers={"Content-Disposition": f"attachment; filename={fname}"})


class StatusIn(BaseModel):
    status: str  # Open / Closed


@router.put("/{rfq_id}/status")
async def set_status(rfq_id: str, payload: StatusIn, current_user=Depends(get_current_user)):
    if payload.status not in ("Open", "Closed"):
        raise HTTPException(400, "Status must be Open or Closed")
    res = await db[RFQS].update_one({"id": rfq_id}, {"$set": {"status": payload.status}})
    if res.matched_count == 0:
        raise HTTPException(404, "RFQ not found")
    return {"success": True, "status": payload.status}


@router.delete("/{rfq_id}")
async def delete_rfq(rfq_id: str, current_user=Depends(get_current_user)):
    res = await db[RFQS].delete_one({"id": rfq_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "RFQ not found")
    await db[RESPONSES].delete_many({"rfq_id": rfq_id})
    return {"success": True}


@router.get("/{rfq_id}/export/pdf")
async def export_comparison_pdf(rfq_id: str, current_user=Depends(get_current_user)):
    """One-page supplier price comparison: items as rows, suppliers as columns."""
    from fastapi.responses import StreamingResponse
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.units import cm
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from io import BytesIO

    rfq = await db[RFQS].find_one({"id": rfq_id}, {"_id": 0})
    if not rfq:
        raise HTTPException(404, "RFQ not found")
    responses = await db[RESPONSES].find({"rfq_id": rfq_id}, {"_id": 0, "attachment_b64": 0}).sort("submitted_at", 1).to_list(50)
    company = await db.company_settings.find_one({}, {"_id": 0}) or {}

    S_T = ParagraphStyle('t', fontName='Helvetica-Bold', fontSize=14, spaceAfter=2)
    S_M = ParagraphStyle('m', fontName='Helvetica', fontSize=9, textColor=colors.HexColor('#555555'), spaceAfter=8)
    S_C = ParagraphStyle('c', fontName='Helvetica', fontSize=8, leading=10)
    S_CB = ParagraphStyle('cb', fontName='Helvetica-Bold', fontSize=8, leading=10, textColor=colors.white)

    page = A4
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=page, topMargin=1.4 * cm, bottomMargin=1.4 * cm,
                            leftMargin=1.4 * cm, rightMargin=1.4 * cm)
    S_IH = ParagraphStyle('ih', fontName='Helvetica-Bold', fontSize=10.5, spaceBefore=10, spaceAfter=4)
    story = [
        Paragraph(f"{(company.get('company_name') or '').upper()} — SUPPLIER PRICE COMPARISON", S_T),
        Paragraph(f"{rfq.get('rfq_number')} · {rfq.get('title')} · "
                  f"{len(responses)} supplier response(s) · Printed {datetime.now(timezone.utc).strftime('%d/%m/%Y')}", S_M),
    ]

    # Per-response charge spread: (freight + extras) / total quoted units — INTERNAL true cost
    spread = {}
    for r in responses:
        charges = (r.get('freight') or 0) + sum((c.get('amount') or 0) for c in (r.get('extra_costs') or []))
        units = sum((x.get('quoted_quantity') or 0) for x in (r.get('items') or [])
                    if x.get('price') is not None or x.get('alternative_price') is not None)
        spread[r['id']] = charges / units if units > 0 else 0

    header = [Paragraph(h, S_CB) for h in ('Supplier', 'Qty Quoted', 'Price ea', 'Charges /unit', 'TRUE $ ea', 'Alt / Notes')]
    widths = [4.6 * cm, 1.9 * cm, 2.1 * cm, 2.1 * cm, 2.1 * cm, 5.4 * cm]

    for i, item in enumerate(rfq.get('items', []), start=1):
        head = f"{i}. {item.get('description') or ''}"
        meta = ' · '.join(filter(None, [
            f"Code: {item['code']}" if item.get('code') else '',
            item.get('size') or '', f"Qty requested: {item.get('quantity')}"]))
        story.append(Paragraph(f"{head} <font size=8 color='#555555'>({meta})</font>", S_IH))
        rows = [header]
        trues = []
        for r in responses:
            ir = next((x for x in (r.get('items') or []) if x.get('item_id') == item.get('id')), None)
            name = Paragraph((r.get('supplier_company') or '')[:45], S_C)
            if not ir:
                rows.append([name, Paragraph('—', S_C), Paragraph('—', S_C), Paragraph('—', S_C), Paragraph('—', S_C), Paragraph('No response for this item', S_C)])
                trues.append(None); continue
            qq = ir.get('quoted_quantity')
            req = item.get('quantity')
            qtxt = f"{qq:g}" + (f" of {req:g}" if qq is not None and req and float(qq) != float(req) else "") if qq is not None else '—'
            base = ir.get('price') if ir.get('price') is not None else ir.get('alternative_price')
            sp = spread.get(r['id'], 0)
            true_unit = base + sp if base is not None else None
            notes = []
            if ir.get('available') is False and not ir.get('alternative_size'):
                notes.append('N/A — size not available')
            if ir.get('alternative_size'):
                alt = f"ALT: {ir['alternative_size']}"
                if ir.get('alternative_price') is not None:
                    alt += f" @ ${ir['alternative_price']:.2f}"
                notes.append(alt)
            if ir.get('notes'):
                notes.append(ir['notes'][:80])
            rows.append([
                name, Paragraph(qtxt, S_C),
                Paragraph(f"${ir['price']:.2f}" if ir.get('price') is not None else '—', S_C),
                Paragraph(f"${sp:.2f}" if sp > 0 else '—', S_C),
                Paragraph(f"<b>${true_unit:.2f}</b>" if true_unit is not None else '—', S_C),
                Paragraph('<br/>'.join(notes) or '—', S_C),
            ])
            trues.append(true_unit)
        t = Table(rows, colWidths=widths, repeatRows=1)
        style = [
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#888888')),
            ('BACKGROUND', (0, 0), (-1, 0), colors.black),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('TOPPADDING', (0, 0), (-1, -1), 3.5), ('BOTTOMPADDING', (0, 0), (-1, -1), 3.5),
        ]
        valid = [p for p in trues if p is not None]
        if valid:
            best = min(valid)
            for riw, p in enumerate(trues, start=1):
                if p is not None and abs(p - best) < 0.005:
                    style.append(('BACKGROUND', (0, riw), (-1, riw), colors.HexColor('#DCFCE7')))
        t.setStyle(TableStyle(style))
        story.append(t)

    # Freight & other charges summary (suppliers down)
    if any(r.get('freight') is not None or (r.get('extra_costs') or []) for r in responses):
        story.append(Paragraph('Freight &amp; Other Charges by Supplier', S_IH))
        frows = [[Paragraph(h, S_CB) for h in ('Supplier', 'Freight', 'Other charges', 'Spread /unit')]]
        for r in responses:
            extras = r.get('extra_costs') or []
            etxt = '<br/>'.join(f"{(c.get('label') or 'Charge')}: ${c['amount']:.2f}" if c.get('amount') is not None else (c.get('label') or '')
                                for c in extras) or '—'
            frows.append([
                Paragraph((r.get('supplier_company') or '')[:45], S_C),
                Paragraph(f"${r['freight']:.2f}" if r.get('freight') is not None else '—', S_C),
                Paragraph(etxt, S_C),
                Paragraph(f"${spread.get(r['id'], 0):.2f}" if spread.get(r['id'], 0) > 0 else '—', S_C),
            ])
        ft = Table(frows, colWidths=[5.2 * cm, 2.6 * cm, 7.4 * cm, 3.0 * cm], repeatRows=1)
        ft.setStyle(TableStyle([
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#888888')),
            ('BACKGROUND', (0, 0), (-1, 0), colors.black),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('TOPPADDING', (0, 0), (-1, -1), 3.5), ('BOTTOMPADDING', (0, 0), (-1, -1), 3.5),
        ]))
        story.append(ft)

    story.append(Spacer(1, 0.4 * cm))
    story.append(Paragraph('Green = lowest TRUE unit price per line (freight + other charges spread across quoted sheets, alternatives included). '
                           'ALT = supplier-offered alternative size. N/A = size not available. INTERNAL DOCUMENT — not for suppliers.', S_M))
    for r in responses:
        contact = ' · '.join(filter(None, [r.get('contact_name'), r.get('email'), r.get('phone')]))
        note = f" — {r['overall_notes']}" if r.get('overall_notes') else ''
        story.append(Paragraph(f"<b>{r.get('supplier_company')}</b>: {contact or 'no contact details'}{note}", S_M))
    doc.build(story)
    buf.seek(0)
    fname = f"{rfq.get('rfq_number')}_Price_Comparison.pdf"
    return StreamingResponse(buf, media_type="application/pdf",
                             headers={"Content-Disposition": f"attachment; filename={fname}"})


@router.get("/{rfq_id}/export/html")
async def export_offline_html(rfq_id: str, request: Request, origin: Optional[str] = None,
                              current_user=Depends(get_current_user)):
    """Self-contained HTML enquiry form to ATTACH to an email — for suppliers whose
    cyber-security blocks external links. Opens locally; Submit posts to our public API."""
    from fastapi.responses import Response as FastResponse
    rfq = await db[RFQS].find_one({"id": rfq_id}, {"_id": 0})
    if not rfq:
        raise HTTPException(404, "RFQ not found")
    company = await db.company_settings.find_one({}, {"_id": 0}) or {}
    if not origin:
        origin = request.headers.get('origin')
    if not origin:
        fwd_host = request.headers.get('x-forwarded-host')
        proto = request.headers.get('x-forwarded-proto', 'https')
        origin = f"{proto}://{fwd_host}" if fwd_host else str(request.base_url).rstrip('/')
    base = origin.rstrip('/')
    if base.startswith('http://') and 'localhost' not in base:
        base = 'https://' + base[7:]
    submit_url = f"{base}/api/rfqs/public/{rfq['public_token']}/respond"
    co = company.get('company_name', '')
    esc = lambda s: (s or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')

    items_html = ""
    for i, it in enumerate(rfq.get('items', [])):
        items_html += f"""
    <div class="item" data-id="{it['id']}">
      <div class="row1"><b>{i + 1}. {esc(it.get('description'))}</b>
        <span class="meta">{('Code: ' + esc(it.get('code')) + ' · ') if it.get('code') else ''}{('Material: ' + esc(it.get('material_type')) + ' · ') if it.get('material_type') else ''}{('Size: ' + esc(it.get('size')) + ' · ') if it.get('size') else ''}Qty: {it.get('quantity')}</span>
      </div>
      <label>Your Price (ea, ex GST) $ <input type="number" step="0.01" min="0" class="price"></label>
      <label>Qty you are quoting <span class="req">*</span> <input type="number" step="1" min="0" class="qqty" value="{it.get('quantity')}"></label>
      <label><input type="checkbox" class="na"> Size not available</label>
      <label><input type="checkbox" class="altchk" onchange="this.closest('.item').querySelector('.altbox').style.display=this.checked?'block':'none'"> Offer alternative size</label>
      <div class="altbox" style="display:none">
        <label>Alternative size <input type="text" class="altsize" placeholder="e.g. 3.0 x 3000 x 1500"></label>
        <label>Alternative price $ <input type="number" step="0.01" min="0" class="altprice"></label>
      </div>
      <label>Notes <input type="text" class="inotes" placeholder="lead time, MOQ, etc."></label>
    </div>"""

    html = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><title>{esc(rfq.get('rfq_number'))} — Material Enquiry from {esc(co)}</title>
<style>
 body{{font-family:Segoe UI,Arial,sans-serif;background:#f1f5f9;margin:0;padding:20px}}
 .card{{max-width:760px;margin:0 auto 14px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px}}
 h1{{font-size:19px;margin:0 0 4px}} .sub{{color:#555;font-size:13px;margin:0 0 6px}}
 label{{display:block;font-size:13px;margin:6px 0}} input[type=text],input[type=number],input[type=email],textarea{{width:100%;max-width:420px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:5px;font-size:14px;box-sizing:border-box}}
 input[type=checkbox]{{width:auto;margin-right:6px}}
 .item{{border:1px solid #e2e8f0;border-radius:6px;padding:10px 12px;margin:10px 0;background:#f8fafc}}
 .meta{{display:block;font-size:12px;color:#555;font-weight:normal}}
 .altbox{{background:#fffbeb;border:1px solid #fcd34d;border-radius:5px;padding:8px;margin:6px 0}}
 button{{background:#166534;color:#fff;border:0;border-radius:6px;padding:12px 22px;font-size:15px;cursor:pointer;width:100%}}
 .err{{color:#b91c1c;font-size:13px;margin:8px 0}} .ok{{text-align:center;padding:30px 10px}}
 .req{{color:#b91c1c}}
</style></head><body>
<div class="card"><h1>{esc(co)} — Material Purchasing Enquiry</h1>
<p class="sub">{esc(rfq.get('rfq_number'))} · {esc(rfq.get('title'))}{(' · Pricing required by ' + esc(rfq.get('required_by'))) if rfq.get('required_by') else ''}</p>
{('<p class="sub">' + esc(rfq.get('notes')) + '</p>') if rfq.get('notes') else ''}
<p class="sub">Fill in your prices below and click <b>Submit Pricing</b> (requires internet). If submission fails, simply reply to our email with your prices.</p></div>
<div class="card"><b>Your details</b>
 <label>Company Name <span class="req">*</span> <input type="text" id="s_company"></label>
 <label>Contact Name <input type="text" id="s_contact"></label>
 <label>Email <input type="email" id="s_email"></label>
 <label>Phone <input type="text" id="s_phone"></label></div>
<div class="card"><b>Items</b>{items_html}
 <b>Freight &amp; Other Charges</b>
 <label>Freight (ex GST) $ <input type="number" step="0.01" min="0" id="s_freight"></label>
 <label>Other cost 1 — description <input type="text" id="x_label0" placeholder="e.g. Fuel surcharge"></label>
 <label>Other cost 1 — amount $ <input type="number" step="0.01" min="0" id="x_amt0"></label>
 <label>Other cost 2 — description <input type="text" id="x_label1"></label>
 <label>Other cost 2 — amount $ <input type="number" step="0.01" min="0" id="x_amt1"></label>
 <label>Attach your quote (optional, max 5 MB) <input type="file" id="s_file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"></label>
 <label>General notes / terms <textarea id="s_notes" rows="3"></textarea></label>
 <div class="err" id="err"></div>
 <button onclick="submitPricing()">Submit Pricing</button></div>
<script>
function readFile(){{
  return new Promise(function(res){{
    var f=document.getElementById('s_file').files[0];
    if(!f)return res(null);
    if(f.size>5*1024*1024)return res({{err:'Attachment too large (max 5 MB).'}});
    var r=new FileReader();
    r.onload=function(e){{res({{name:f.name,b64:String(e.target.result).split(',')[1]}});}};
    r.readAsDataURL(f);
  }});
}}
async function submitPricing(){{
  var err=document.getElementById('err'); err.textContent='';
  var company=document.getElementById('s_company').value.trim();
  if(!company){{err.textContent='Please enter your company name.';return;}}
  var att=await readFile();
  if(att&&att.err){{err.textContent=att.err;return;}}
  var extras=[];
  for(var k=0;k<2;k++){{
    var l=document.getElementById('x_label'+k).value, a=document.getElementById('x_amt'+k).value;
    if(l||a)extras.push({{label:l,amount:a?parseFloat(a):null}});
  }}
  var fr=document.getElementById('s_freight').value;
  var items=[].map.call(document.querySelectorAll('.item'),function(el){{
    return {{item_id:el.dataset.id,
      price:el.querySelector('.price').value?parseFloat(el.querySelector('.price').value):null,
      quoted_quantity:el.querySelector('.qqty').value?parseFloat(el.querySelector('.qqty').value):null,
      available:!el.querySelector('.na').checked,
      alternative_size:el.querySelector('.altchk').checked?el.querySelector('.altsize').value:'',
      alternative_price:(el.querySelector('.altchk').checked&&el.querySelector('.altprice').value)?parseFloat(el.querySelector('.altprice').value):null,
      notes:el.querySelector('.inotes').value}};
  }});
  for(var m=0;m<items.length;m++){{
    var it=items[m];
    if((it.price!=null||it.alternative_price!=null)&&!(it.quoted_quantity>0)){{
      err.textContent='Please enter the quantity you are quoting for item '+(m+1)+'.';return;
    }}
  }}
  var payload={{supplier_company:company,contact_name:document.getElementById('s_contact').value,
    email:document.getElementById('s_email').value,phone:document.getElementById('s_phone').value,
    overall_notes:document.getElementById('s_notes').value,
    freight:fr?parseFloat(fr):null,extra_costs:extras,
    attachment_name:att?att.name:'',attachment_b64:att?att.b64:'',items:items}};
  try{{
    var r=await fetch('{submit_url}',{{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify(payload)}});
    if(!r.ok){{var d=await r.json().catch(function(){{return {{}}}});throw new Error(d.detail||('HTTP '+r.status));}}
    document.body.innerHTML='<div class="card ok"><h1>✔ Pricing Submitted</h1><p class="sub">Thank you — {esc(co)} has received your pricing for {esc(rfq.get('rfq_number'))}.</p></div>';
  }}catch(e){{
    err.textContent='Could not submit automatically ('+e.message+'). Your network may block this — please reply to our email with your prices instead.';
  }}
}}
</script></body></html>"""
    fname = f"{rfq.get('rfq_number')}_Material_Enquiry.html"
    return FastResponse(content=html, media_type="text/html",
                        headers={"Content-Disposition": f"attachment; filename={fname}"})


# ==================== PUBLIC (supplier-facing, no auth) ====================

@router.get("/public/{token}")
async def public_get_rfq(token: str):
    rfq = await db[RFQS].find_one({"public_token": token}, {"_id": 0})
    if not rfq:
        raise HTTPException(404, "Enquiry link not found")
    company = await db.company_settings.find_one({}, {"_id": 0}) or {}
    if rfq.get("status") != "Open":
        return {"active": False, "title": rfq.get("title"), "rfq_number": rfq.get("rfq_number"),
                "company_name": company.get("company_name", ""),
                "message": "This enquiry has been closed. Thank you for your interest."}
    return {
        "active": True,
        "rfq_number": rfq.get("rfq_number"),
        "title": rfq.get("title"),
        "notes": rfq.get("notes"),
        "required_by": rfq.get("required_by"),
        "items": rfq.get("items", []),
        "company_name": company.get("company_name", ""),
        "company_logo_url": company.get("company_logo_url", ""),
    }


@router.post("/public/{token}/respond")
async def public_respond(token: str, payload: SupplierResponse):
    rfq = await db[RFQS].find_one({"public_token": token}, {"_id": 0})
    if not rfq:
        raise HTTPException(404, "Enquiry link not found")
    if rfq.get("status") != "Open":
        raise HTTPException(400, "This enquiry is closed")
    if not payload.supplier_company.strip():
        raise HTTPException(400, "Company name is required")
    if payload.attachment_b64 and len(payload.attachment_b64) > 7_500_000:
        raise HTTPException(400, "Attachment too large (max 5 MB)")
    valid_ids = {it["id"] for it in rfq.get("items", [])}
    items = [it.model_dump() for it in payload.items if it.item_id in valid_ids]
    for it in items:
        priced = it.get("price") is not None or it.get("alternative_price") is not None
        if priced and not (it.get("quoted_quantity") and it["quoted_quantity"] > 0):
            raise HTTPException(400, "Please enter the quantity you are quoting for each priced item")
    doc = {
        "id": str(uuid.uuid4()),
        "rfq_id": rfq["id"],
        "supplier_company": payload.supplier_company.strip(),
        "contact_name": payload.contact_name,
        "email": payload.email,
        "phone": payload.phone,
        "overall_notes": payload.overall_notes,
        "freight": payload.freight,
        "extra_costs": [c.model_dump() for c in payload.extra_costs if c.label or c.amount is not None][:4],
        "attachment_name": payload.attachment_name,
        "attachment_b64": payload.attachment_b64,
        "items": items,
        "submitted_at": _now(),
    }
    await db[RESPONSES].insert_one({**doc})
    return {"success": True, "message": "Thank you — your pricing has been submitted."}
