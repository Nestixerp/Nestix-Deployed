/**
 * OutstandingActions — dashboard widget surfacing every still-open action
 * across Management Reviews, ISO Audit follow-ups and the Injury Register.
 *
 * Each row is inline-editable: change owner, push the due date, or flip the
 * status to Yes — all without leaving the dashboard. Backed by
 * `PATCH /api/outstanding-actions/update`.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { toast } from 'sonner';
import { CheckSquare, AlertCircle, ClipboardList, ShieldCheck, HeartPulse, ExternalLink, Loader2 } from 'lucide-react';

const SOURCE_STYLE = {
  'Management Review': { icon: ClipboardList, badge: 'bg-blue-100 text-blue-800 border-blue-300' },
  'ISO Audit':         { icon: ShieldCheck,   badge: 'bg-purple-100 text-purple-800 border-purple-300' },
  'Injury':            { icon: HeartPulse,    badge: 'bg-red-100 text-red-800 border-red-300' },
};

const STATUS_OPTIONS = ['', 'Yes', 'No', 'Ongoing', 'N/A'];

const statusBadge = (status) => {
  const s = (status || '').toLowerCase();
  if (s === 'yes') return 'bg-green-100 text-green-800';
  if (s === 'ongoing' || s === 'in progress') return 'bg-amber-100 text-amber-800';
  if (s === 'no' || s === 'overdue') return 'bg-red-100 text-red-800';
  if (s === 'follow-up') return 'bg-orange-100 text-orange-800';
  return 'bg-slate-100 text-slate-700';
};

const fmtDateInput = (it) => {
  if (it.due_date) return it.due_date; // ISO yyyy-mm-dd works as <input type="date"> value
  return '';
};

const fmtDateDisplay = (it) => {
  if (it.due_date) {
    try {
      return new Date(it.due_date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { /* fallthrough */ }
  }
  return it.due_label || '—';
};

const isOverdue = (it) => {
  if (!it.due_date) return false;
  return it.due_date < new Date().toISOString().slice(0, 10);
};

/**
 * One outstanding-action row with inline owner / due-date / status controls.
 * Patches are sent on input blur (text fields) or change (status select).
 */
const Row = ({ item, index, onPatched, onRemoveLocally }) => {
  const navigate = useNavigate();
  const [owner, setOwner] = useState(item.owner || '');
  const [dueInput, setDueInput] = useState(fmtDateInput(item));
  const [status, setStatus] = useState(item.status || '');
  const [saving, setSaving] = useState(false);

  const meta = SOURCE_STYLE[item.source] || SOURCE_STYLE['Management Review'];
  const Icon = meta.icon;
  const editable = !!(item.target && item.target.kind && item.target.kind !== 'injury');
  const overdue = isOverdue({ ...item, due_date: dueInput || item.due_date });

  const patch = useCallback(async (changes) => {
    if (!editable) return;
    setSaving(true);
    try {
      const body = { target: item.target, ...changes };
      const r = await api.patch('/outstanding-actions/update', body);
      onPatched?.(index, r.data?.updated || {}, changes);
      // If status just transitioned to Yes / N/A / Closed → row no longer outstanding.
      const newStatus = (changes.status ?? status).toLowerCase();
      if (['yes', 'n/a', 'closed'].includes(newStatus)) {
        onRemoveLocally?.(index);
        toast.success('Marked complete');
      } else {
        toast.success('Saved');
      }
    } catch {
      toast.error('Save failed');
    } finally {
      setSaving(false);
    }
  }, [editable, item.target, index, onPatched, onRemoveLocally, status]);

  const commitOwner = () => {
    if (owner === (item.owner || '')) return;
    patch({ owner });
  };

  const commitDue = (newVal) => {
    setDueInput(newVal);
    const before = fmtDateInput(item);
    if (newVal === before) return;
    patch({ due_label: newVal || '' });
  };

  const commitStatus = (newVal) => {
    setStatus(newVal);
    patch({ status: newVal });
  };

  return (
    <div
      className="flex flex-col gap-2 p-2.5 rounded-md border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition"
      data-testid={`oa-item-${index}`}
    >
      <div className="flex items-start gap-3">
        <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold border ${meta.badge} flex-shrink-0`}>
          <Icon className="h-3 w-3" />
          {item.source}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-slate-800 line-clamp-2">{item.description || '(no description)'}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">{item.source_label}</div>
        </div>
        <button
          type="button"
          onClick={() => item.link && navigate(item.link)}
          className="text-slate-400 hover:text-slate-700 flex-shrink-0"
          title="Open source record"
          data-testid={`oa-open-${index}`}
        >
          <ExternalLink className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 pl-1 text-[11px]">
        {/* Owner */}
        <label className="inline-flex items-center gap-1">
          <span className="text-slate-500">Owner:</span>
          <input
            type="text"
            value={owner}
            disabled={!editable}
            onChange={(e) => setOwner(e.target.value)}
            onBlur={commitOwner}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            placeholder="—"
            className="h-6 w-28 rounded border border-slate-300 bg-white px-1.5 text-[11px] focus:border-slate-500 focus:outline-none disabled:bg-slate-100"
            data-testid={`oa-owner-${index}`}
          />
        </label>

        {/* Due date */}
        <label className="inline-flex items-center gap-1">
          {overdue && <AlertCircle className="h-3 w-3 text-red-600" />}
          <span className="text-slate-500">Due:</span>
          {editable ? (
            <input
              type="date"
              value={dueInput}
              onChange={(e) => commitDue(e.target.value)}
              className={`h-6 rounded border border-slate-300 bg-white px-1.5 text-[11px] focus:border-slate-500 focus:outline-none ${overdue ? 'text-red-700' : ''}`}
              data-testid={`oa-due-${index}`}
            />
          ) : (
            <span className={`font-medium ${overdue ? 'text-red-700' : 'text-slate-700'}`}>{fmtDateDisplay(item)}</span>
          )}
        </label>

        {/* Status */}
        <label className="inline-flex items-center gap-1">
          <span className="text-slate-500">Status:</span>
          {editable ? (
            <select
              value={status}
              onChange={(e) => commitStatus(e.target.value)}
              className={`h-6 rounded border border-slate-300 bg-white px-1 text-[11px] font-semibold focus:border-slate-500 focus:outline-none ${statusBadge(status)}`}
              data-testid={`oa-status-${index}`}
            >
              {STATUS_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt || '—'}</option>)}
            </select>
          ) : (
            <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${statusBadge(status)}`}>
              {status || '—'}
            </span>
          )}
        </label>

        {saving && (
          <span className="inline-flex items-center gap-1 text-slate-400 text-[10px]">
            <Loader2 className="h-3 w-3 animate-spin" /> Saving…
          </span>
        )}
      </div>
    </div>
  );
};

