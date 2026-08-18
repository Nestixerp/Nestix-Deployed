import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { formatDate } from '../utils/dateFormatter';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { Plus, Trash2, Eye, HardHat, ArrowRightCircle } from 'lucide-react';

export default function OHSMeetings() {
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    setLoading(true);
    try {
      setMeetings((await api.get('/ohs-meetings')).data || []);
    } catch { toast.error('Failed to load meetings'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, []);

  const remove = async (m) => {
    if (!window.confirm(`Delete OHS meeting from ${m.date || '(no date)'}?`)) return;
    try { await api.delete(`/ohs-meetings/${m.id}`); toast.success('Deleted'); fetchAll(); }
    catch { toast.error('Delete failed'); }
  };

  const countItems = (m) => (m.sections || []).reduce((n, s) => n + (s.items?.length || 0), 0);
  const openItems = (m) => (m.sections || []).reduce((n, s) =>
    n + (s.items || []).filter((i) => {
      const c = (i.completed || '').toLowerCase();
      return c && c !== 'yes' && c !== 'n/a';
    }).length, 0);

  return (
    <div className="space-y-6 p-1" data-testid="ohs-meetings-page">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">OHS &amp; Environmental Meetings</h1>
          <p className="text-sm text-slate-600">QMSF 25 — Issue 2: June 2023</p>
        </div>
        <div className="flex gap-2">
          {meetings.length > 0 && (
            <Button variant="outline" onClick={() => navigate('/safety/ohs-meetings/new?carry=1')} data-testid="ohs-new-carry-btn">
              <ArrowRightCircle className="h-4 w-4 mr-2" /> New (Carry Over Open Items)
            </Button>
          )}
          <Button onClick={() => navigate('/safety/ohs-meetings/new')} className="bg-slate-900" data-testid="ohs-new-btn">
            <Plus className="h-4 w-4 mr-2" /> New Meeting
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>All Meetings</CardTitle></CardHeader>
        <CardContent>
          {loading ? <div className="py-10 text-center text-slate-500">Loading...</div>
          : meetings.length === 0 ? (
            <div className="py-12 text-center">
              <HardHat className="h-12 w-12 mx-auto text-slate-300 mb-3" />
              <p className="text-slate-600 mb-4">No OHS meetings recorded yet.</p>
              <Button onClick={() => navigate('/safety/ohs-meetings/new')}><Plus className="h-4 w-4 mr-2" /> Create first meeting</Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Date</th>
                    <th className="text-left px-3 py-2 font-semibold">Sections</th>
                    <th className="text-left px-3 py-2 font-semibold">Items</th>
                    <th className="text-left px-3 py-2 font-semibold">Outstanding</th>
                    <th className="text-left px-3 py-2 font-semibold">Next Meeting</th>
                    <th className="text-right px-3 py-2 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {meetings.map((m) => (
                    <tr key={m.id} className="border-t hover:bg-slate-50" data-testid={`ohs-row-${m.id}`}>
                      <td className="px-3 py-2 font-semibold">{m.date ? formatDate(m.date) : '—'}</td>
                      <td className="px-3 py-2">{(m.sections || []).length}</td>
                      <td className="px-3 py-2">{countItems(m)}</td>
                      <td className="px-3 py-2"><span className="inline-block bg-amber-100 text-amber-800 rounded px-2 py-0.5 text-xs font-semibold">{openItems(m)}</span></td>
                      <td className="px-3 py-2">{m.next_meeting || '—'}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => navigate(`/safety/ohs-meetings/${m.id}`)} data-testid={`ohs-view-${m.id}`} title="View / Edit">
                            <Eye className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => remove(m)} title="Delete">
                            <Trash2 className="h-3 w-3 text-red-600" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
