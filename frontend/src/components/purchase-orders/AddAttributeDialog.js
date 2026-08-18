import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';

const AddAttributeDialog = ({ open, onOpenChange, attributeType, onAdd }) => {
  const [newValue, setNewValue] = useState('');

  const handleAdd = () => {
    if (newValue.trim()) {
      onAdd(newValue.trim());
      setNewValue('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add New {attributeType}</DialogTitle>
          <DialogDescription>
            Enter a new {attributeType.toLowerCase()} value to add to the dropdown
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>{attributeType}</Label>
            <Input
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder={`Enter ${attributeType.toLowerCase()}`}
              onKeyPress={(e) => e.key === 'Enter' && handleAdd()}
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button className="flex-1 bg-slate-900 hover:bg-slate-800" onClick={handleAdd}>
              Add {attributeType}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddAttributeDialog;
