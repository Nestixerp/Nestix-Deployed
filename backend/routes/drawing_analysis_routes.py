"""
Drawing Analysis Module - DXF, PDF, STEP file parsing and geometry analysis
"""
import os
import tempfile
import math
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from pydantic import BaseModel

router = APIRouter(prefix="/api/drawing-analysis", tags=["Drawing Analysis"])

# Material densities in kg/m³
MATERIAL_DENSITIES = {
    'Mild Steel': 7850,
    'Steel': 7850,
    'Stainless Steel': 8000,
    'Aluminium': 2700,
    'Aluminum': 2700,
    'Copper': 8960,
    'Brass': 8500,
    'Galvanised Steel': 7850,
    'Zincanneal': 7850,
}

class DrawingAnalysisResult(BaseModel):
    file_type: str
    file_name: str
    # Geometry detection
    bend_count: int = 0
    bend_lengths: List[float] = []
    longest_bend_length: float = 0
    bend_angles: List[float] = []
    # Material info
    material_type: Optional[str] = None
    thickness: Optional[float] = None
    # Dimensions
    flat_area: Optional[float] = None  # mm²
    part_length: Optional[float] = None
    part_width: Optional[float] = None
    part_weight: Optional[float] = None  # kg
    # Estimated values
    geometry_type: str = "flange"  # flange, channel, bracket, box, enclosure
    estimated_flips: int = 0
    difficulty_level: str = "simple"  # simple, moderate, complex
    # Processing info
    detection_confidence: str = "low"  # low, medium, high
    detection_notes: List[str] = []
    # Raw data for debugging
    raw_entities: Optional[Dict[str, Any]] = None


