import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

const AddAttributeDialog = ({ open, onOpenChange, attributeType, onAdd }) => {
  const [value, setValue] = useState('');

  const getLabel = (type) => {
    const labels = { 'name': 'Material Type', 'grade': 'Grade', 'finish': 'Finish', 'thickness': 'Thickness' };
    return labels[type] || type;
  };

  const handleAdd = () => {
    if (value.trim()) {
      onAdd(attributeType, value);
      setValue('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add New {getLabel(attributeType)}</DialogTitle>
          <DialogDescription>Add a new option to the {getLabel(attributeType)} dropdown</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>{getLabel(attributeType)} Value</Label>
            <Input placeholder={`e.g., ${attributeType === 'thickness' ? '12mm' : 'New Value'}`} value={value} onChange={(e) => setValue(e.target.value)} onKeyPress={(e) => { if (e.key === 'Enter') handleAdd(); }} />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={handleAdd}>Add Option</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddAttributeDialog;