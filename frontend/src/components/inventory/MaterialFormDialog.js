import React, { useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

// Material density mapping in g/cm³
const MATERIAL_DENSITIES = {
  'Mild Steel': 7.85,
  'Stainless Steel': 8.00,
  'Aluminium': 2.70,
  'Aluminum': 2.70,
  'Copper': 8.96,
  'Brass': 8.50,
  'Galvanised Steel': 7.85,
  'Zincalume': 7.85,
  'Chrome Steel': 7.85,
  'Tool Steel': 7.85,
};

// Calculate sheet weight based on dimensions and material type
const calculateSheetWeight = (materialType, thicknessStr, width, length) => {
  if (!materialType || !thicknessStr || !width || !length) return null;
  
  // Parse thickness from string (e.g., "5mm" -> 5)
  let thickness = 0;
  if (typeof thicknessStr === 'string') {
    thickness = parseFloat(thicknessStr.toString().toLowerCase().replace('mm', '').trim());
  } else {
    thickness = parseFloat(thicknessStr);
  }
  
  if (isNaN(thickness) || thickness <= 0) return null;
  
  // Get density (default to mild steel if unknown)
  const density = MATERIAL_DENSITIES[materialType] || 7.85;
  
  // Formula: Weight (kg) = Width (mm) × Length (mm) × Thickness (mm) × Density (g/cm³) ÷ 1,000,000
  const weight = (width * length * thickness * density) / 1000000;
  
  return parseFloat(weight.toFixed(2));
};

const MaterialFormDialog = ({ open, onOpenChange, materialForm, setMaterialForm, onSave, materialTypes, grades, finishes, thicknesses, onAddAttribute, title, description }) => {
  
  // Auto-calculate weight when dimensions or material type change
  useEffect(() => {
    const calculatedWeight = calculateSheetWeight(
      materialForm.name,
      materialForm.thickness,
      materialForm.width,
      materialForm.length
    );
    
    if (calculatedWeight !== null && calculatedWeight !== materialForm.weight_per_sheet) {
      setMaterialForm({...materialForm, weight_per_sheet: calculatedWeight});
    }
  }, [materialForm.name, materialForm.thickness, materialForm.width, materialForm.length]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Material Type *</Label>
              <Select value={materialForm.name} onValueChange={(value) => {
                if (value === '__add_new__') { onAddAttribute('name'); }
                else { setMaterialForm({...materialForm, name: value}); }
              }}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {materialTypes.map(type => (<SelectItem key={type} value={type}>{type}</SelectItem>))}
                  <SelectItem value="__add_new__"><span className="text-blue-600 font-semibold">+ Add New Type</span></SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Form Type</Label>
              <Select value={materialForm.type} onValueChange={(value) => setMaterialForm({...materialForm, type: value})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Sheet">Sheet</SelectItem>
                  <SelectItem value="Plate">Plate</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Grade *</Label>
              <Select value={materialForm.grade} onValueChange={(value) => {
                if (value === '__add_new__') { onAddAttribute('grade'); }
                else { setMaterialForm({...materialForm, grade: value}); }
              }}>
                <SelectTrigger><SelectValue placeholder="Select grade" /></SelectTrigger>
                <SelectContent>
                  {grades.map(grade => (<SelectItem key={grade} value={grade}>{grade}</SelectItem>))}
                  <SelectItem value="__add_new__"><span className="text-blue-600 font-semibold">+ Add New Grade</span></SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Finish *</Label>
              <Select value={materialForm.finish} onValueChange={(value) => {
                if (value === '__add_new__') { onAddAttribute('finish'); }
                else { setMaterialForm({...materialForm, finish: value}); }
              }}>
                <SelectTrigger><SelectValue placeholder="Select finish" /></SelectTrigger>
                <SelectContent>
                  {finishes.map(finish => (<SelectItem key={finish} value={finish}>{finish}</SelectItem>))}
                  <SelectItem value="__add_new__"><span className="text-blue-600 font-semibold">+ Add New Finish</span></SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Thickness *</Label>
              <Select value={materialForm.thickness} onValueChange={(value) => {
                if (value === '__add_new__') { onAddAttribute('thickness'); }
                else { setMaterialForm({...materialForm, thickness: value}); }
              }}>
                <SelectTrigger><SelectValue placeholder="Select thickness" /></SelectTrigger>
                <SelectContent>
                  {thicknesses.map(thickness => (<SelectItem key={thickness} value={thickness}>{thickness}</SelectItem>))}
                  <SelectItem value="__add_new__"><span className="text-blue-600 font-semibold">+ Add New Thickness</span></SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Width (mm)</Label>
              <Input type="number" value={materialForm.width} onChange={(e) => setMaterialForm({...materialForm, width: parseInt(e.target.value)})} />
            </div>
            <div>
              <Label>Length (mm)</Label>
              <Input type="number" value={materialForm.length} onChange={(e) => setMaterialForm({...materialForm, length: parseInt(e.target.value)})} />
            </div>
            <div>
              <Label>Weight/Sheet (kg) * <span className="text-xs text-green-600">(Auto-calculated)</span></Label>
              <Input 
                type="number" 
                step="0.01" 
                placeholder="e.g., 74.48" 
                value={materialForm.weight_per_sheet || ''} 
                onChange={(e) => setMaterialForm({...materialForm, weight_per_sheet: parseFloat(e.target.value)})}
                className="bg-green-50"
              />
              <p className="text-xs text-gray-500 mt-1">
                Based on: {materialForm.name || 'Material'} ({MATERIAL_DENSITIES[materialForm.name] || 7.85} g/cm³)
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Initial Stock (Sheets)</Label>
              <Input type="number" value={materialForm.stock} onChange={(e) => setMaterialForm({...materialForm, stock: parseInt(e.target.value)})} />
            </div>
            <div>
              <Label>Reorder Level</Label>
              <Input type="number" value={materialForm.reorder_level} onChange={(e) => setMaterialForm({...materialForm, reorder_level: parseInt(e.target.value)})} />
            </div>
            <div>
              <Label>Markup %</Label>
              <Input type="number" step="0.1" value={materialForm.markup_percentage} onChange={(e) => setMaterialForm({...materialForm, markup_percentage: parseFloat(e.target.value)})} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Location (Rack) *</Label>
              <Input placeholder="e.g., Rack A-12" value={materialForm.location} onChange={(e) => setMaterialForm({...materialForm, location: e.target.value})} />
            </div>
            <div>
              <Label>Supplier *</Label>
              <Input placeholder="e.g., Impact Steel" value={materialForm.supplier} onChange={(e) => setMaterialForm({...materialForm, supplier: e.target.value})} />
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button className="flex-1 bg-slate-900 hover:bg-slate-800" onClick={onSave}>{title.includes('Edit') ? 'Update' : 'Add'} Material</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MaterialFormDialog;