def analyze_dxf_file(file_path: str, filename: str) -> DrawingAnalysisResult:
    """
    Analyze a DXF file and extract bend information
    """
    import ezdxf
    from ezdxf.lldxf.const import DXFStructureError
    
    result = DrawingAnalysisResult(
        file_type="DXF",
        file_name=filename,
        detection_notes=[]
    )
    
    try:
        doc = ezdxf.readfile(file_path)
        msp = doc.modelspace()
        
        # Collect all entities
        lines = []
        arcs = []
        polylines = []
        texts = []
        dimensions = []
        layers_found = set()
        
        for entity in msp:
            layers_found.add(entity.dxf.layer)
            
            if entity.dxftype() == 'LINE':
                start = entity.dxf.start
                end = entity.dxf.end
                length = math.sqrt(
                    (end[0] - start[0])**2 + 
                    (end[1] - start[1])**2 + 
                    (end[2] - start[2])**2
                )
                lines.append({
                    'layer': entity.dxf.layer,
                    'start': (start[0], start[1]),
                    'end': (end[0], end[1]),
                    'length': length
                })
            
            elif entity.dxftype() == 'ARC':
                arcs.append({
                    'layer': entity.dxf.layer,
                    'center': (entity.dxf.center[0], entity.dxf.center[1]),
                    'radius': entity.dxf.radius,
                    'start_angle': entity.dxf.start_angle,
                    'end_angle': entity.dxf.end_angle
                })
            
            elif entity.dxftype() == 'LWPOLYLINE':
                points = list(entity.get_points())
                polylines.append({
                    'layer': entity.dxf.layer,
                    'points': points,
                    'closed': entity.closed
                })
            
            elif entity.dxftype() in ['TEXT', 'MTEXT']:
                text_content = entity.dxf.text if hasattr(entity.dxf, 'text') else str(entity.text)
                texts.append({
                    'layer': entity.dxf.layer,
                    'text': text_content,
                    'position': entity.dxf.insert if hasattr(entity.dxf, 'insert') else (0, 0)
                })
            
            elif entity.dxftype() == 'DIMENSION':
                try:
                    dimensions.append({
                        'layer': entity.dxf.layer,
                        'measurement': entity.dxf.actual_measurement if hasattr(entity.dxf, 'actual_measurement') else 0
                    })
                except Exception:
                    pass
        
        result.detection_notes.append(f"Found {len(lines)} lines, {len(arcs)} arcs, {len(polylines)} polylines")
        result.detection_notes.append(f"Layers: {', '.join(sorted(layers_found))}")
        
        # === BEND DETECTION ===
        # Look for bend lines on specific layers
        bend_keywords = ['bend', 'fold', 'bend_up', 'bend_down', 'up', 'down', 'crease']
        bend_lines = []
        
        for line in lines:
            layer_lower = line['layer'].lower()
            if any(kw in layer_lower for kw in bend_keywords):
                bend_lines.append(line)
        
        # If no bend-specific layers found, look for short internal lines (potential bend lines)
        if not bend_lines:
            # Sort lines by length and look for patterns
            all_lengths = [line_item['length'] for line_item in lines if line_item['length'] > 1]
            if all_lengths:
                avg_length = sum(all_lengths) / len(all_lengths)
                # Bend lines are typically shorter than outer profile lines
                for line in lines:
                    if 10 < line['length'] < avg_length * 0.8:  # Short but not tiny
                        bend_lines.append(line)
        
        # Fallback: count arcs as potential bends (bend radius indicators)
        if not bend_lines and arcs:
            bend_lines = [{'length': arc['radius'] * 2 * 3.14159} for arc in arcs]
            result.detection_notes.append(f"Using arcs as bend indicators: {len(arcs)} arcs found")
        
        if bend_lines:
            result.bend_count = len(bend_lines)
            result.bend_lengths = [round(bl['length'], 1) for bl in bend_lines]
            result.longest_bend_length = max(result.bend_lengths) if result.bend_lengths else 0
            result.detection_confidence = "medium"
            result.detection_notes.append(f"Detected {result.bend_count} bends")
        else:
            result.detection_notes.append("No bend lines detected - manual entry required")
        
        # === TEXT ANALYSIS FOR BEND ANGLES ===
        # Patterns we look for in text annotations
        detected_angles = []
        for text_item in texts:
            text_upper = text_item['text'].upper()
            if '90' in text_upper or 'UP' in text_upper or 'DOWN' in text_upper:
                detected_angles.append(90)
            elif '45' in text_upper:
                detected_angles.append(45)
            elif '135' in text_upper:
                detected_angles.append(135)
        
        if detected_angles:
            result.bend_angles = detected_angles
            result.detection_notes.append(f"Detected angles from text: {detected_angles}")
        
        # === BOUNDING BOX FOR PART DIMENSIONS ===
        all_x = []
        all_y = []
        for line in lines:
            all_x.extend([line['start'][0], line['end'][0]])
            all_y.extend([line['start'][1], line['end'][1]])
        
        if all_x and all_y:
            min_x, max_x = min(all_x), max(all_x)
            min_y, max_y = min(all_y), max(all_y)
            result.part_length = round(max_x - min_x, 1)
            result.part_width = round(max_y - min_y, 1)
            result.flat_area = result.part_length * result.part_width
            result.detection_notes.append(f"Bounding box: {result.part_length} × {result.part_width} mm")
        
        # === GEOMETRY TYPE CLASSIFICATION ===
        if result.bend_count >= 5:
            result.geometry_type = "enclosure"
        elif result.bend_count >= 4:
            result.geometry_type = "box"
        elif result.bend_count >= 3:
            result.geometry_type = "bracket"
        elif result.bend_count >= 2:
            result.geometry_type = "channel"
        else:
            result.geometry_type = "flange"
        
        # === FLIP ESTIMATION ===
        if result.geometry_type in ['box', 'enclosure']:
            result.estimated_flips = result.bend_count
        else:
            result.estimated_flips = max(0, result.bend_count - 1)
        
        # === DIFFICULTY ESTIMATION ===
        # Complex if: many bends, small part, mixed angles
        if result.bend_count >= 5 or (result.part_length and result.part_length > 2000):
            result.difficulty_level = "complex"
        elif result.bend_count >= 3 or len(set(result.bend_angles)) > 1:
            result.difficulty_level = "moderate"
        
        result.detection_confidence = "medium" if result.bend_count > 0 else "low"
        
        # Store raw data for debugging
        result.raw_entities = {
            'line_count': len(lines),
            'arc_count': len(arcs),
            'polyline_count': len(polylines),
            'text_count': len(texts),
            'layers': list(layers_found)
        }
        
    except DXFStructureError as e:
        result.detection_notes.append(f"DXF structure error: {str(e)}. File may be corrupted or have unsupported format.")
        result.detection_confidence = "low"
    except Exception as e:
        result.detection_notes.append(f"DXF parsing error: {str(e)}")
        result.detection_confidence = "low"
    
    return result


