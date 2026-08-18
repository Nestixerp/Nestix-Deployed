import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Plus, X } from 'lucide-react';
import TonToSheetCalculator from './TonToSheetCalculator';
import AddAttributeDialog from './AddAttributeDialog';

const MATERIAL_TYPES = ['Mild Steel', 'Stainless Steel', 'Aluminium', 'Galvanized Steel'];
const GRADES = ['HA3', '304', '316', 'Grade 250', 'Grade 350', '5005', '5052', '6061', 'G300', 'G450', 'G550'];
const FINISHES = ['P&O', '2B', 'Galv', 'Mill Finish', 'Anodized', 'Powder Coated'];
const THICKNESSES = ['1mm', '1.2mm', '1.6mm', '2mm', '2.5mm', '3mm', '4mm', '5mm', '6mm', '8mm', '10mm', '12mm'];
const STANDARD_WIDTHS = ['1220', '1250', '1500', '1800', '2000'];
const STANDARD_LENGTHS = ['2440', '2500', '3000', '3600', '4000', '6000'];

// Get today's date in YYYY-MM-DD format for input fields
const getTodayInputFormat = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const CreatePODialog = ({ open, onOpenChange, suppliers, materials, jobs, onSubmit }) => {
  const [poForm, setPOForm] = useState({
    supplier_id: '',
    po_type: 'Stock',
    job_number: '',
    test_cert_required: false,
    expected_delivery_date: getTodayInputFormat(), // Default to today
    line_items: [],
    notes: '',
    internal_notes: ''
  });

  const [lineItemForm, setLineItemForm] = useState({
    material_id: '',
    material_type: '',
    grade: '',
    finish: '',
    thickness: '',
    width: '',
    length: '',
    quantity_ordered: '',
    price_per_unit: ''
  });

  // Attribute lists (can be extended dynamically)
  const [materialTypes, setMaterialTypes] = useState(MATERIAL_TYPES);
  const [grades, setGrades] = useState(GRADES);
  const [finishes, setFinishes] = useState(FINISHES);
  const [thicknesses, setThicknesses] = useState(THICKNESSES);
  const [widths, setWidths] = useState(STANDARD_WIDTHS);
  const [lengths, setLengths] = useState(STANDARD_LENGTHS);

  // Dialog states
  const [addAttributeDialog, setAddAttributeDialog] = useState({ open: false, type: '' });

  const handleSelectStockMaterial = (materialId) => {
    if (materialId === 'manual') {
      setLineItemForm({
        ...lineItemForm,
        material_id: ''
      });
      return;
    }

    const material = materials.find(m => m.id === materialId);
    if (material) {
      setLineItemForm({
        ...lineItemForm,
        material_id: materialId,
        material_type: material.type || material.name,
        grade: material.grade,
        finish: material.finish,
        thickness: material.thickness,
        width: material.width?.toString() || '1220',
        length: material.length?.toString() || '2440'
      });
    }
  };

  const handleAddAttribute = (type, value) => {
    switch(type) {
      case 'Material Type':
        setMaterialTypes([...materialTypes, value]);
        setLineItemForm({...lineItemForm, material_type: value});
        break;
      case 'Grade':
        setGrades([...grades, value]);
        setLineItemForm({...lineItemForm, grade: value});
        break;
      case 'Finish':
        setFinishes([...finishes, value]);
        setLineItemForm({...lineItemForm, finish: value});
        break;
      case 'Thickness':
        setThicknesses([...thicknesses, value]);
        setLineItemForm({...lineItemForm, thickness: value});
        break;
      case 'Width':
        setWidths([...widths, value]);
        setLineItemForm({...lineItemForm, width: value});
        break;
      case 'Length':
        setLengths([...lengths, value]);
        setLineItemForm({...lineItemForm, length: value});
        break;
    }
  };

  const handleAddLineItem = () => {
    if (!lineItemForm.material_type || !lineItemForm.grade || !lineItemForm.finish || 
        !lineItemForm.thickness || !lineItemForm.width || !lineItemForm.length ||
        !lineItemForm.quantity_ordered || !lineItemForm.price_per_unit) {
      alert('Please fill in all material specification fields');
      return;
    }

    const newLineItem = {
      material_id: lineItemForm.material_id || null,
      material_type: lineItemForm.material_type,
      grade: lineItemForm.grade,
      finish: lineItemForm.finish,
      thickness: lineItemForm.thickness,
      width: parseFloat(lineItemForm.width),
      length: parseFloat(lineItemForm.length),
      quantity_ordered: parseInt(lineItemForm.quantity_ordered),
      price_per_unit: parseFloat(lineItemForm.price_per_unit)
    };

    setPOForm({
      ...poForm,
      line_items: [...poForm.line_items, newLineItem]
    });

    // Reset form
    setLineItemForm({
      material_id: '',
      material_type: '',
      grade: '',
      finish: '',
      thickness: '',
      width: '',
      length: '',
      quantity_ordered: '',
      price_per_unit: ''
    });
  };

  const handleRemoveLineItem = (index) => {
    setPOForm({
      ...poForm,
      line_items: poForm.line_items.filter((_, i) => i !== index)
    });
  };

  const handleSubmit = () => {
    if (!poForm.supplier_id || !poForm.expected_delivery_date || poForm.line_items.length === 0) {
      alert('Please fill in supplier, delivery date, and add at least one line item');
      return;
    }

    if (poForm.po_type === 'Job-Specific' && !poForm.job_number) {
      alert('Job number is required for Job-Specific POs');
      return;
    }

    onSubmit(poForm);
    
    // Reset form
    setPOForm({
      supplier_id: '',
      po_type: 'Stock',
      job_number: '',
      test_cert_required: false,
      expected_delivery_date: '',
      line_items: [],
      notes: '',
      internal_notes: ''
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Purchase Order</DialogTitle>
            <DialogDescription>Add a new purchase order for stock or job-specific materials</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Supplier and PO Type */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Supplier *</Label>
                <Select value={poForm.supplier_id} onValueChange={(value) => setPOForm({...poForm, supplier_id: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map(supplier => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.company_name} ({supplier.supplier_code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>PO Type *</Label>
                <Select value={poForm.po_type} onValueChange={(value) => setPOForm({...poForm, po_type: value})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Stock">Stock</SelectItem>
                    <SelectItem value="Job-Specific">Job-Specific</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Job Number and Delivery Date */}
            <div className="grid grid-cols-3 gap-4">
              {poForm.po_type === 'Job-Specific' && (
                <div>
                  <Label>Job Number *</Label>
                  <Select value={poForm.job_number} onValueChange={(value) => setPOForm({...poForm, job_number: value})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select job" />
                    </SelectTrigger>
                    <SelectContent>
                      {jobs.map(job => (
                        <SelectItem key={job.id} value={job.item_number || job.id}>
                          {job.item_number} - {job.customer_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>Expected Delivery Date *</Label>
                <Input
                  type="date"
                  value={poForm.expected_delivery_date}
                  onChange={(e) => setPOForm({...poForm, expected_delivery_date: e.target.value})}
                />
              </div>
              <div>
                <Label>Test Cert Required?</Label>
                <Select 
                  value={poForm.test_cert_required ? 'yes' : 'no'} 
                  onValueChange={(value) => setPOForm({...poForm, test_cert_required: value === 'yes'})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">No</SelectItem>
                    <SelectItem value="yes">Yes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Line Items */}
            <div className="border-t pt-4">
              <h3 className="font-semibold mb-3">Line Items</h3>
              
              {/* Add Line Item Form */}
              <div className="bg-slate-50 p-4 rounded-lg mb-4 space-y-4">
                {poForm.po_type === 'Stock' && (
                  <div>
                    <Label className="text-xs">Quick Select from Inventory (Optional)</Label>
                    <Select value={lineItemForm.material_id} onValueChange={handleSelectStockMaterial}>
                      <SelectTrigger>
                        <SelectValue placeholder="Or select from inventory..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">Manual Entry</SelectItem>
                        {materials.map(material => (
                          <SelectItem key={material.id} value={material.id}>
                            {material.type || material.name} - {material.grade} - {material.finish} - {material.thickness}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Material Specifications */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Material Type *</Label>
                    <Select value={lineItemForm.material_type} onValueChange={(value) => {
                      if (value === 'add_new') {
                        setAddAttributeDialog({ open: true, type: 'Material Type' });
                      } else {
                        setLineItemForm({...lineItemForm, material_type: value});
                      }
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {materialTypes.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                        <SelectItem value="add_new" className="text-blue-600 font-medium">+ Add New</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Grade *</Label>
                    <Select value={lineItemForm.grade} onValueChange={(value) => {
                      if (value === 'add_new') {
                        setAddAttributeDialog({ open: true, type: 'Grade' });
                      } else {
                        setLineItemForm({...lineItemForm, grade: value});
                      }
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {grades.map(grade => <SelectItem key={grade} value={grade}>{grade}</SelectItem>)}
                        <SelectItem value="add_new" className="text-blue-600 font-medium">+ Add New</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Finish *</Label>
                    <Select value={lineItemForm.finish} onValueChange={(value) => {
                      if (value === 'add_new') {
                        setAddAttributeDialog({ open: true, type: 'Finish' });
                      } else {
                        setLineItemForm({...lineItemForm, finish: value});
                      }
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {finishes.map(finish => <SelectItem key={finish} value={finish}>{finish}</SelectItem>)}
                        <SelectItem value="add_new" className="text-blue-600 font-medium">+ Add New</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Thickness *</Label>
                    <Select value={lineItemForm.thickness} onValueChange={(value) => {
                      if (value === 'add_new') {
                        setAddAttributeDialog({ open: true, type: 'Thickness' });
                      } else {
                        setLineItemForm({...lineItemForm, thickness: value});
                      }
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {thicknesses.map(thickness => <SelectItem key={thickness} value={thickness}>{thickness}</SelectItem>)}
                        <SelectItem value="add_new" className="text-blue-600 font-medium">+ Add New</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Width (mm) *</Label>
                    <Select value={lineItemForm.width} onValueChange={(value) => {
                      if (value === 'add_new') {
                        setAddAttributeDialog({ open: true, type: 'Width' });
                      } else {
                        setLineItemForm({...lineItemForm, width: value});
                      }
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {widths.map(width => <SelectItem key={width} value={width}>{width}</SelectItem>)}
                        <SelectItem value="add_new" className="text-blue-600 font-medium">+ Add New</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Length (mm) *</Label>
                    <Select value={lineItemForm.length} onValueChange={(value) => {
                      if (value === 'add_new') {
                        setAddAttributeDialog({ open: true, type: 'Length' });
                      } else {
                        setLineItemForm({...lineItemForm, length: value});
                      }
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {lengths.map(length => <SelectItem key={length} value={length}>{length}</SelectItem>)}
                        <SelectItem value="add_new" className="text-blue-600 font-medium">+ Add New</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Quantity and Price */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Quantity *</Label>
                    <Input
                      type="number"
                      value={lineItemForm.quantity_ordered}
                      onChange={(e) => setLineItemForm({...lineItemForm, quantity_ordered: e.target.value})}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Price/Unit *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={lineItemForm.price_per_unit}
                      onChange={(e) => setLineItemForm({...lineItemForm, price_per_unit: e.target.value})}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button 
                      onClick={handleAddLineItem}
                      className="w-full bg-slate-900 hover:bg-slate-800"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Line Item
                    </Button>
                  </div>
                </div>

                {/* Ton to Sheet Calculator */}
                {lineItemForm.thickness && lineItemForm.width && lineItemForm.length && (
                  <TonToSheetCalculator
                    onCalculate={(price) => setLineItemForm({...lineItemForm, price_per_unit: price})}
                    thickness={lineItemForm.thickness}
                    width={lineItemForm.width}
                    length={lineItemForm.length}
                  />
                )}
              </div>

              {/* Line Items Table */}
              {poForm.line_items.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Material Specification</TableHead>
                        <TableHead>Dimensions</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Price/Unit</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {poForm.line_items.map((item, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <div className="font-medium">{item.material_type}</div>
                            <div className="text-xs text-slate-500">
                              {item.grade} | {item.finish} | {item.thickness}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {item.width} × {item.length} mm
                          </TableCell>
                          <TableCell>{item.quantity_ordered}</TableCell>
                          <TableCell>${item.price_per_unit.toFixed(2)}</TableCell>
                          <TableCell className="text-right font-medium">
                            ${(item.quantity_ordered * item.price_per_unit).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRemoveLineItem(index)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow>
                        <TableCell colSpan={4} className="text-right font-semibold">Total:</TableCell>
                        <TableCell className="text-right font-semibold">
                          ${poForm.line_items.reduce((sum, item) => 
                            sum + (item.quantity_ordered * item.price_per_unit), 0
                          ).toFixed(2)}
                        </TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <Label>Notes</Label>
              <Textarea
                value={poForm.notes}
                onChange={(e) => setPOForm({...poForm, notes: e.target.value})}
                placeholder="Supplier-visible notes"
                rows={2}
              />
            </div>

            <div>
              <Label>Internal Notes</Label>
              <Textarea
                value={poForm.internal_notes}
                onChange={(e) => setPOForm({...poForm, internal_notes: e.target.value})}
                placeholder="Internal notes (not visible to supplier)"
                rows={2}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-4">
              <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button className="flex-1 bg-slate-900 hover:bg-slate-800" onClick={handleSubmit}>
                Create Purchase Order
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Attribute Dialog */}
      <AddAttributeDialog
        open={addAttributeDialog.open}
        onOpenChange={(open) => setAddAttributeDialog({ ...addAttributeDialog, open })}
        attributeType={addAttributeDialog.type}
        onAdd={(value) => handleAddAttribute(addAttributeDialog.type, value)}
      />
    </>
  );
};

export default CreatePODialog;
