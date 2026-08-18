"""Company Policies — rich-text policy generator with Word-style PDF export.

  /api/policies                GET list, POST create
  /api/policies/{pid}          GET, PUT, DELETE
  /api/policies/{pid}/export/pdf  GET — Calibri(Carlito) PDF, logo header, policy footer
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from io import BytesIO
from pathlib import Path
import os
import json
import uuid
import base64

from auth import get_current_user
from services.audit_trail import log_trail

router = APIRouter(prefix="/api/policies", tags=["Policies"])
client = AsyncIOMotorClient(os.environ.get('MONGO_URL'))
db = client[os.environ.get('DB_NAME')]

COLL = "policies"
FONT_DIR = Path(__file__).parent.parent / "fonts"
SEED_FILE = Path(__file__).parent.parent / "services" / "policies_seed.json"


def _now():
    return datetime.now(timezone.utc).isoformat()


class PolicyIn(BaseModel):
    title: str
    issue: Optional[str] = "1"
    issue_date: Optional[str] = ""     # e.g. 06/2023
    content_html: Optional[str] = ""


async def ensure_policies_seed():
    if await db[COLL].find_one({}):
        return 0
    with open(SEED_FILE) as f:
        seed = json.load(f)
    for s in seed:
        await db[COLL].insert_one({
            **s, "id": str(uuid.uuid4()),
            "created_at": _now(), "updated_at": _now(), "updated_by": "system",
        })
    return len(seed)


@router.get("")
async def list_policies(current_user=Depends(get_current_user)):
    items = await db[COLL].find({}, {"_id": 0, "content_html": 0}).sort("title", 1).to_list(500)
    return {"items": items}


@router.get("/{pid}")
async def get_policy(pid: str, current_user=Depends(get_current_user)):
    doc = await db[COLL].find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Policy not found")
    return doc


@router.post("")
async def create_policy(payload: PolicyIn, current_user=Depends(get_current_user)):
    doc = payload.model_dump()
    doc.update({"id": str(uuid.uuid4()), "created_at": _now(), "updated_at": _now(),
                "updated_by": current_user.get("full_name") or current_user.get("username", "system")})
    await db[COLL].insert_one({**doc})
    doc.pop("_id", None)
    await log_trail(current_user, "created", "policy", doc["id"], new_value=doc["title"])
    return doc


@router.put("/{pid}")
async def update_policy(pid: str, payload: PolicyIn, current_user=Depends(get_current_user)):
    if not await db[COLL].find_one({"id": pid}):
        raise HTTPException(404, "Policy not found")
    upd = payload.model_dump()
    upd.update({"updated_at": _now(),
                "updated_by": current_user.get("full_name") or current_user.get("username", "system")})
    await db[COLL].update_one({"id": pid}, {"$set": upd})
    await log_trail(current_user, "edited", "policy", pid, new_value=upd.get("title"))
    return await db[COLL].find_one({"id": pid}, {"_id": 0})


@router.delete("/{pid}")
async def delete_policy(pid: str, current_user=Depends(get_current_user)):
    res = await db[COLL].delete_one({"id": pid})
    if res.deleted_count == 0:
        raise HTTPException(404, "Policy not found")
    await log_trail(current_user, "deleted", "policy", pid)
    return {"success": True}


def _logo_png_b64(company):
    """Company logo as base64 PNG (converts SVG via svglib/renderPM)."""
    url = (company or {}).get('company_logo_url') or ''
    if not url.startswith('data:'):
        return None
    try:
        raw = base64.b64decode(url.split(',', 1)[1])
        if 'svg' in url[:30]:
            import fitz
            svg_doc = fitz.open(stream=raw, filetype='svg')
            png = svg_doc[0].get_pixmap(dpi=300, alpha=False).tobytes('png')
            return base64.b64encode(png).decode()
        return base64.b64encode(raw).decode()
    except Exception:
        return None


def _sanitize_html(html):
    """Quill 2 getSemanticHTML emits &nbsp; for normal spaces, which breaks
    word-wrap in the PDF renderer. Convert them back to breakable spaces."""
    return (html or '').replace('&nbsp;', ' ').replace('\u00a0', ' ')


@router.get("/{pid}/export/pdf")
async def export_policy_pdf(pid: str, current_user=Depends(get_current_user)):
    from xhtml2pdf import pisa
    doc = await db[COLL].find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Policy not found")
    company = await db.company_settings.find_one({}, {"_id": 0}) or {}
    logo_b64 = _logo_png_b64(company)
    logo_html = f'<div style="text-align:center;"><img src="data:image/png;base64,{logo_b64}" style="height:1.9cm;"/></div>' if logo_b64 else ''
    title = (doc.get('title') or 'Policy').upper()
    issue_line = f"ISSUE: {doc.get('issue') or '1'}&nbsp;&nbsp;&nbsp;{doc.get('issue_date') or ''}"
    html = f"""<html><head><style>
@font-face {{ font-family: Calibri; src: url('{FONT_DIR}/Carlito-Regular.ttf'); }}
@font-face {{ font-family: Calibri; src: url('{FONT_DIR}/Carlito-Bold.ttf'); font-weight: bold; }}
@font-face {{ font-family: Calibri; src: url('{FONT_DIR}/Carlito-Italic.ttf'); font-style: italic; }}
@font-face {{ font-family: Calibri; src: url('{FONT_DIR}/Carlito-BoldItalic.ttf'); font-weight: bold; font-style: italic; }}
@page {{
  size: A4; margin: 2cm; margin-bottom: 3.4cm;
  @frame footer_frame {{ -pdf-frame-content: footer_content; left: 2cm; width: 17cm; bottom: 0.8cm; height: 2.2cm; }}
}}
body {{ font-family: Calibri; font-size: 11pt; line-height: 1.2; }}
p {{ margin: 0 0 3pt 0; }}
h1 {{ font-family: Calibri; font-size: 16pt; font-weight: bold; margin: 8pt 0 4pt 0; }}
h2 {{ font-family: Calibri; font-size: 13pt; font-weight: bold; margin: 6pt 0 3pt 0; }}
li {{ margin: 0 0 2pt 0; }}
#footer_content {{ font-size: 8.5pt; border-top: 0.6pt solid #444444; padding-top: 4pt; }}
</style></head><body>
{logo_html}
{_sanitize_html(doc.get('content_html'))}
<div id="footer_content">
  <table width="100%" style="font-size:8.5pt;"><tr>
    <td width="40%"><b>{title}</b></td>
    <td width="30%" align="center"><b>{issue_line}</b></td>
    <td width="30%" align="right"><b>Page <pdf:pagenumber/> of <pdf:pagecount/></b></td>
  </tr></table>
  <span style="font-size:7.5pt; color:#666666;">{(company.get('company_name') or '').upper()} CONTROLLED POLICY &nbsp;|&nbsp; UNCONTROLLED WHEN PRINTED</span>
</div>
</body></html>"""
    buf = BytesIO()
    result = pisa.CreatePDF(html, dest=buf)
    if result.err:
        raise HTTPException(500, "PDF generation failed")
    buf.seek(0)
    fname = f"{(doc.get('title') or 'Policy').replace(' ', '_')}.pdf"
    return StreamingResponse(buf, media_type="application/pdf",
                             headers={"Content-Disposition": f"attachment; filename={fname}"})
