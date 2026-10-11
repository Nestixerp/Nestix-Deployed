import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { toast } from 'sonner';
import { Plus, Trash2, ArrowUp, ArrowDown, RotateCcw } from 'lucide-react';

export const AgendaEditorDialog = ({ open, onOpenChange, agenda, showApplyOption, onSaved }) => {
  const [items, setItems] = useState([]);
  const [applyToCurrent, setApplyToCurrent] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setItems((agenda || []).map((text, i) => ({ text, orig: i })));
      setApplyToCurrent(false);
    }
  }, [open, agenda]);

  const setText = (i, text) => setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, text } : it)));
  const remove = (i) => setItems((arr) => arr.filter((_, idx) => idx !== i));
  const move = (i, dir) =>
    setItems((arr) => {
      const j = i + dir;
      if (j < 1 || j >= arr.length) return arr;
      const next = [...arr];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const add = () => setItems((arr) => [...arr, { text: '', orig: null }]);

  const save = async () => {
    const clean = items.filter((it) => it.text.trim());
    if (clean.length === 0) { toast.error('Agenda must contain at least one item'); return; }
    setSaving(true);
    try {
      const r = await api.put('/management-review/agenda-template', { agenda: clean.map((it) => it.text.trim()) });
      onSaved(r.data.agenda, clean.map((it) => it.orig), applyToCurrent);
      toast.success('Agenda template saved — new meetings will use it');
      onOpenChange(false);
    } catch {
      toast.error('Failed to save agenda');
    } finally {
      setSaving(false);
    }
  };

  const resetDefault = async () => {
    if (!window.confirm('Reset the agenda back to the 14 standard items?')) return;
    try {
      const r = await api.delete('/management-review/agenda-template');
      setItems(r.data.agenda.map((text, i) => ({ text, orig: null })));
      toast.success('Agenda reset to standard. Click Save to apply.');
    } catch {
      toast.error('Failed to reset agenda');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" data-testid="agenda-editor-dialog">
        <DialogHeader>
          <DialogTitle>Edit Agenda Template</DialogTitle>
          <DialogDescription>
            Modify agenda items when standards change. Item 1 always hosts the carry-over items from the previous
            meeting so it cannot be removed or moved. Past meetings keep their original agenda wording.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {items.map((it, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-xs font-bold text-slate-500 w-6 pt-2 text-right">{i + 1}.</span>
              <Textarea
                rows={2}
                value={it.text}
                onChange={(e) => setText(i, e.target.value)}
                className="text-xs min-h-[40px] flex-1"
                data-testid={`agenda-item-text-${i}`}
              />
              <div className="flex gap-0.5 pt-1">
                <button type="button" onClick={() => move(i, -1)} disabled={i <= 1}
                  className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20" title="Move up"
                  data-testid={`agenda-item-up-${i}`}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === 0 || i === items.length - 1}
                  className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20" title="Move down"
                  data-testid={`agenda-item-down-${i}`}>
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => remove(i)} disabled={i === 0}
                  className="p-1 text-slate-400 hover:text-red-600 disabled:opacity-20" title="Remove"
                  data-testid={`agenda-item-remove-${i}`}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={add} data-testid="agenda-add-item-btn">
            <Plus className="h-3 w-3 mr-1" /> Add agenda item
          </Button>
        </div>
        {showApplyOption && (
          <label className="flex items-center gap-2 text-xs text-slate-700 border-t pt-3 cursor-pointer">
            <input type="checkbox" checked={applyToCurrent} onChange={(e) => setApplyToCurrent(e.target.checked)}
              data-testid="agenda-apply-current-checkbox" />
            Also apply the updated agenda to this meeting (minutes already typed are kept per item)
          </label>
        )}
        <div className="flex justify-between pt-2">
          <Button variant="ghost" size="sm" onClick={resetDefault} className="text-slate-500" data-testid="agenda-reset-btn">
            <RotateCcw className="h-3 w-3 mr-1" /> Reset to standard 14 items
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={saving} className="bg-slate-900" data-testid="agenda-save-btn">
              {saving ? 'Saving...' : 'Save Agenda'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