def analyze_pdf_file(file_path: str, filename: str) -> DrawingAnalysisResult:
    """
    Analyze a PDF drawing using text extraction and image analysis
    Enhanced to detect bends, dimensions, and material from engineering drawings
    """
    import fitz  # PyMuPDF
    import re
    
    result = DrawingAnalysisResult(
        file_type="PDF",
        file_name=filename,
        detection_notes=[]
    )
    
    try:
        doc = fitz.open(file_path)
        all_text = ""
        all_blocks = []  # Store text blocks with positions
        
        for page_num, page in enumerate(doc):
            page_text = page.get_text()
            all_text += page_text
            
            # Get text blocks with position info for spatial analysis
            blocks = page.get_text("dict")["blocks"]
            for block in blocks:
                if "lines" in block:
                    for line in block["lines"]:
                        for span in line["spans"]:
                            all_blocks.append({
                                'text': span["text"],
                                'bbox': span["bbox"],
                                'size': span["size"]
                            })
        
        result.detection_notes.append(f"Extracted {len(all_text)} characters from {len(doc)} page(s)")
        
        # === ENHANCED BEND DETECTION ===
        bend_count = 0
        bend_angles = []
        
        # Pattern 1: "UP 90°" and "DOWN 90°" annotations (specific bend callouts)
        # Look for explicit UP/DOWN followed by angle
        up_down_pattern = r'\b(UP|DOWN)\s+(\d+)\s*°'
        bend_matches = re.findall(up_down_pattern, all_text, re.IGNORECASE)
        
        if bend_matches:
            bend_count = len(bend_matches)
            for direction, angle in bend_matches:
                bend_angles.append(int(angle))
            up_count = sum(1 for d, a in bend_matches if d.upper() == 'UP')
            down_count = sum(1 for d, a in bend_matches if d.upper() == 'DOWN')
            result.detection_notes.append(f"Found {up_count} UP and {down_count} DOWN bend annotations")
        
        # Pattern 2: "X x 90°" or "4 BENDS @ 90°" patterns
        if bend_count == 0:
            multiplier_patterns = [
                r'(\d+)\s*[xX×@]\s*(\d+)°',  # "4 x 90°" or "4 @ 90°"
                r'(\d+)\s*BENDS?\s*[xX×@]?\s*(\d+)°?',  # "4 BENDS 90°"
                r'(\d+)\s*(?:FOLDS?|BENDS?)\b',  # "4 FOLDS" or "4 BENDS"
            ]
            
            for pattern in multiplier_patterns:
                match = re.search(pattern, all_text, re.IGNORECASE)
                if match:
                    count = int(match.group(1))
                    if count < 20:  # Sanity check - max 20 bends
                        bend_count = count
                        angle = int(match.group(2)) if len(match.groups()) > 1 and match.group(2) else 90
                        bend_angles = [angle] * count
                        result.detection_notes.append(f"Found pattern: {count} bends at {angle}°")
                    break
        
        # Pattern 3: Individual angle callouts with degree symbol ONLY (e.g., "90°")
        # This is less reliable, so only use if no bends found yet
        if bend_count == 0:
            # Look for standalone angle callouts (not part of tolerance text like "± 1°")
            angle_matches = re.findall(r'(?<![±])\s*\b(\d{2,3})°', all_text)
            valid_angles = [int(a) for a in angle_matches if int(a) in [30, 45, 60, 90, 120, 135, 150]]
            if valid_angles:
                bend_count = len(valid_angles)
                bend_angles = valid_angles
                result.detection_notes.append(f"Found {len(valid_angles)} angle callouts: {valid_angles}")
        
        result.bend_count = bend_count
        result.bend_angles = bend_angles
        
        # === ENHANCED DIMENSION DETECTION ===
        # First, extract text that's likely NOT dimensions (drawing numbers, part numbers, etc.)
        # Pattern to identify drawing/part numbers that should be excluded
        excluded_numbers = set()
        dwg_patterns = [
            r'DWG\s*(?:NO\.?)?\s*[:\s]*([A-Z]*\d+)',  # DWG NO: CK1055
            r'PART\s*(?:NO\.?)?\s*[:\s]*([A-Z]*\d+)',  # PART NO: ABC123
            r'(?:SCALE|REV|SHEET)\s*[:\s]*\d+',  # SCALE: 5:1, REV: A, SHEET 1
            r'[A-Z]{1,3}\d{3,}',  # Part numbers like CK1055, ABC12345
        ]
        
        for pattern in dwg_patterns:
            matches = re.findall(pattern, all_text, re.IGNORECASE)
            for match in matches:
                if isinstance(match, str):
                    # Extract just the number portion
                    nums = re.findall(r'\d+', match)
                    for n in nums:
                        if len(n) >= 3:  # Exclude 3+ digit numbers that are likely part numbers
                            excluded_numbers.add(float(n))
        
        # Look for dimensions in various formats
        dimension_patterns = [
            r'(\d+(?:\.\d+)?)\s*mm\b',  # "500mm" or "500.5mm"
            r'L\s*[=:]\s*(\d+(?:\.\d+)?)',  # "L = 500" or "L: 500"
            r'W\s*[=:]\s*(\d+(?:\.\d+)?)',  # "W = 300"
            r'H\s*[=:]\s*(\d+(?:\.\d+)?)',  # "H = 150"
        ]
        
        all_dimensions = []
        for pattern in dimension_patterns:
            matches = re.findall(pattern, all_text)
            for match in matches:
                if isinstance(match, tuple):
                    for m in match:
                        if m:
                            try:
                                val = float(m)
                                # Exclude if it looks like a part number
                                if 1 < val < 3000 and val not in excluded_numbers:
                                    all_dimensions.append(val)
                            except ValueError:
                                pass
                else:
                    try:
                        val = float(match)
                        if 1 < val < 3000 and val not in excluded_numbers:
                            all_dimensions.append(val)
                    except ValueError:
                        pass
        
        # Also look for standalone decimal dimensions (likely actual measurements)
        decimal_dims = re.findall(r'\b(\d+\.\d+)\b', all_text)
        for d in decimal_dims:
            try:
                val = float(d)
                if 1 < val < 500 and val not in excluded_numbers:  # Smaller range for decimals
                    all_dimensions.append(val)
            except ValueError:
                pass
        
        # Remove duplicates and sort
        all_dimensions = sorted(list(set(all_dimensions)), reverse=True)
        
        if all_dimensions:
            result.bend_lengths = all_dimensions[:10]  # Top 10 dimensions
            result.longest_bend_length = all_dimensions[0]
            
            # Try to identify part dimensions (usually the two largest)
            if len(all_dimensions) >= 2:
                result.part_length = all_dimensions[0]
                result.part_width = all_dimensions[1]
                result.flat_area = result.part_length * result.part_width
            
            result.detection_notes.append(f"Found {len(all_dimensions)} dimensions, largest: {all_dimensions[:5]}")
        
        # === MATERIAL DETECTION (Enhanced) ===
        material_patterns = {
            'Mild Steel': r'(?:mild\s*)?steel|M\.?S\.?|CR\b|HR\b|CRS|HRS|cold\s*roll|hot\s*roll',
            'Stainless Steel': r'stainless|S\.?S\.?|304|316|430|201|grade\s*30[0-9]',
            'Aluminium': r'alumin[iu]um|AL\b|6061|5052|5083|3003|alu\b',
            'Galvanised Steel': r'galv|zincalume|galvanised|galvanized|G\.?I\.?|zinc\s*coat',
            'Zincanneal': r'zincanneal|Z\.?A\.?',
            'Copper': r'\bcopper\b|CU\b',
        }
        
        for material, pattern in material_patterns.items():
            if re.search(pattern, all_text, re.IGNORECASE):
                result.material_type = material
                result.detection_notes.append(f"Detected material: {material}")
                break
        
        # === THICKNESS DETECTION (Enhanced) ===
        # Search specifically for thickness annotations first
        thickness_patterns = [
            r'THICKNESS\s*[=:]\s*(\d+(?:\.\d+)?)\s*(?:mm)?',  # "THICKNESS: 3mm"
            r'(?:THK|THICK)\s*[=:]\s*(\d+(?:\.\d+)?)',  # "THK: 3" or "THICK = 3"
            r'T\s*[=:]\s*(\d+(?:\.\d+)?)\s*(?:mm)?',  # "T = 3mm" or "T: 3"
            r'(\d+(?:\.\d+)?)\s*(?:mm)?\s*(?:THK|THICK)\b',  # "3mm THK" or "3 THICK"
            r'(\d+(?:\.\d+)?)\s*mm\s*(?:sheet|plate)',  # "3mm sheet"
        ]
        
        for pattern in thickness_patterns:
            match = re.search(pattern, all_text, re.IGNORECASE)
            if match:
                thickness = float(match.group(1))
                if 0.5 <= thickness <= 25:  # Reasonable sheet metal thickness
                    result.thickness = thickness
                    result.detection_notes.append(f"Detected thickness: {thickness}mm")
                    break
        
        # === WEIGHT DETECTION ===
        weight_patterns = [
            r'(?:WEIGHT|WT|MASS)\s*[=:]\s*(\d+(?:\.\d+)?)\s*(?:kg|KG)?',
            r'(\d+(?:\.\d+)?)\s*(?:kg|KG)\b',
        ]
        
        for pattern in weight_patterns:
            match = re.search(pattern, all_text, re.IGNORECASE)
            if match:
                weight = float(match.group(1))
                if 0.1 <= weight <= 100:  # Reasonable part weight
                    result.part_weight = weight
                    result.detection_notes.append(f"Detected weight: {weight}kg")
                    break
        
        # Calculate weight if we have dimensions, thickness, and material
        if result.part_weight is None and result.flat_area and result.thickness and result.material_type:
            density = MATERIAL_DENSITIES.get(result.material_type, 7850)
            area_m2 = result.flat_area / 1_000_000
            thickness_m = result.thickness / 1000
            result.part_weight = round(area_m2 * thickness_m * density, 3)
            result.detection_notes.append(f"Calculated weight: {result.part_weight}kg")
        
        # === GEOMETRY CLASSIFICATION ===
        # Check for geometry keywords
        if re.search(r'\bbox\b|enclosure|cabinet', all_text, re.IGNORECASE):
            result.geometry_type = "box"
        elif re.search(r'\bchannel\b|U-?shape|C-?shape', all_text, re.IGNORECASE):
            result.geometry_type = "channel"
        elif re.search(r'\bbracket\b|L-?shape|angle', all_text, re.IGNORECASE):
            result.geometry_type = "flange"
        elif result.bend_count >= 4:
            result.geometry_type = "box"
        elif result.bend_count >= 2:
            result.geometry_type = "channel"
        else:
            result.geometry_type = "flange"
        
        # === FLIP ESTIMATION ===
        if result.geometry_type in ['box', 'complex']:
            result.estimated_flips = result.bend_count
        else:
            result.estimated_flips = max(0, result.bend_count - 1)
        
        # === DIFFICULTY ESTIMATION ===
        difficulty_indicators = 0
        if result.bend_count >= 5:
            difficulty_indicators += 2
        if result.part_length and result.part_length > 1500:
            difficulty_indicators += 1
        if result.part_weight and result.part_weight > 10:
            difficulty_indicators += 1
        if re.search(r'tight|tolerance|precision|close', all_text, re.IGNORECASE):
            difficulty_indicators += 1
        if re.search(r'slot|hole|cutout|notch', all_text, re.IGNORECASE):
            difficulty_indicators += 1
        
        if difficulty_indicators >= 3:
            result.difficulty_level = "complex"
        elif difficulty_indicators >= 1:
            result.difficulty_level = "moderate"
        else:
            result.difficulty_level = "simple"
        
        result.detection_confidence = "high" if bend_count > 0 and result.thickness else \
                                       "medium" if bend_count > 0 or result.thickness else "low"
        
        doc.close()
        
    except Exception as e:
        result.detection_notes.append(f"PDF parsing error: {str(e)}")
        result.detection_confidence = "low"
    
    return result


