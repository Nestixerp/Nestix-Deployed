import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Wrench, Plus, Trash2 } from 'lucide-react';
import api from '../services/api';

const ToolingColumn = ({ title, type, items, onAdd, onToggle, onDelete }) => {
  const [newName, setNewName] = useState('');
  const add = () => {
    if (!newName.trim()) return;
    onAdd(type, newName.trim());
    setNewName('');
  };
  return (
    <div className="flex-1 min-w-[260px]">
      <h3 className="font-semibold text-sm text-slate-800 mb-2">{title}</h3>
      <div className="flex gap-2 mb-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder={type === 'top_punch' ? 'e.g. P-88 Gooseneck' : 'e.g. V40'}
          className="h-8 text-sm"
          data-testid={`tooling-add-input-${type}`}
        />
        <Button size="sm" className="h-8" onClick={add} data-testid={`tooling-add-btn-${type}`}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {items.length === 0 && <p className="text-xs text-slate-400">No tooling yet — add your first above.</p>}
        {items.map((t) => (
          <div key={t.id} className="flex items-center justify-between border rounded px-2 py-1 text-sm" data-testid={`tooling-row-${t.id}`}>
            <span className={t.status !== 'Active' ? 'line-through text-slate-400' : ''}>{t.name}</span>
            <div className="flex items-center gap-1">
              <Badge
                variant="outline"
                className={`cursor-pointer text-[10px] ${t.status === 'Active' ? 'bg-green-50 text-green-700 border-green-300' : 'bg-slate-100 text-slate-500'}`}
                onClick={() => onToggle(t)}
                data-testid={`tooling-toggle-${t.id}`}
              >
                {t.status}
              </Badge>
              <button className="p-1 text-slate-400 hover:text-red-600" onClick={() => onDelete(t)} data-testid={`tooling-delete-${t.id}`}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const ToolingLibrary = () => {
  const [tooling, setTooling] = useState([]);

  const load = async () => {
    try { setTooling((await api.get('/tooling')).data || []); } catch { setTooling([]); }
  };
  useEffect(() => { load(); }, []);

  const onAdd = async (type, name) => {
    try { await api.post('/tooling', { tooling_type: type, name }); load(); } catch { alert('Failed to add tooling'); }
  };
  const onToggle = async (t) => {
    try { await api.put(`/tooling/${t.id}`, { status: t.status === 'Active' ? 'Inactive' : 'Active' }); load(); } catch { alert('Failed to update'); }
  };
  const onDelete = async (t) => {
    if (!window.confirm(`Delete "${t.name}" from the tooling library?`)) return;
    try { await api.delete(`/tooling/${t.id}`); load(); } catch { alert('Failed to delete'); }
  };

  return (
    <Card data-testid="tooling-library-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wrench className="h-4 w-4" /> Press Brake Tooling Library
        </CardTitle>
        <p className="text-xs text-slate-500">
          Operators pick from these lists when completing a Press Brake job. Inactive tooling stays on past records but is hidden from pick-lists.
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-6">
          <ToolingColumn title="Top Punches" type="top_punch"
            items={tooling.filter(t => t.tooling_type === 'top_punch')}
            onAdd={onAdd} onToggle={onToggle} onDelete={onDelete} />
          <ToolingColumn title="V Dies" type="v_die"
            items={tooling.filter(t => t.tooling_type === 'v_die')}
            onAdd={onAdd} onToggle={onToggle} onDelete={onDelete} />
        </div>
      </CardContent>
    </Card>
  );
};
