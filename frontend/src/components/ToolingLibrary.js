import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Wrench, Plus, Trash2 } from 'lucide-react';
import api from '../services/api';

const SYSTEMS = [
  { key: 'Wila', label: 'Willa Tooling Library' },
  { key: 'Euro', label: 'Euro Style Tooling Library' },
];

const ToolingColumn = ({ title, type, system, items, onAdd, onToggle, onDelete }) => {
  const [newName, setNewName] = useState('');
  const add = () => {
    if (!newName.trim()) return;
    onAdd(type, system, newName.trim());
    setNewName('');
  };
  return (
    <div className="flex-1 min-w-[240px]">
      <h4 className="font-medium text-xs uppercase tracking-wide text-slate-500 mb-2">{title}</h4>
      <div className="flex gap-2 mb-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder={type === 'top_punch' ? 'e.g. P-88 Gooseneck' : 'e.g. V40'}
          className="h-8 text-sm"
          data-testid={`tooling-add-input-${system}-${type}`}
        />
        <Button size="sm" className="h-8" onClick={add} data-testid={`tooling-add-btn-${system}-${type}`}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="space-y-1 max-h-56 overflow-y-auto">
        {items.length === 0 && <p className="text-xs text-slate-400">None yet.</p>}
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
  const [machines, setMachines] = useState([]);

  const load = async () => {
    try { setTooling((await api.get('/tooling')).data || []); } catch { setTooling([]); }
    try { setMachines((await api.get('/machines')).data || []); } catch { setMachines([]); }
  };
  useEffect(() => { load(); }, []);

  const onAdd = async (type, system, name) => {
    try { await api.post('/tooling', { tooling_type: type, tooling_system: system, name }); load(); } catch { alert('Failed to add tooling'); }
  };
  const onToggle = async (t) => {
    try { await api.put(`/tooling/${t.id}`, { status: t.status === 'Active' ? 'Inactive' : 'Active' }); load(); } catch { alert('Failed to update'); }
  };
  const onDelete = async (t) => {
    if (!window.confirm(`Delete "${t.name}" from the tooling library?`)) return;
    try { await api.delete(`/tooling/${t.id}`); load(); } catch { alert('Failed to delete'); }
  };
  const assignSystem = async (t, system) => {
    try { await api.put(`/tooling/${t.id}`, { tooling_system: system }); load(); } catch { alert('Failed to assign'); }
  };

  const unassigned = tooling.filter(t => !t.tooling_system);

  return (
    <Card data-testid="tooling-library-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wrench className="h-4 w-4" /> Press Brake Tooling Library
        </CardTitle>
        <p className="text-xs text-slate-500">
          Tooling is organised per tooling system. Operators completing a job only see the library that matches the
          machine's tooling system (set on each machine). Inactive tooling stays on past records but is hidden from pick-lists.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {SYSTEMS.map((sys) => {
          const sysMachines = machines.filter(m => m.tooling_system === sys.key).map(m => m.machine_name);
          const sysItems = tooling.filter(t => t.tooling_system === sys.key);
          return (
            <div key={sys.key} className="border rounded-lg p-4" data-testid={`tooling-system-${sys.key}`}>
              <div className="mb-3">
                <h3 className="font-semibold text-sm text-slate-900">{sys.label}</h3>
                <p className="text-xs text-slate-500">
                  {sysMachines.length > 0
                    ? `Used by: ${sysMachines.join(', ')}`
                    : 'No machine assigned to this system yet — set "Tooling System" when editing a machine.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-6">
                <ToolingColumn title="Top Punches" type="top_punch" system={sys.key}
                  items={sysItems.filter(t => t.tooling_type === 'top_punch')}
                  onAdd={onAdd} onToggle={onToggle} onDelete={onDelete} />
                <ToolingColumn title="V Dies" type="v_die" system={sys.key}
                  items={sysItems.filter(t => t.tooling_type === 'v_die')}
                  onAdd={onAdd} onToggle={onToggle} onDelete={onDelete} />
              </div>
            </div>
          );
        })}
        {unassigned.length > 0 && (
          <div className="border border-dashed rounded-lg p-4" data-testid="tooling-unassigned">
            <h3 className="font-semibold text-sm text-slate-700 mb-1">Unassigned Tooling</h3>
            <p className="text-xs text-slate-500 mb-2">Assign these to a library so the right operators see them.</p>
            <div className="space-y-1">
              {unassigned.map(t => (
                <div key={t.id} className="flex items-center justify-between border rounded px-2 py-1 text-sm">
                  <span>{t.name} <span className="text-xs text-slate-400">({t.tooling_type === 'top_punch' ? 'Top Punch' : 'V Die'})</span></span>
                  <div className="flex items-center gap-1">
                    {SYSTEMS.map(s => (
                      <Button key={s.key} size="sm" variant="outline" className="h-6 text-xs px-2"
                        onClick={() => assignSystem(t, s.key)} data-testid={`tooling-assign-${s.key}-${t.id}`}>
                        → {s.key}
                      </Button>
                    ))}
                    <button className="p-1 text-slate-400 hover:text-red-600" onClick={() => onDelete(t)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
