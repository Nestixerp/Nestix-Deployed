import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { toast } from '../../hooks/use-toast';
import api from '../../services/api';

const StockAdjustmentDialog = ({ open, onOpenChange, material, adjustmentType, onSave }) => {
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');

  const handleSave = async () => {
    const quantity = parseInt(qty);
    if (!quantity || quantity <= 0) return;

    try {
      await api.post('/materials/adjust-stock', {
        material_id: material.id,
        type: adjustmentType,
        quantity: quantity,
        note: note || `${adjustmentType === 'add' ? 'Added' : 'Removed'} stock manually`,
        reference: 'Manual Adjustment'
      });

      toast({
        title: adjustmentType === 'add' ? 'Stock Added' : 'Stock Removed',
        description: `${quantity} sheets ${adjustmentType === 'add' ? 'added to' : 'removed from'} ${material.name}`,
      });

      onOpenChange(false);
      setQty('');
      setNote('');
      await onSave();
    } catch (error) {
      console.error('Error adjusting stock:', error);
      toast({ title: 'Error', description: 'Failed to adjust stock', variant: 'destructive' });
    }
  };

  if (!material) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{adjustmentType === 'add' ? 'Add Stock' : 'Remove Stock'}</DialogTitle>
          <DialogDescription>{adjustmentType === 'add' ? 'Add sheets to inventory' : 'Remove sheets from inventory'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="p-4 bg-slate-50 rounded-lg">
            <p className="font-semibold text-slate-900">{material.name}</p>
            <p className="text-sm text-slate-600">{material.thickness} - {material.grade} - {material.finish}</p>
            <p className="text-sm text-slate-600 mt-2">Current Stock: <span className="font-bold">{material.stock} sheets</span></p>
          </div>

          <div>
            <Label>Quantity (Sheets)</Label>
            <Input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Enter quantity" className="mt-1" />
          </div>

          <div>
            <Label>Note (Optional)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g., Purchase Order #1205, Job Q-786398, Stock Count Adjustment" className="mt-1" rows={3} />
          </div>

          {qty && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">New Stock: <span className="font-bold">{adjustmentType === 'add' ? material.stock + parseInt(qty) : Math.max(0, material.stock - parseInt(qty))} sheets</span></p>
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button className={`flex-1 ${adjustmentType === 'add' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`} onClick={handleSave} disabled={!qty || parseInt(qty) <= 0}>
              {adjustmentType === 'add' ? 'Add Stock' : 'Remove Stock'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default StockAdjustmentDialog;