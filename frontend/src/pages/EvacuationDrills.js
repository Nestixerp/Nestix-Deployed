import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { formatDate } from '../utils/dateFormatter';
import {
  getControlledDocumentByModule, buildDocControlFooter,
  buildPrintFooterCss, buildPrintFooterHtml, buildPrintBodyOpen, buildPrintBodyClose, invalidateDocControlCache
} from '../utils/documentControl';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '../components/ui/dialog';
import { toast } from 'sonner';
import {
  Plus, Edit, Trash2, Printer, Save, X, FileText, ArrowLeft, Users, Clock
} from 'lucide-react';

const todayISO = () => new Date().toISOString().split('T')[0];

const emptyLocation = (n) => ({
  id: `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  name: n || '',
  present: [],
  absent: []
});

export default function EvacuationDrills() {
  const [drills, setDrills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newDate, setNewDate] = useState(todayISO());

  useEffect(() => { fetchDrills(); }, []);

  const fetchDrills = async () => {
    setLoading(true);
    try {
      const res = await api.get('/evacuation-drills');
      setDrills(res.data || []);
    } catch { toast.error('Failed to load'); } finally { setLoading(false); }
  };

  const handleCreate = async () => {
    try {
      const payload = {
        drill_date: newDate,
        time_taken: '',
        wardens: '',
        notes: '',
        locations: ['Factory 1', 'Factory 2', 'Factory 3'].map(emptyLocation)
      };
      const res = await api.post('/evacuation-drills', payload);
      toast.success('Drill record created');
      setCreateOpen(false);
      setNewDate(todayISO());
      fetchDrills();
      setEditing(res.data);
    } catch { toast.error('Create failed'); }
  };

  const handleDelete = async (drill) => {
    if (!window.confirm(`Delete evacuation drill from ${formatDate(drill.drill_date)}? This cannot be undone.`)) return;
    try { await api.delete(`/evacuation-drills/${drill.id}`); toast.success('Deleted'); fetchDrills(); }
    catch { toast.error('Delete failed'); }
  };

  if (editing) {
    return <DrillEditor key={editing.id} drill={editing} onBack={() => { setEditing(null); fetchDrills(); }} onSaved={(d) => setEditing(d)} />;
  }

  return (
    <div className="space-y-6 p-1" data-testid="evacuation-page">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Evacuation Drills</h1>
          <p className="text-sm text-slate-600">ISO 14001 / OHS — track drill date, locations, present & absent personnel, wardens, and time taken</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="bg-slate-900" data-testid="new-drill-btn">
          <Plus className="h-4 w-4 mr-2" /> New Drill
        </Button>
      </div>

      {loading ? (
        <Card><CardContent className="py-10 text-center text-slate-500">Loading...</CardContent></Card>
      ) : drills.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FileText className="h-12 w-12 mx-auto text-slate-300 mb-3" />
            <p className="text-slate-600 mb-4">No evacuation drill records yet.</p>
            <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-2" /> Create First Drill</Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader><CardTitle>Drill History</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Date</th>
                  <th className="text-left px-3 py-2 font-semibold">Locations</th>
                  <th className="text-left px-3 py-2 font-semibold">Total Present</th>
                  <th className="text-left px-3 py-2 font-semibold">Total Absent</th>
                  <th className="text-left px-3 py-2 font-semibold">Time Taken</th>
                  <th className="text-left px-3 py-2 font-semibold">Wardens</th>
                  <th className="text-right px-3 py-2 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {drills.map((d) => {
                  const locs = d.locations || [];
                  const totalPresent = locs.reduce((s, l) => s + (l.present?.length || 0), 0);
                  const totalAbsent = locs.reduce((s, l) => s + (l.absent?.length || 0), 0);
                  return (
                    <tr key={d.id} className="border-t hover:bg-slate-50" data-testid={`drill-row-${d.id}`}>
                      <td className="px-3 py-2 font-medium">{d.drill_date ? formatDate(d.drill_date) : '—'}</td>
                      <td className="px-3 py-2">{locs.length}</td>
                      <td className="px-3 py-2"><Badge className="bg-green-100 text-green-800 border-green-300" variant="outline">{totalPresent}</Badge></td>
                      <td className="px-3 py-2"><Badge className="bg-red-100 text-red-800 border-red-300" variant="outline">{totalAbsent}</Badge></td>
                      <td className="px-3 py-2">{d.time_taken || '—'}</td>
                      <td className="px-3 py-2 text-xs">{d.wardens || '—'}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => setEditing(d)} data-testid={`open-${d.id}`}><Edit className="h-3 w-3 mr-1" /> Open</Button>
                          <Button size="sm" variant="outline" onClick={() => handleDelete(d)} title="Delete"><Trash2 className="h-3 w-3 text-red-600" /></Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Evacuation Drill</DialogTitle>
            <DialogDescription>Starts with 3 default factory locations; you can add more or rename them in the editor.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Drill Date *</Label>
              <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} data-testid="new-drill-date" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}><X className="h-4 w-4 mr-2" /> Cancel</Button>
            <Button onClick={handleCreate} className="bg-slate-900" data-testid="create-drill-confirm"><Save className="h-4 w-4 mr-2" /> Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DrillEditor({ drill, onBack, onSaved }) {
  const [drillDate, setDrillDate] = useState(drill.drill_date || '');
  // Time Taken is stored as "X Min Y Seconds" string — split into numeric Min/Sec inputs
  const _parseTime = (s) => {
    const str = String(s || '');
    const m = str.match(/(\d+)\s*Min/i);
    const sec = str.match(/(\d+)\s*Sec/i);
    return { min: m ? Number(m[1]) : '', sec: sec ? Number(sec[1]) : '' };
  };
  const _initTT = _parseTime(drill.time_taken);
  const [timeMin, setTimeMin] = useState(_initTT.min);
  const [timeSec, setTimeSec] = useState(_initTT.sec);
  const timeTaken = (() => {
    const mm = timeMin === '' || timeMin === null ? '' : Number(timeMin);
    const ss = timeSec === '' || timeSec === null ? '' : Number(timeSec);
    if (mm === '' && ss === '') return '';
    return `${mm || 0} Min ${ss || 0} Seconds`;
  })();
  const [wardens, setWardens] = useState(drill.wardens || '');
  const [notes, setNotes] = useState(drill.notes || '');
  const [locations, setLocations] = useState(drill.locations || []);
  const [saving, setSaving] = useState(false);

  // AS 3745:2010 drill report fields
  const [startTime, setStartTime] = useState(drill.start_time || '');
  const [finishTime, setFinishTime] = useState(drill.finish_time || '');
  const [scenario, setScenario] = useState(drill.scenario || '');
  const [scenarioOther, setScenarioOther] = useState(drill.scenario_other || '');
  const [alarmMethod, setAlarmMethod] = useState(drill.alarm_method || '');
  const [alarmMethodOther, setAlarmMethodOther] = useState(drill.alarm_method_other || '');
  const [assemblyPoint, setAssemblyPoint] = useState(drill.assembly_point || '');
  const [chiefWarden, setChiefWarden] = useState(drill.chief_warden || '');
  const [areaWardens, setAreaWardens] = useState(drill.area_wardens || '');
  const [firstAider, setFirstAider] = useState(drill.first_aider || '');
  const [servicesCalledBy, setServicesCalledBy] = useState(drill.services_called_by || '');
  const [servicesNotified, setServicesNotified] = useState(drill.services_notified || '');
  const [allAccountedFor, setAllAccountedFor] = useState(drill.all_accounted_for || '');
  const [visitorsPresent, setVisitorsPresent] = useState(drill.visitors_present || '');
  const [visitorsNames, setVisitorsNames] = useState(drill.visitors_names || []);
  const [issuesFound, setIssuesFound] = useState(drill.issues_found || '');
  const [correctiveActions, setCorrectiveActions] = useState(drill.corrective_actions || []);
  const [drillOutcome, setDrillOutcome] = useState(drill.drill_outcome || '');
  const [chiefWardenSignoffName, setChiefWardenSignoffName] = useState(drill.chief_warden_signoff_name || '');
  const [chiefWardenSignoffDate, setChiefWardenSignoffDate] = useState(drill.chief_warden_signoff_date || '');
  const [managerSignoffName, setManagerSignoffName] = useState(drill.manager_signoff_name || '');
  const [managerSignoffDate, setManagerSignoffDate] = useState(drill.manager_signoff_date || '');

  // Auto-derive total evacuation time from start/finish (HH:MM[:SS]) — display only; backend authoritative on save
  const autoTimeTaken = (() => {
    if (!startTime || !finishTime) return '';
    try {
      const parts = (t) => {
        const p = String(t).split(':').map(Number);
        return { h: p[0] || 0, m: p[1] || 0, s: p[2] || 0 };
      };
      const a = parts(startTime); const b = parts(finishTime);
      let diff = ((b.h * 3600 + b.m * 60 + b.s) - (a.h * 3600 + a.m * 60 + a.s));
      if (diff < 0) diff += 24 * 3600;
      if (diff <= 0) return 'Under 1 Sec';
      const mm = Math.floor(diff / 60);
      const ss = diff % 60;
      return `${mm} Min ${ss} Seconds`;
    } catch { return ''; }
  })();

  // When the user populates start+finish, default the Min/Sec fields if they're empty
  useEffect(() => {
    if (!autoTimeTaken) return;
    if ((timeMin === '' || timeMin === null) && (timeSec === '' || timeSec === null)) {
      const p = autoTimeTaken.match(/(\d+)\s*Min\s*(\d+)\s*Sec/i);
      if (p) { setTimeMin(Number(p[1])); setTimeSec(Number(p[2])); }
    }
  }, [autoTimeTaken, timeMin, timeSec]);

  const addLocation = () => {
    setLocations([...locations, emptyLocation(`Factory ${locations.length + 1}`)]);
  };

  const removeLocation = (idx) => {
    if (!window.confirm(`Remove "${locations[idx].name || 'this location'}"?`)) return;
    setLocations(locations.filter((_, i) => i !== idx));
  };

  const updateLocationField = (idx, field, value) => {
    const next = [...locations];
    next[idx] = { ...next[idx], [field]: value };
    setLocations(next);
  };

  const addName = (idx, listKey) => {
    const next = [...locations];
    next[idx] = { ...next[idx], [listKey]: [...(next[idx][listKey] || []), ''] };
    setLocations(next);
  };

  const updateName = (idx, listKey, nameIdx, value) => {
    const next = [...locations];
    const list = [...(next[idx][listKey] || [])];
    list[nameIdx] = value;
    next[idx] = { ...next[idx], [listKey]: list };
    setLocations(next);
  };

  const removeName = (idx, listKey, nameIdx) => {
    const next = [...locations];
    next[idx] = { ...next[idx], [listKey]: (next[idx][listKey] || []).filter((_, i) => i !== nameIdx) };
    setLocations(next);
  };

  const buildPayload = () => {
    const cleaned = locations.map((l) => ({
      ...l,
      present: (l.present || []).filter((n) => n && n.trim()),
      absent: (l.absent || []).filter((n) => n && n.trim())
    }));
    return {
      drill_date: drillDate, time_taken: timeTaken, wardens, notes, locations: cleaned,
      start_time: startTime, finish_time: finishTime,
      scenario, scenario_other: scenarioOther,
      alarm_method: alarmMethod, alarm_method_other: alarmMethodOther,
      assembly_point: assemblyPoint,
      chief_warden: chiefWarden, area_wardens: areaWardens, first_aider: firstAider,
      services_called_by: servicesCalledBy, services_notified: servicesNotified,
      all_accounted_for: allAccountedFor,
      visitors_present: visitorsPresent,
      visitors_names: (visitorsNames || []).filter((n) => n && n.trim()),
      issues_found: issuesFound,
      corrective_actions: correctiveActions,
      drill_outcome: drillOutcome,
      chief_warden_signoff_name: chiefWardenSignoffName,
      chief_warden_signoff_date: chiefWardenSignoffDate,
      manager_signoff_name: managerSignoffName,
      manager_signoff_date: managerSignoffDate
    };
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.put(`/evacuation-drills/${drill.id}`, buildPayload());
      toast.success('Saved');
      onSaved(res.data);
    } catch { toast.error('Save failed'); } finally { setSaving(false); }
  };

  const handlePrint = async () => {
    invalidateDocControlCache();
    const doc = await getControlledDocumentByModule('Evacuation Drill Form', { fallback: 'Evacuation Drills', docType: 'Form' });
    const footer = buildDocControlFooter(doc, {
      title: 'Evacuation Drill Record', owner: 'Safety Manager',
    });
    const w = window.open('', '_blank', 'width=1200,height=1400');
    if (!w) { toast.error('Pop-up blocked'); return; }
    w.document.write(buildPrintHtml({ ...buildPayload(), footer }));
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 400);
  };

  const totalPresent = locations.reduce((s, l) => s + ((l.present || []).filter(n => n && n.trim()).length), 0);
  const totalAbsent = locations.reduce((s, l) => s + ((l.absent || []).filter(n => n && n.trim()).length), 0);

  return (
    <div className="space-y-5 p-1" data-testid="drill-editor">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={onBack} data-testid="back-btn"><ArrowLeft className="h-4 w-4 mr-2" /> Back to History</Button>
          <h1 className="text-2xl font-bold text-slate-900">Evacuation Drill — {drillDate ? formatDate(drillDate) : 'New'}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePrint} data-testid="print-btn"><Printer className="h-4 w-4 mr-2" /> Print</Button>
          <Button onClick={save} disabled={saving} className="bg-slate-900" data-testid="save-btn"><Save className="h-4 w-4 mr-2" /> {saving ? 'Saving...' : 'Save'}</Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label>Drill Date</Label>
              <Input type="date" value={drillDate} onChange={(e) => setDrillDate(e.target.value)} data-testid="editor-date" />
            </div>
            <div>
              <Label>Total Evacuation Time</Label>
              <div className="flex items-center gap-1">
                <Input
                  type="number" min="0" inputMode="numeric"
                  value={timeMin}
                  onChange={(e) => setTimeMin(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                  placeholder="0"
                  className="text-center"
                  data-testid="editor-time-min"
                />
                <span className="text-sm text-slate-600">Min</span>
                <Input
                  type="number" min="0" max="59" inputMode="numeric"
                  value={timeSec}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '') setTimeSec('');
                    else setTimeSec(Math.min(59, Math.max(0, Number(v))));
                  }}
                  placeholder="0"
                  className="text-center"
                  data-testid="editor-time-sec"
                />
                <span className="text-sm text-slate-600">Sec</span>
              </div>
            </div>
            <div className="md:col-span-2">
              <Label>Wardens</Label>
              <Input value={wardens} onChange={(e) => setWardens(e.target.value)} placeholder="e.g. John T, Chris W, David O'B" data-testid="editor-wardens" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="rounded-md border bg-green-50 px-4 py-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-green-900"><Users className="h-4 w-4 inline mr-2" />Total Present</span>
              <span className="text-2xl font-bold text-green-700" data-testid="total-present">{totalPresent}</span>
            </div>
            <div className="rounded-md border bg-red-50 px-4 py-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-red-900"><Users className="h-4 w-4 inline mr-2" />Total Absent</span>
              <span className="text-2xl font-bold text-red-700" data-testid="total-absent">{totalAbsent}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-slate-800">Locations ({locations.length})</h2>
        <Button variant="outline" onClick={addLocation} data-testid="add-location-btn">
          <Plus className="h-4 w-4 mr-2" /> Add Location
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {locations.map((loc, idx) => (
          <Card key={loc.id || idx} className="border-2" data-testid={`location-${idx}`}>
            <CardHeader className="pb-2 bg-slate-50">
              <div className="flex items-center justify-between gap-2">
                <Input
                  value={loc.name || ''}
                  onChange={(e) => updateLocationField(idx, 'name', e.target.value)}
                  className="text-base font-semibold h-9"
                  placeholder="Factory N"
                  data-testid={`location-name-${idx}`}
                />
                <Button size="sm" variant="ghost" onClick={() => removeLocation(idx)} title="Remove location">
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-3 space-y-3">
              {/* Present */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs font-bold text-green-700 underline">PRESENT ({(loc.present || []).filter(n => n && n.trim()).length})</Label>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => addName(idx, 'present')} data-testid={`add-present-${idx}`}>
                    <Plus className="h-3 w-3 mr-1" /> Add
                  </Button>
                </div>
                <div className="space-y-1">
                  {(loc.present || []).map((nm, nIdx) => (
                    <div key={`p-${nIdx}`} className="flex items-center gap-1">
                      <Input
                        value={nm}
                        onChange={(e) => updateName(idx, 'present', nIdx, e.target.value)}
                        placeholder="Name"
                        className="h-8 text-sm"
                        data-testid={`present-${idx}-${nIdx}`}
                      />
                      <Button size="sm" variant="ghost" className="h-8 px-1" onClick={() => removeName(idx, 'present', nIdx)}>
                        <X className="h-3 w-3 text-slate-500" />
                      </Button>
                    </div>
                  ))}
                  {(loc.present || []).length === 0 && <div className="text-xs text-slate-400 italic">No names yet</div>}
                </div>
              </div>

              {/* Absent */}
              <div className="pt-2 border-t">
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs font-bold text-red-700 underline">ABSENT ({(loc.absent || []).filter(n => n && n.trim()).length})</Label>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => addName(idx, 'absent')} data-testid={`add-absent-${idx}`}>
                    <Plus className="h-3 w-3 mr-1" /> Add
                  </Button>
                </div>
                <div className="space-y-1">
                  {(loc.absent || []).map((nm, nIdx) => (
                    <div key={`a-${nIdx}`} className="flex items-center gap-1">
                      <Input
                        value={nm}
                        onChange={(e) => updateName(idx, 'absent', nIdx, e.target.value)}
                        placeholder="Name"
                        className="h-8 text-sm"
                        data-testid={`absent-${idx}-${nIdx}`}
                      />
                      <Button size="sm" variant="ghost" className="h-8 px-1" onClick={() => removeName(idx, 'absent', nIdx)}>
                        <X className="h-3 w-3 text-slate-500" />
                      </Button>
                    </div>
                  ))}
                  {(loc.absent || []).length === 0 && <div className="text-xs text-slate-400 italic">No names yet</div>}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ============ DRILL REPORT (AS 3745:2010) ============ */}
      <Card>
        <CardHeader className="pb-2 bg-blue-50"><CardTitle className="text-base">Drill Report — Details</CardTitle></CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Start Time</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} data-testid="editor-start-time" />
            </div>
            <div>
              <Label className="text-xs">Finish Time</Label>
              <Input type="time" value={finishTime} onChange={(e) => setFinishTime(e.target.value)} data-testid="editor-finish-time" />
            </div>
            <div>
              <Label className="text-xs">Total Evac Time <span className="text-slate-400">(auto)</span></Label>
              <div className="h-9 mt-1 flex items-center text-sm font-semibold text-slate-700" data-testid="auto-total-time">
                {autoTimeTaken || timeTaken || '—'}
              </div>
            </div>
            <div>
              <Label className="text-xs">Assembly Point / Muster</Label>
              <Input value={assemblyPoint} onChange={(e) => setAssemblyPoint(e.target.value)} placeholder="e.g. Front car park" data-testid="editor-assembly" />
            </div>
            <div>
              <Label className="text-xs">Scenario</Label>
              <select value={scenario} onChange={(e) => setScenario(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm" data-testid="editor-scenario">
                <option value="">—</option>
                <option>Fire</option>
                <option>Chemical Spill</option>
                <option>Medical Emergency</option>
                <option>Gas Leak</option>
                <option>Power Failure</option>
                <option>Other</option>
              </select>
            </div>
            {scenario === 'Other' && (
              <div className="md:col-span-3">
                <Label className="text-xs">Scenario — Other</Label>
                <Input value={scenarioOther} onChange={(e) => setScenarioOther(e.target.value)} data-testid="editor-scenario-other" />
              </div>
            )}
            <div>
              <Label className="text-xs">Alarm Method</Label>
              <select value={alarmMethod} onChange={(e) => setAlarmMethod(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm" data-testid="editor-alarm">
                <option value="">—</option>
                <option>Siren</option>
                <option>Verbal</option>
                <option>Phone</option>
                <option>PA</option>
                <option>Other</option>
              </select>
            </div>
            {alarmMethod === 'Other' && (
              <div className="md:col-span-2">
                <Label className="text-xs">Alarm Method — Other</Label>
                <Input value={alarmMethodOther} onChange={(e) => setAlarmMethodOther(e.target.value)} />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 bg-blue-50"><CardTitle className="text-base">Emergency Control Organisation</CardTitle></CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Chief Warden</Label>
              <Input value={chiefWarden} onChange={(e) => setChiefWarden(e.target.value)} data-testid="editor-chief-warden" />
            </div>
            <div>
              <Label className="text-xs">Area Wardens <span className="text-slate-400">(comma list)</span></Label>
              <Input value={areaWardens} onChange={(e) => setAreaWardens(e.target.value)} placeholder="e.g. Chris W, David O'B" data-testid="editor-area-wardens" />
            </div>
            <div>
              <Label className="text-xs">First Aider</Label>
              <Input value={firstAider} onChange={(e) => setFirstAider(e.target.value)} data-testid="editor-first-aider" />
            </div>
            <div>
              <Label className="text-xs">Emergency Services Called By</Label>
              <Input value={servicesCalledBy} onChange={(e) => setServicesCalledBy(e.target.value)} placeholder="Name" data-testid="editor-services-called-by" />
            </div>
            <div>
              <Label className="text-xs">Emergency Services Notified?</Label>
              <select value={servicesNotified} onChange={(e) => setServicesNotified(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm" data-testid="editor-services-notified">
                <option value="">—</option>
                <option>Yes</option>
                <option>No</option>
                <option>N/A (Drill)</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">All Persons Accounted For?</Label>
              <select value={allAccountedFor} onChange={(e) => setAllAccountedFor(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm" data-testid="editor-accounted">
                <option value="">—</option>
                <option>Yes</option>
                <option>No</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 bg-blue-50"><CardTitle className="text-base">Visitors / Contractors</CardTitle></CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div>
              <Label className="text-xs">Visitors / Contractors Present?</Label>
              <select value={visitorsPresent} onChange={(e) => setVisitorsPresent(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm" data-testid="editor-visitors-present">
                <option value="">—</option>
                <option>Yes</option>
                <option>No</option>
              </select>
            </div>
            {visitorsPresent === 'Yes' && (
              <div className="md:col-span-3">
                <Label className="text-xs">Visitor / Contractor Names</Label>
                <div className="space-y-1">
                  {(visitorsNames || []).map((nm, idx) => (
                    <div key={`v-${idx}`} className="flex items-center gap-1">
                      <Input value={nm} onChange={(e) => {
                        const next = [...visitorsNames];
                        next[idx] = e.target.value;
                        setVisitorsNames(next);
                      }} placeholder="Name" className="h-8 text-sm" />
                      <Button size="sm" variant="ghost" className="h-8 px-1" onClick={() => setVisitorsNames(visitorsNames.filter((_, i) => i !== idx))}>
                        <X className="h-3 w-3 text-slate-500" />
                      </Button>
                    </div>
                  ))}
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setVisitorsNames([...(visitorsNames || []), ''])} data-testid="add-visitor">
                    <Plus className="h-3 w-3 mr-1" /> Add Visitor
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 bg-blue-50"><CardTitle className="text-base">Issues / Observations</CardTitle></CardHeader>
        <CardContent className="pt-4">
          <Label className="text-xs">Issues Found <span className="text-slate-400">(blocked exits, slow response, alarm issues, missing signage, etc.)</span></Label>
          <Textarea rows={3} value={issuesFound} onChange={(e) => setIssuesFound(e.target.value)} data-testid="editor-issues" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 bg-blue-50">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Corrective Actions</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setCorrectiveActions([...(correctiveActions || []), { id: `tmp_${Date.now()}`, action: '', responsible: '', due_date: '', completed_date: '', status: 'Open' }])} data-testid="add-corrective-action">
              <Plus className="h-3 w-3 mr-1" /> Add Action
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {(correctiveActions || []).length === 0 ? (
            <div className="text-sm text-slate-500 italic">No corrective actions recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="text-left px-2 py-1">Action</th>
                    <th className="text-left px-2 py-1">Responsible</th>
                    <th className="text-left px-2 py-1">Due</th>
                    <th className="text-left px-2 py-1">Completed</th>
                    <th className="text-left px-2 py-1">Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {correctiveActions.map((ca, idx) => (
                    <tr key={ca.id || idx} className="border-t" data-testid={`corrective-${idx}`}>
                      <td className="px-2 py-1"><Input value={ca.action || ''} onChange={(e) => {
                        const next = [...correctiveActions]; next[idx] = { ...next[idx], action: e.target.value }; setCorrectiveActions(next);
                      }} className="h-8 text-sm" /></td>
                      <td className="px-2 py-1"><Input value={ca.responsible || ''} onChange={(e) => {
                        const next = [...correctiveActions]; next[idx] = { ...next[idx], responsible: e.target.value }; setCorrectiveActions(next);
                      }} className="h-8 text-sm" /></td>
                      <td className="px-2 py-1"><Input type="date" value={ca.due_date || ''} onChange={(e) => {
                        const next = [...correctiveActions]; next[idx] = { ...next[idx], due_date: e.target.value }; setCorrectiveActions(next);
                      }} className="h-8 text-sm" /></td>
                      <td className="px-2 py-1"><Input type="date" value={ca.completed_date || ''} onChange={(e) => {
                        const next = [...correctiveActions]; next[idx] = { ...next[idx], completed_date: e.target.value }; setCorrectiveActions(next);
                      }} className="h-8 text-sm" /></td>
                      <td className="px-2 py-1">
                        <select value={ca.status || 'Open'} onChange={(e) => {
                          const next = [...correctiveActions]; next[idx] = { ...next[idx], status: e.target.value }; setCorrectiveActions(next);
                        }} className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm">
                          <option>Open</option>
                          <option>In Progress</option>
                          <option>Completed</option>
                        </select>
                      </td>
                      <td className="px-2 py-1">
                        <Button size="sm" variant="ghost" onClick={() => setCorrectiveActions(correctiveActions.filter((_, i) => i !== idx))}>
                          <X className="h-3 w-3 text-slate-500" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 bg-blue-50"><CardTitle className="text-base">Sign-off & Review</CardTitle></CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Drill Outcome</Label>
              <select value={drillOutcome} onChange={(e) => setDrillOutcome(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm" data-testid="editor-outcome">
                <option value="">—</option>
                <option>Satisfactory</option>
                <option>Requires Improvement</option>
              </select>
            </div>
            <div className="md:col-span-2" />
            <div>
              <Label className="text-xs">Chief Warden Sign-off</Label>
              <Input value={chiefWardenSignoffName} onChange={(e) => setChiefWardenSignoffName(e.target.value)} placeholder="Name" data-testid="editor-cw-signoff-name" />
            </div>
            <div>
              <Label className="text-xs">Date</Label>
              <Input type="date" value={chiefWardenSignoffDate} onChange={(e) => setChiefWardenSignoffDate(e.target.value)} data-testid="editor-cw-signoff-date" />
            </div>
            <div />
            <div>
              <Label className="text-xs">HSE Manager / Manager Sign-off</Label>
              <Input value={managerSignoffName} onChange={(e) => setManagerSignoffName(e.target.value)} placeholder="Name" data-testid="editor-mgr-signoff-name" />
            </div>
            <div>
              <Label className="text-xs">Date</Label>
              <Input type="date" value={managerSignoffDate} onChange={(e) => setManagerSignoffDate(e.target.value)} data-testid="editor-mgr-signoff-date" />
            </div>
          </div>
        </CardContent>
      </Card>
      {/* ============ /DRILL REPORT ============ */}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base"><Clock className="h-4 w-4 inline mr-2" />Notes</CardTitle></CardHeader>
        <CardContent>
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional observations, issues identified, lessons learned..." data-testid="editor-notes" />
        </CardContent>
      </Card>
    </div>
  );
}

function buildPrintHtml(d) {
  const {
    drill_date, time_taken, wardens, notes, locations,
    start_time, finish_time, scenario, scenario_other, alarm_method, alarm_method_other,
    assembly_point, chief_warden, area_wardens, first_aider,
    services_called_by, services_notified, all_accounted_for,
    visitors_present, visitors_names, issues_found, corrective_actions,
    drill_outcome, chief_warden_signoff_name, chief_warden_signoff_date,
    manager_signoff_name, manager_signoff_date,
    footer
  } = d || {};
  const fmt = (iso) => {
    if (!iso) return '';
    const [y, m, dd] = iso.split('-');
    return `${dd}/${m}/${y}`;
  };
  const showScenario = scenario === 'Other' ? (scenario_other || 'Other') : (scenario || '');
  const showAlarm = alarm_method === 'Other' ? (alarm_method_other || 'Other') : (alarm_method || '');

  const fieldRow = (label, value) => `
    <tr><td class="label">${label}</td><td>${escapeHtml(value || '')}</td></tr>`;

  // 2-column label/value row — used to compact the report so it fits 2 pages
  const twoColRow = (l1, v1, l2, v2) => `
    <tr>
      <td class="label">${l1}</td><td>${escapeHtml(v1 || '')}</td>
      <td class="label">${l2}</td><td>${escapeHtml(v2 || '')}</td>
    </tr>`;

  const correctiveRows = (corrective_actions || []).map((ca) => `
    <tr>
      <td>${escapeHtml(ca.action || '')}</td>
      <td>${escapeHtml(ca.responsible || '')}</td>
      <td style="text-align:center;">${fmt(ca.due_date)}</td>
      <td style="text-align:center;">${fmt(ca.completed_date)}</td>
      <td style="text-align:center;">${escapeHtml(ca.status || '')}</td>
    </tr>`).join('');

  // Compute max rows so columns align
  const maxPresent = Math.max(1, ...(locations || []).map(l => (l.present || []).filter(n => n && n.trim()).length));
  const maxAbsent = Math.max(1, ...(locations || []).map(l => (l.absent || []).filter(n => n && n.trim()).length));

  const presentRows = Array.from({ length: maxPresent }).map((_, rowIdx) => `
    <tr>
      ${(locations || []).map((l) => {
        const names = (l.present || []).filter(n => n && n.trim());
        return `<td style="text-align:center;">${escapeHtml(names[rowIdx] || '')}</td>`;
      }).join('')}
    </tr>
  `).join('');

  const absentRows = Array.from({ length: maxAbsent }).map((_, rowIdx) => `
    <tr>
      ${(locations || []).map((l) => {
        const names = (l.absent || []).filter(n => n && n.trim());
        return `<td style="text-align:center;">${escapeHtml(names[rowIdx] || '')}</td>`;
      }).join('')}
    </tr>
  `).join('');

  const headerRow = `<tr>${(locations || []).map((l) => `<th>${escapeHtml(l.name || '')}</th>`).join('')}</tr>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Evacuation Drill — ${fmt(drill_date)}</title>
  <style>
    ${buildPrintFooterCss()}
    @page { size: A4 portrait; margin: 10mm 12mm 16mm 12mm; }
    body { font-family: Calibri, Arial, sans-serif; color: #000; font-size: 10pt; line-height: 1.25; margin: 0; }
    h1 { font-size: 16pt; margin: 0 0 4px 0; text-decoration: underline; }
    h2 { font-size: 12pt; margin: 8px 0 4px 0; color: #1e3a8a; }
    .meta { font-size: 10pt; margin-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #000; padding: 3px 6px; font-size: 10pt; vertical-align: middle; }
    th { background: #f3f4f6; text-align: center; font-weight: bold; }
    .section-row td { background: #fef2f2; color: #b91c1c; text-decoration: underline; font-weight: bold; text-align: center; }
    .wardens { margin-top: 8px; }
    .wardens-label { font-weight: bold; text-decoration: underline; }
    .report-tbl td.label { background: #eff6ff; font-weight: bold; width: 18%; }
    .page-break { page-break-before: always; }
    .signoff { margin-top: 10px; }
    .sig-line { display: inline-block; width: 200px; border-bottom: 1px solid #000; height: 18px; vertical-align: bottom; }
    .issues-box { border: 1px solid #000; padding: 5px 7px; min-height: 32px; font-size: 10pt; }
    @media print { button { display: none; } }
  </style></head><body>${buildPrintBodyOpen(footer)}
    <h1>Evacuation Drill</h1>
    <div class="meta"><strong>Date:</strong> ${fmt(drill_date)}</div>
    <table>
      <thead>${headerRow}</thead>
      <tbody>
        <tr class="section-row">${(locations || []).map(() => `<td>Present</td>`).join('')}</tr>
        ${presentRows || `<tr>${(locations || []).map(() => `<td style="height:16px;"></td>`).join('')}</tr>`}
        <tr class="section-row">${(locations || []).map(() => `<td>Absent</td>`).join('')}</tr>
        ${absentRows || `<tr>${(locations || []).map(() => `<td style="height:16px;"></td>`).join('')}</tr>`}
      </tbody>
    </table>
    <div class="wardens">
      <span class="wardens-label">Assembly Point Marshal / Chief Warden:</span>
      ${escapeHtml(chief_warden || '')}
    </div>
    <div class="wardens">
      <span class="wardens-label">Wardens:</span>
      ${escapeHtml(wardens || '')}
    </div>
    <div class="wardens">
      <strong>Time Taken:</strong> ${escapeHtml(time_taken || '')}
    </div>
    ${notes ? `<div class="wardens"><strong>Notes:</strong> ${escapeHtml(notes).replace(/\n/g, '<br/>')}</div>` : ''}

    <div class="page-break"></div>
    <h1>Evacuation Drill Report</h1>
    <div class="meta"><strong>Date:</strong> ${fmt(drill_date)}</div>

    <h2>Drill Details</h2>
    <table class="report-tbl">
      ${twoColRow('Start Time', start_time, 'Finish Time', finish_time)}
      ${twoColRow('Total Evacuation Time', time_taken, 'Scenario', showScenario)}
      ${twoColRow('Alarm Method', showAlarm, 'Assembly Point / Muster', assembly_point)}
    </table>

    <h2>Emergency Control Organisation</h2>
    <table class="report-tbl">
      ${twoColRow('Chief Warden', chief_warden, 'Area Wardens', area_wardens)}
      ${twoColRow('First Aider', first_aider, 'Emergency Services Called By', services_called_by)}
      ${twoColRow('Emergency Services Notified?', services_notified, 'All Persons Accounted For?', all_accounted_for)}
    </table>

    <h2>Visitors / Contractors</h2>
    <table class="report-tbl">
      ${twoColRow('Visitors / Contractors Present?', visitors_present, 'Names', (visitors_names && visitors_names.length) ? visitors_names.join(', ') : '')}
    </table>

    <h2>Issues / Observations</h2>
    <div class="issues-box">${issues_found ? escapeHtml(issues_found).replace(/\n/g, '<br/>') : ''}</div>

    <h2>Corrective Actions</h2>
    <table>
      <thead><tr>
        <th style="width: 36%;">Action</th>
        <th style="width: 18%;">Responsible</th>
        <th style="width: 13%;">Due</th>
        <th style="width: 13%;">Completed</th>
        <th style="width: 12%;">Status</th>
      </tr></thead>
      <tbody>${correctiveRows || `
        <tr><td style="height:20px;"></td><td></td><td></td><td></td><td></td></tr>
        <tr><td style="height:20px;"></td><td></td><td></td><td></td><td></td></tr>
      `}</tbody>
    </table>

    <h2>Sign-off &amp; Review</h2>
    <table class="report-tbl">
      ${twoColRow('Drill Outcome', drill_outcome, '', '')}
    </table>
    <div class="signoff">
      <div style="margin-bottom: 10px;">
        <strong>Chief Warden:</strong> ${escapeHtml(chief_warden_signoff_name || '')}
        &nbsp;&nbsp; <strong>Signature:</strong> <span class="sig-line"></span>
        &nbsp;&nbsp; <strong>Date:</strong> ${fmt(chief_warden_signoff_date)}
      </div>
      <div>
        <strong>Manager / HSE:</strong> ${escapeHtml(manager_signoff_name || '')}
        &nbsp;&nbsp; <strong>Signature:</strong> <span class="sig-line"></span>
        &nbsp;&nbsp; <strong>Date:</strong> ${fmt(manager_signoff_date)}
      </div>
    </div>
    ${buildPrintBodyClose()}
  </body></html>`;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