const OutstandingActions = ({ limit = 8 }) => {
  const [data, setData] = useState({ items: [], counts: {} });
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await api.get('/outstanding-actions');
        if (alive) setData(r.data || { items: [], counts: {} });
      } catch {
        if (alive) setData({ items: [], counts: {} });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [refreshKey]);

  // Optimistic local mutation after inline patch — saves a roundtrip.
  const applyLocal = (index, _updated, changes) => {
    setData((prev) => {
      const items = [...prev.items];
      const it = { ...items[index] };
      if (changes.owner !== undefined) it.owner = changes.owner;
      if (changes.due_label !== undefined) {
        it.due_label = changes.due_label;
        it.due_date = /^\d{4}-\d{2}-\d{2}$/.test(changes.due_label) ? changes.due_label : it.due_date;
      }
      if (changes.status !== undefined) it.status = changes.status;
      items[index] = it;
      return { ...prev, items };
    });
  };

  const removeLocal = (index) => {
    setData((prev) => {
      const items = prev.items.filter((_, i) => i !== index);
      const removed = prev.items[index];
      const counts = { ...(prev.counts || {}) };
      counts.total = Math.max((counts.total || 1) - 1, 0);
      if (removed?.source === 'Management Review') counts.management_review = Math.max((counts.management_review || 1) - 1, 0);
      if (removed?.source === 'ISO Audit')         counts.iso_audit = Math.max((counts.iso_audit || 1) - 1, 0);
      if (removed?.source === 'Injury')            counts.injury = Math.max((counts.injury || 1) - 1, 0);
      return { items, counts };
    });
  };

  const { items = [], counts = {} } = data;
  const visible = showAll ? items : items.slice(0, limit);

  return (
    <Card data-testid="outstanding-actions-widget" className="border-slate-200">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckSquare className="h-5 w-5 text-slate-700" />
            Outstanding Actions
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-md bg-slate-100 text-slate-700 px-2 py-0.5 font-semibold">
              {counts.total || 0} total
            </span>
            {counts.management_review > 0 && (
              <span className="rounded-md bg-blue-100 text-blue-800 px-2 py-0.5 font-semibold">
                {counts.management_review} review
              </span>
            )}
            {counts.iso_audit > 0 && (
              <span className="rounded-md bg-purple-100 text-purple-800 px-2 py-0.5 font-semibold">
                {counts.iso_audit} audit
              </span>
            )}
            {counts.injury > 0 && (
              <span className="rounded-md bg-red-100 text-red-800 px-2 py-0.5 font-semibold">
                {counts.injury} injury
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={() => setRefreshKey((k) => k + 1)} data-testid="oa-refresh" className="h-6 px-2 text-[11px]">
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-8 text-center text-slate-500 text-sm">Loading...</div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center">
            <CheckSquare className="h-10 w-10 mx-auto text-emerald-400 mb-2" />
            <p className="text-sm text-slate-600">Nothing outstanding. Nice work.</p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {visible.map((it, i) => (
                <Row
                  key={`${it.source}-${i}-${it.raised_date || ''}-${it.target?.meeting_id || ''}-${it.target?.action_idx ?? it.target?.carry_id ?? it.target?.follow_up_id ?? ''}`}
                  item={it}
                  index={i}
                  onPatched={applyLocal}
                  onRemoveLocally={removeLocal}
                />
              ))}
            </div>
            {items.length > limit && (
              <div className="mt-3 text-center">
                <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)} data-testid="oa-toggle-all">
                  {showAll ? 'Show less' : `Show all ${items.length}`}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default OutstandingActions;
