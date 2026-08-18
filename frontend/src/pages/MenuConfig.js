import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { GripVertical, Eye, EyeOff, Save, RotateCcw, HelpCircle, Link2, ChevronUp, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import api from '../services/api';
import { MODULES, mergeMenu } from '../config/menuConfig';

/**
 * Admin Menu Configuration — drag & drop ordering of sections and modules,
 * rename display labels, hide/show modules, restore the default IMS structure.
 * Internal module keys and routes never change — only what the user sees.
 */
export default function MenuConfig() {
  const [sections, setSections] = useState([]);
  const [drag, setDrag] = useState(null); // {type:'section'|'item', sIdx, iIdx}
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const r = await api.get('/menu-config');
    setSections(mergeMenu(r.data.config));
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/menu-config', {
        sections: sections.map((s) => ({
          id: s.id, label: s.label, hidden: !!s.hidden,
          items: s.items.map((it) => ({ id: it.id, label: it.label, hidden: !!it.hidden })),
        })),
      });
      toast.success('Menu layout saved');
      window.dispatchEvent(new Event('menu-config-updated'));
    } catch (e) { toast.error(e?.response?.data?.detail || 'Save failed'); }
    finally { setSaving(false); }
  };

  const restoreDefault = async () => {
    if (!window.confirm('Restore the default IMS menu structure? Your custom order, labels and hidden modules will be reset.')) return;
    await api.delete('/menu-config');
    toast.success('Default IMS menu restored');
    window.dispatchEvent(new Event('menu-config-updated'));
    load();
  };

  // ── Drag & drop ────────────────────────────────────────────────────
  const onSectionDrop = (targetIdx) => {
    if (!drag || drag.type !== 'section' || drag.sIdx === targetIdx) return setDrag(null);
    setSections((prev) => {
      const next = [...prev];
      const [moved] = next.splice(drag.sIdx, 1);
      next.splice(targetIdx, 0, moved);
      return next;
    });
    setDrag(null);
  };

  const onItemDrop = (tsIdx, tiIdx) => {
    if (!drag || drag.type !== 'item') return setDrag(null);
    setSections((prev) => {
      const next = prev.map((s) => ({ ...s, items: [...s.items] }));
      const [moved] = next[drag.sIdx].items.splice(drag.iIdx, 1);
      let insertAt = tiIdx;
      if (drag.sIdx === tsIdx && drag.iIdx < tiIdx) insertAt = tiIdx - 1;
      next[tsIdx].items.splice(insertAt, 0, moved);
      return next;
    });
    setDrag(null);
  };

  const setSection = (sIdx, patch) => setSections((prev) => prev.map((s, i) => i === sIdx ? { ...s, ...patch } : s));
  const moveSection = (sIdx, dir) => setSections((prev) => {
    const t = sIdx + dir;
    if (t < 0 || t >= prev.length) return prev;
    const next = [...prev];
    [next[sIdx], next[t]] = [next[t], next[sIdx]];
    return next;
  });
  const setItem = (sIdx, iIdx, patch) => setSections((prev) => prev.map((s, i) => i === sIdx
    ? { ...s, items: s.items.map((it, j) => j === iIdx ? { ...it, ...patch } : it) } : s));

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5" data-testid="menu-config-page">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Menu Configuration</h1>
          <p className="text-gray-600 text-sm mt-1">
            Drag <GripVertical className="w-3.5 h-3.5 inline text-gray-400" /> to reorder sections and modules, rename display labels, or hide modules your business doesn't use.
            Internal module keys and routes never change — renaming is display-only and cannot break saved data, reports or permissions.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={restoreDefault} data-testid="menu-restore-default"><RotateCcw className="w-4 h-4 mr-1" /> Restore Default IMS Menu</Button>
          <Button onClick={save} disabled={saving} data-testid="menu-save-btn"><Save className="w-4 h-4 mr-1" /> {saving ? 'Saving…' : 'Save Layout'}</Button>
        </div>
      </div>

      <div className="space-y-3">
        {sections.map((sec, sIdx) => (
          <Card
            key={sec.id}
            className={`${sec.hidden ? 'opacity-50' : ''} ${drag?.type === 'section' && drag.sIdx === sIdx ? 'ring-2 ring-blue-400' : ''}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); if (drag?.type === 'section') onSectionDrop(sIdx); else if (drag?.type === 'item') onItemDrop(sIdx, sec.items.length); }}
            data-testid={`menu-section-${sec.id}`}
          >
            <CardHeader className="py-2">
              <div className="flex items-center gap-2">
                <span
                  draggable
                  onDragStart={() => setDrag({ type: 'section', sIdx })}
                  className="cursor-grab text-gray-400 hover:text-gray-700"
                  title="Drag to reorder section"
                  data-testid={`section-grip-${sec.id}`}
                >
                  <GripVertical className="w-5 h-5" />
                </span>
                <Input
                  value={sec.label}
                  onChange={(e) => setSection(sIdx, { label: e.target.value })}
                  className="h-9 font-bold uppercase tracking-wide max-w-[280px]"
                  data-testid={`section-label-${sec.id}`}
                />
                <span className="text-[10px] text-gray-400 font-mono">key: {sec.id}</span>
                <div className="flex-1" />
                <button onClick={() => moveSection(sIdx, -1)} className="text-gray-500 hover:text-gray-800 disabled:opacity-30" disabled={sIdx === 0} title="Move section up" data-testid={`section-up-${sec.id}`}><ChevronUp className="w-4 h-4" /></button>
                <button onClick={() => moveSection(sIdx, 1)} className="text-gray-500 hover:text-gray-800 disabled:opacity-30" disabled={sIdx === sections.length - 1} title="Move section down" data-testid={`section-down-${sec.id}`}><ChevronDown className="w-4 h-4" /></button>
                {!sec.standalone && (
                  <button onClick={() => setSection(sIdx, { hidden: !sec.hidden })} className="text-gray-500 hover:text-gray-800" title={sec.hidden ? 'Show section' : 'Hide section'} data-testid={`section-hide-${sec.id}`}>
                    {sec.hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0 pb-3">
              <div className="space-y-1">
                {sec.items.map((it, iIdx) => {
                  const mod = MODULES[it.id];
                  if (!mod) return null;
                  const Icon = mod.icon;
                  return (
                    <div
                      key={it.id}
                      className={`flex items-center gap-2 rounded border px-2 py-1 bg-white ${it.hidden ? 'opacity-50' : ''} ${drag?.type === 'item' && drag.sIdx === sIdx && drag.iIdx === iIdx ? 'ring-2 ring-blue-400' : ''}`}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (drag?.type === 'section') onSectionDrop(sIdx); else onItemDrop(sIdx, iIdx); }}
                      data-testid={`menu-item-${it.id}`}
                    >
                      <span draggable onDragStart={(e) => { e.stopPropagation(); setDrag({ type: 'item', sIdx, iIdx }); }}
                        className="cursor-grab text-gray-400 hover:text-gray-700" title="Drag to reorder / move to another section" data-testid={`item-grip-${it.id}`}>
                        <GripVertical className="w-4 h-4" />
                      </span>
                      <Icon className="w-4 h-4 text-slate-500 shrink-0" />
                      <Input value={it.label} onChange={(e) => setItem(sIdx, iIdx, { label: e.target.value })} className="h-8 text-sm max-w-[280px]" data-testid={`item-label-${it.id}`} />
                      {mod.shortcut && <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 rounded px-1 inline-flex items-center gap-0.5" title="Shortcut — points to the same module and data, no duplicate register"><Link2 className="w-3 h-3" /> shortcut</span>}
                      <span className="text-[10px] text-gray-400 font-mono hidden md:inline">key: {it.id} · {mod.path}</span>
                      <div className="flex-1" />
                      <span title={mod.help || ''} className="text-gray-400 hover:text-blue-600 cursor-help" data-testid={`item-help-${it.id}`}>
                        <HelpCircle className="w-4 h-4" />
                      </span>
                      <button onClick={() => setItem(sIdx, iIdx, { hidden: !it.hidden })} className="text-gray-500 hover:text-gray-800" title={it.hidden ? 'Show module' : 'Hide module'} data-testid={`item-hide-${it.id}`}>
                        {it.hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  );
                })}
                {sec.items.length === 0 && <p className="text-xs text-gray-400 py-2 px-1">Drop modules here.</p>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-xs text-gray-500">
        Tip: drag a module onto another section to move it. Shortcuts (↗) point to the same underlying register — no duplicate data is ever created.
        Hover the <HelpCircle className="w-3 h-3 inline" /> icon for guidance on what belongs in each module. These notes never appear on printed reports.
      </p>
    </div>
  );
}
