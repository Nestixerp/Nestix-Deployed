import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Plus, Edit, Trash2, Save, FlameKindling, Zap, Cross, Droplets } from 'lucide-react';
import api from '../services/api';
import { formatDate } from '../utils/dateFormatter';
import HelpButton from '../components/audit/HelpButton';

const REGISTERS = [
  { key: 'fire_equipment', label: 'Fire Equipment', icon: FlameKindling, help: 'Emergency Preparedness and Response' },
  { key: 'test_tag', label: 'Test & Tag', icon: Zap, help: 'Electrical Safety / Test and Tag' },
  { key: 'first_aid', label: 'First Aid', icon: Cross, help: 'First Aid and Injury Response' },
  { key: 'spill_kit', label: 'Spill Kits', icon: Droplets, help: 'Environmental Operational Controls' },
];

const YN = ({ v }) => v === true ? <span className="text-green-700 font-semibold">Yes</span> : v === false ? <span className="text-red-600 font-semibold">No</span> : <span className="text-gray-300">—</span>;

export default function AssetRegisters() {
  const [tab, setTab] = useState('fire_equipment');
  const [items, setItems] = useState([]);
  const [report, setReport] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    const [r, c] = await Promise.all([
      api.get('/asset-registers/items', { params: { register_type: tab } }),
      api.get('/asset-registers/compliance-report'),
    ]);
    setItems(r.data.items); setReport(c.data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab]);

  const save = async () => {
    const clean = { ...editing }; ['id', '_id', 'created_at', 'updated_at', 'created_by', 'overdue'].forEach(k => delete clean[k]);
    clean.register_type = tab;
    try {
      if (editing.id) await api.put(`/asset-registers/items/${editing.id}`, clean);
      else await api.post('/asset-registers/items', clean);
      setEditing(null); load();
    } catch (e) { alert('Save failed: ' + (e?.response?.data?.detail || e.message)); }
  };
  const remove = async (it) => { if (window.confirm(`Delete ${it.asset_id || 'item'}?`)) { await api.delete(`/asset-registers/items/${it.id}`); load(); } };

  const set = (k, v) => setEditing(e => ({ ...e, [k]: v }));
  const TF = (label, key) => (
    <div><Label className="text-xs">{label}</Label><Input value={editing[key] || ''} onChange={e => set(key, e.target.value)} data-testid={`ar-edit-${key}`} /></div>);
  const DF = (label, key) => (
    <div><Label className="text-xs">{label}</Label><Input type="date" value={editing[key] || ''} onChange={e => set(key, e.target.value)} data-testid={`ar-edit-${key}`} /></div>);
  const BF = (label, key) => (
    <div><Label className="text-xs">{label}</Label>
      <select className="border rounded h-9 px-2 text-sm w-full" value={editing[key] === true ? 'yes' : editing[key] === false ? 'no' : ''} onChange={e => set(key, e.target.value === 'yes' ? true : e.target.value === 'no' ? false : null)} data-testid={`ar-edit-${key}`}>
        <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
      </select></div>);

  const meta = REGISTERS.find(r => r.key === tab);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5" data-testid="asset-registers-page">
      <div>
        <h1 className="text-3xl font-bold">Asset Registers</h1>
        <p className="text-gray-600 text-sm mt-1">Fire equipment, electrical test & tag, first aid and spill kit registers — used for audit sampling and compliance tracking.</p>
      </div>

      {report && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {REGISTERS.map(r => (
            <Card key={r.key} className={`cursor-pointer border-l-4 ${report[r.key]?.overdue > 0 ? 'border-l-red-600' : 'border-l-green-600'} ${tab === r.key ? 'ring-2 ring-blue-400' : ''}`} onClick={() => setTab(r.key)} data-testid={`ar-stat-${r.key}`}>
              <CardContent className="pt-4 pb-3">
                <div className="text-xs text-gray-500 flex items-center gap-1"><r.icon className="w-3.5 h-3.5" /> {r.label}</div>
                <div className="text-2xl font-bold">{report[r.key]?.total ?? 0}</div>
                <div className="text-xs mt-0.5">
                  <span className={report[r.key]?.overdue > 0 ? 'text-red-600 font-bold' : 'text-gray-400'}>{report[r.key]?.overdue ?? 0} overdue</span>
                  <span className="text-gray-400"> · {report[r.key]?.due_30_days ?? 0} due in 30d</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">{meta.label} Register ({items.length}) <HelpButton section={meta.help} /></CardTitle>
          <Button size="sm" onClick={() => setEditing({ register_type: tab })} data-testid="ar-new-item"><Plus className="w-4 h-4 mr-1" /> Add Item</Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50"><tr>
              {['Asset / Kit ID', 'Type', 'Location', tab === 'test_tag' ? 'Tag #' : 'Provider / Officer', 'Last date', 'Next due',
                tab === 'fire_equipment' ? 'Access / Signage' : tab === 'test_tag' ? 'Tag current / Removed' : 'Expired / Restock',
                'Condition / Result', 'Notes', ''].map(h => <th key={h} className="text-left p-2 border">{h}</th>)}
            </tr></thead>
            <tbody>
              {items.map(it => (
                <tr key={it.id} className="hover:bg-gray-50">
                  <td className="p-2 border font-mono font-semibold">{it.asset_id}</td>
                  <td className="p-2 border text-xs">{it.equipment_type || ''}</td>
                  <td className="p-2 border text-xs">{it.location}</td>
                  <td className="p-2 border text-xs">{tab === 'test_tag' ? (it.tag_number || '') : (it.service_provider || it.first_aid_officer || '')}</td>
                  <td className="p-2 border text-xs">{formatDate(it.last_date)}</td>
                  <td className={`p-2 border text-xs ${it.overdue ? 'text-red-600 font-bold' : ''}`}>{formatDate(it.next_due)}{it.overdue ? ' ⚠' : ''}</td>
                  <td className="p-2 border text-xs">
                    {tab === 'fire_equipment' && <><YN v={it.access_clear} /> / <YN v={it.signage_visible} /></>}
                    {tab === 'test_tag' && <><YN v={!it.removed_from_service && it.result !== 'Fail'} /> / <YN v={it.removed_from_service} /></>}
                    {(tab === 'first_aid' || tab === 'spill_kit') && <><YN v={it.expired_items_found} /> / <YN v={it.restock_required} /></>}
                  </td>
                  <td className="p-2 border text-xs">{it.condition || it.result || ''}</td>
                  <td className="p-2 border text-xs max-w-[180px]">{it.notes || ''}</td>
                  <td className="p-2 border whitespace-nowrap">
                    <button className="text-blue-600 mr-2" onClick={() => setEditing(it)} data-testid={`ar-edit-${it.id}`}><Edit className="w-4 h-4" /></button>
                    <button className="text-red-600" onClick={() => remove(it)}><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={10} className="text-center text-gray-500 py-6">No items in this register yet.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" data-testid="ar-edit-dialog">
          <Card className="w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader className="pb-2"><CardTitle className="text-base">{editing.id ? 'Edit' : 'Add'} {meta.label} item</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {TF(tab === 'first_aid' || tab === 'spill_kit' ? 'Kit ID' : 'Asset ID', 'asset_id')}
              {TF('Equipment type', 'equipment_type')}
              {TF('Location', 'location')}
              {tab === 'test_tag' && <>{TF('Serial number', 'serial_number')}{TF('Tag number', 'tag_number')}{TF('Tested by', 'tested_by')}</>}
              {tab === 'fire_equipment' && <>{TF('Service provider', 'service_provider')}{TF('Inspection frequency', 'inspection_frequency')}</>}
              {tab === 'first_aid' && TF('First aid officer', 'first_aid_officer')}
              {DF(tab === 'test_tag' ? 'Last test date' : tab === 'fire_equipment' ? 'Last service date' : 'Last inspection date', 'last_date')}
              {DF('Next due', 'next_due')}
              {tab === 'fire_equipment' && <>{BF('Access clear', 'access_clear')}{BF('Signage visible', 'signage_visible')}{TF('Condition', 'condition')}</>}
              {tab === 'test_tag' && <>
                <div><Label className="text-xs">Result</Label>
                  <select className="border rounded h-9 px-2 text-sm w-full" value={editing.result || ''} onChange={e => set('result', e.target.value)} data-testid="ar-edit-result">
                    <option value="">—</option><option>Pass</option><option>Fail</option>
                  </select></div>
                {BF('Removed from service', 'removed_from_service')}{TF('Condition', 'condition')}</>}
              {(tab === 'first_aid' || tab === 'spill_kit') && <>{BF(tab === 'spill_kit' ? 'Contents checked' : 'Stock checked OK', 'contents_checked')}{BF('Expired items found', 'expired_items_found')}{BF('Restock required', 'restock_required')}</>}
              <div className="md:col-span-3"><Label className="text-xs">Notes</Label><Textarea rows={2} value={editing.notes || ''} onChange={e => set('notes', e.target.value)} data-testid="ar-edit-notes" /></div>
              <div className="md:col-span-3 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                <Button onClick={save} data-testid="ar-save-btn"><Save className="w-4 h-4 mr-1" /> Save</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
