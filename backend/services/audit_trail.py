"""Central audit-trail logger — records who changed what, when, old/new values."""
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import os
import uuid

_client = AsyncIOMotorClient(os.environ.get('MONGO_URL'))
_db = _client[os.environ.get('DB_NAME')]


def _user_label(user) -> str:
    if isinstance(user, dict):
        return user.get("username") or user.get("email") or "system"
    return getattr(user, "username", None) or "system"


async def log_trail(user, action: str, entity_type: str, entity_id: str,
                    old_value=None, new_value=None, reason: str = None, summary: str = None):
    """Insert one audit-trail entry. Values are truncated to keep records lean."""
    def _trunc(v):
        if v is None:
            return None
        s = str(v)
        return s[:2000] + "…" if len(s) > 2000 else s
    await _db.audit_trail.insert_one({
        "id": str(uuid.uuid4()),
        "user": _user_label(user),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "action": action,              # e.g. created / edited / status_changed / locked / reopened
        "entity_type": entity_type,    # e.g. audit / finding / help_content / standard / clause / template
        "entity_id": entity_id,
        "summary": summary,
        "old_value": _trunc(old_value),
        "new_value": _trunc(new_value),
        "reason": reason,
    })


async def get_trail(entity_type: str = None, entity_id: str = None, limit: int = 200):
    q = {}
    if entity_type:
        q["entity_type"] = entity_type
    if entity_id:
        q["entity_id"] = entity_id
    items = await _db.audit_trail.find(q, {"_id": 0}).sort("timestamp", -1).to_list(length=limit)
    return items
