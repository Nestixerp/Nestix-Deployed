from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from fastapi.responses import Response
from auth import get_current_user
from motor.motor_asyncio import AsyncIOMotorClient
import os
import base64
import uuid

router = APIRouter(prefix="/api", tags=["File Upload"])

# MongoDB connection for file storage
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'erp_db')]

@router.post("/upload/drawing")
async def upload_drawing(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload a drawing file and store in database as base64"""
    try:
        # Validate file type
        allowed_extensions = ['.pdf', '.dwg', '.dxf', '.png', '.jpg', '.jpeg']
        file_extension = os.path.splitext(file.filename)[1].lower()
        
        if file_extension not in allowed_extensions:
            raise HTTPException(
                status_code=400, 
                detail=f"File type {file_extension} not allowed. Allowed types: {', '.join(allowed_extensions)}"
            )
        
        # Read file content
        content = await file.read()
        file_size = len(content)
        
        # Validate file size (max 10MB)
        if file_size > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File size must be less than 10MB")
        
        # Convert to base64
        base64_data = base64.b64encode(content).decode('utf-8')
        
        # Generate unique ID
        file_id = str(uuid.uuid4())
        
        # Store in database
        file_doc = {
            "id": file_id,
            "filename": file.filename,
            "content_type": file.content_type,
            "extension": file_extension,
            "base64_data": base64_data,
            "size": file_size,
            "uploaded_by": current_user.get('username'),
            "uploaded_at": None  # Will be set by MongoDB
        }
        
        await db.drawings.insert_one(file_doc)
        
        # Return file info with database ID
        return {
            "filename": file.filename,
            "url": f"/files/drawings/{file_id}",
            "size": file_size
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File upload failed: {str(e)}")

@router.get("/files/drawings/{file_id}")
async def download_drawing(
    file_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Download a drawing file from database"""
    # Find file in database
    file_doc = await db.drawings.find_one({"id": file_id})
    
    if not file_doc:
        raise HTTPException(status_code=404, detail="File not found")
    
    # Decode base64 data
    file_data = base64.b64decode(file_doc['base64_data'])
    
    # Return file as response
    return Response(
        content=file_data,
        media_type=file_doc.get('content_type', 'application/octet-stream'),
        headers={
            'Content-Disposition': f'attachment; filename="{file_doc["filename"]}"'
        }
    )

@router.delete("/files/drawings/{file_id}")
async def delete_drawing(
    file_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a drawing file from database"""
    result = await db.drawings.delete_one({"id": file_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="File not found")
    
    return {"message": "File deleted successfully"}
