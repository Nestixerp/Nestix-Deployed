import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { formatDate } from '../utils/dateFormatter';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import { Plus, Trash2, Printer, FileText, Search, Eye } from 'lucide-react';
import {
  getControlledDocumentByModule, buildDocControlFooter,
  buildPrintFooterCss, buildPrintBodyOpen, buildPrintBodyClose,
} from '../utils/documentControl';

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);

export default function InjuryRegister() {
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [nextNumber, setNextNumber] = useState(null);
  const [docInfo, setDocInfo] = useState(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [list, next] = await Promise.all([
        api.get('/injury-register'),
        api.get('/injury-register/next-number'),
      ]);
      setRecords(list.data || []);
      setNextNumber(next.data?.next_number_label || null);
    } catch {
      toast.error('Failed to load injury register');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    getControlledDocumentByModule('Injury Register', { fallback: 'Injury Register', docType: 'Register' }).then(setDocInfo);
  }, []);

  const remove = async (rec) => {
    if (!window.confirm(`Delete Record #${rec.record_number_label}?`)) return;
    try {
      await api.delete(`/injury-register/${rec.id}`);
      toast.success('Deleted');
      fetchAll();
    } catch { toast.error('Delete failed'); }
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) => {
      const hay = [
        r.record_number_label, r.surname, r.given_name, r.activity_area,
        r.injury_description, r.cause_of_injury, r.first_aid_person,
      ].map((v) => String(v || '').toLowerCase()).join(' | ');
      return hay.includes(q);
    });
  }, [records, search]);

  const printIndex = async () => {
    // Pull the Injury Register entry from Document Control
    const doc = await getControlledDocumentByModule('Injury Register', {
      fallback: 'Injury Register', docType: 'Register',
    });
    const footer = buildDocControlFooter(doc, {
      title: 'Register of Injury', owner: 'Safety Manager',
    });
    const today = new Date().toISOString().slice(0, 10);
    const fmt = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
    const rows = (visible || []).map((r) => `
      <tr>
        <td>${esc(r.record_number_label || '')}</td>
        <td>${fmt(r.date)}</td>
        <td>${esc([r.given_name, r.surname].filter(Boolean).join(' '))}</td>
        <td>${esc(r.activity_area || '')}</td>
        <td>${esc(r.injury_description || '')}</td>
        <td>${esc(r.cause_of_injury || '')}</td>
        <td>${esc(r.first_aid_person || '')}</td>
      </tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Register of Injury</title>
      <style>
        ${buildPrintFooterCss()}
        @page { size: A4 landscape; margin: 10mm 12mm 18mm 12mm; }
        body { font-family: Arial, sans-serif; font-size: 10pt; color: #111; margin: 0; }
        h1 { font-size: 15pt; margin: 0 0 2mm 0; color: #1f2937; }
        .meta { font-size: 9pt; color: #555; margin-bottom: 3mm; display:flex; justify-content:space-between; }
        table.data-tbl { width: 100%; border-collapse: collapse; }
        table.data-tbl th, table.data-tbl td { border: 1px solid #444; padding: 4px 6px; vertical-align: top; }
        table.data-tbl th { background: #1f2937; color: #fff; text-align: left; font-size: 9pt; }
        table.data-tbl tr:nth-child(even) td { background: #f7f7f7; }
      </style></head><body>${buildPrintBodyOpen(footer)}
      <h1>Register of Injury</h1>
      <div class="meta"><span>${visible.length} record(s) on file</span><span>Printed ${fmt(today)}</span></div>
      <table class="data-tbl">
        <thead><tr>
          <th style="width:8%">Record #</th>
          <th style="width:9%">Date</th>
          <th style="width:14%">Worker</th>
          <th style="width:20%">Activity / Area</th>
          <th style="width:20%">Injury</th>
          <th style="width:15%">Cause</th>
          <th style="width:14%">First Aid By</th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="7" style="text-align:center;padding:6mm;color:#888;">No records on file.</td></tr>'}</tbody>
      </table>
      ${buildPrintBodyClose()}
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) return toast.error('Popup blocked. Please allow popups for this site.');
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch (_) { /* blocked */ } }, 400);
  };

  return (
    <div className="space-y-6 p-1" data-testid="injury-register-page">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Register of Injury</h1>
          <p className="text-sm text-slate-600">All recorded workplace injuries. Next record number: <strong>{nextNumber || '—'}</strong></p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={printIndex} data-testid="injury-print-index">
            <Printer className="h-4 w-4 mr-2" /> Print Index
          </Button>
          <Button onClick={() => navigate('/safety/injury-register/new')} className="bg-slate-900" data-testid="injury-new-btn">
            <Plus className="h-4 w-4 mr-2" /> New Record
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle>Records</CardTitle>
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search record #, name, activity..."
                className="pl-8"
                data-testid="injury-search-input"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 text-center text-slate-500">Loading...</div>
          ) : records.length === 0 ? (
            <div className="py-12 text-center">
              <FileText className="h-12 w-12 mx-auto text-slate-300 mb-3" />
              <p className="text-slate-600 mb-4">No injury records yet.</p>
              <Button onClick={() => navigate('/safety/injury-register/new')}><Plus className="h-4 w-4 mr-2" /> Create first record</Button>
            </div>
          ) : visible.length === 0 ? (
            <div className="py-10 text-center text-slate-500">No records match &ldquo;{search}&rdquo;.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Record #</th>
                    <th className="text-left px-3 py-2 font-semibold">Date</th>
                    <th className="text-left px-3 py-2 font-semibold">Worker</th>
                    <th className="text-left px-3 py-2 font-semibold">Activity / Area</th>
                    <th className="text-left px-3 py-2 font-semibold">Injury</th>
                    <th className="text-left px-3 py-2 font-semibold">First Aid By</th>
                    <th className="text-right px-3 py-2 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((rec) => (
                    <tr key={rec.id} className="border-t hover:bg-slate-50" data-testid={`injury-row-${rec.id}`}>
                      <td className="px-3 py-2 font-mono font-bold text-red-700">{rec.record_number_label}</td>
                      <td className="px-3 py-2">{rec.date ? formatDate(rec.date) : '—'}</td>
                      <td className="px-3 py-2">{[rec.given_name, rec.surname].filter(Boolean).join(' ') || '—'}</td>
                      <td className="px-3 py-2 max-w-xs truncate" title={rec.activity_area}>{rec.activity_area || '—'}</td>
                      <td className="px-3 py-2 max-w-xs truncate" title={rec.injury_description}>{rec.injury_description || '—'}</td>
                      <td className="px-3 py-2">{rec.first_aid_person || '—'}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => navigate(`/safety/injury-register/${rec.id}`)} data-testid={`injury-view-${rec.id}`} title="View / Edit">
                            <Eye className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => navigate(`/safety/injury-register/${rec.id}?print=1`)} title="Print">
                            <Printer className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => remove(rec)} title="Delete">
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
