import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Edit, Trash2 } from 'lucide-react';

const EditAttributeDialog = ({ open, onOpenChange, attributeType, values, onUpdate, onDelete }) => {
  const [editingIndex, setEditingIndex] = useState(null);
  const [editValue, setEditValue] = useState('');

  // Reset state when dialog opens/closes
  const handleOpenChange = (isOpen) => {
    if (!isOpen) {
      setEditingIndex(null);
      setEditValue('');
    }
    onOpenChange(isOpen);
  };

  const getLabel = (type) => {
    const labels = { 'name': 'Material Type', 'grade': 'Grade', 'finish': 'Finish', 'thickness': 'Thickness' };
    return labels[type] || type;
  };

  const handleEdit = (index, value) => {
    setEditingIndex(index);
    setEditValue(value);
  };

  const handleSave = (index) => {
    if (editValue.trim()) {
      let normalizedValue = editValue.trim();
      // Auto-add 'mm' to thickness if not present
      if (attributeType === 'thickness' && !normalizedValue.toLowerCase().endsWith('mm')) {
        normalizedValue = `${normalizedValue}mm`;
      }
      onUpdate(attributeType, index, normalizedValue);
      setEditingIndex(null);
      setEditValue('');
    }
  };

  const handleDelete = (index, value) => {
    if (window.confirm(`Are you sure you want to delete "${value}"? This will only remove it from the dropdown options.`)) {
      onDelete(attributeType, index);
    }
  };

  // Sort values for display
  const sortedValues = [...values].sort((a, b) => {
    if (attributeType === 'thickness') {
      return (parseFloat(a) || 0) - (parseFloat(b) || 0);
    }
    return a.localeCompare(b);
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage {getLabel(attributeType)} Options</DialogTitle>
          <DialogDescription>Edit or delete existing {getLabel(attributeType).toLowerCase()} options</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 mt-4">
          {sortedValues.map((value, index) => (
            <div key={value} className="flex items-center gap-2 p-2 border rounded hover:bg-slate-50">
              {editingIndex === index ? (
                <>
                  <Input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="flex-1"
                    autoFocus
                    onKeyPress={(e) => { if (e.key === 'Enter') handleSave(index); }}
                  />
                  <Button size="sm" onClick={() => handleSave(index)} className="bg-green-600 hover:bg-green-700">Save</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingIndex(null)}>Cancel</Button>
                </>
              ) : (
                <>
                  <span className="flex-1 font-medium">{value}</span>
                  <Button size="sm" variant="ghost" onClick={() => handleEdit(index, value)} title="Edit">
                    <Edit className="w-4 h-4 text-blue-600" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(index, value)} title="Delete">
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </Button>
                </>
              )}
            </div>
          ))}
          {sortedValues.length === 0 && (
            <p className="text-center text-gray-500 py-4">No options available</p>
          )}
        </div>
        <div className="flex justify-end mt-4">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditAttributeDialog;