@router.post("/analyze", response_model=DrawingAnalysisResult)
async def analyze_drawing(file: UploadFile = File(...)):
    """
    Upload and analyze an engineering drawing (DXF, PDF, STEP)
    """
    filename = file.filename.lower()
    
    # Determine file type
    if filename.endswith('.dxf'):
        file_type = 'DXF'
    elif filename.endswith('.pdf'):
        file_type = 'PDF'
    elif filename.endswith(('.step', '.stp')):
        file_type = 'STEP'
    else:
        raise HTTPException(
            status_code=400, 
            detail="Unsupported file type. Supported: DXF, PDF, STEP/STP"
        )
    
    # Save file temporarily
    with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(filename)[1]) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name
    
    try:
        if file_type == 'DXF':
            result = analyze_dxf_file(tmp_path, file.filename)
        elif file_type == 'PDF':
            result = analyze_pdf_file(tmp_path, file.filename)
        elif file_type == 'STEP':
            # STEP parsing requires additional libraries - placeholder for now
            result = DrawingAnalysisResult(
                file_type="STEP",
                file_name=file.filename,
                detection_notes=["STEP file parsing not yet implemented - coming soon!"],
                detection_confidence="low"
            )
        
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error analyzing file: {str(e)}"
        )
    finally:
        # Clean up temp file
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


class WeightCalculationRequest(BaseModel):
    material_type: str
    thickness: float
    flat_area: float  # in mm²


@router.post("/calculate-weight")
async def calculate_part_weight(request: WeightCalculationRequest) -> Dict[str, Any]:
    """
    Calculate part weight from material, thickness, and area
    """
    density = MATERIAL_DENSITIES.get(request.material_type, 7850)  # Default to steel
    
    # Convert mm² to m² and mm to m
    area_m2 = request.flat_area / 1_000_000
    thickness_m = request.thickness / 1000
    
    # Volume in m³
    volume = area_m2 * thickness_m
    
    # Weight in kg
    weight = volume * density
    
    return {
        "material_type": request.material_type,
        "density_kg_m3": density,
        "flat_area_mm2": request.flat_area,
        "thickness_mm": request.thickness,
        "volume_m3": volume,
        "weight_kg": round(weight, 3)
    }
