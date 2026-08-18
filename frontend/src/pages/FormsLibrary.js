import React, { useEffect, useState } from 'react';
import { FORMS } from '../forms';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { FileText, Printer, FileBadge2, Pencil, Link2 } from 'lucide-react';
import {
  buildDocControlFooter, getControlledDocumentByModule, invalidateDocControlCache
} from '../utils/documentControl';
import { formatDate } from '../utils/dateFormatter';
import api from '../services/api';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

/**
 * Forms Library — central index of all controlled blank forms (QMSF templates)
 * available to staff. Each form prints with the auto-pulled Document Control
 * footer (Form No, Issue, Revision Date, Owner) so the output is audit-compliant.
 *
 * Each form template declares a `related_module` key + a `fallback_module`
 * legacy short name. The Document Control register is queried by module key
 * — NOT by form_no — so renumbering a form in the register only requires
 * editing one Document Control entry, never any code.
 */
const FormsLibrary = () => {
  const navigate = useNavigate();
  const [docControlByFormId, setDocControlByFormId] = useState({});
  const [loading, setLoading] = useState(true);

  // Map form id -> route for the fillable digital version (optional per form)
  const FILL_ROUTES = {
    'employment-application': '/quality/forms/employment-application',
  };
  // Forms that accept public submissions get a "Submissions" admin page
  const SUBMISSION_ROUTES = {
    'employment-application': '/quality/forms/employment-application/submissions',
  };
  // Forms with a public-facing "candidate fills in" link
  const PUBLIC_ROUTES = {
    'employment-application': '/apply/employment-application',
  };

  const copyPublicLink = (form) => {
    const route = PUBLIC_ROUTES[form.id];
    if (!route) return;
    const url = `${window.location.origin}${route}`;
    navigator.clipboard.writeText(url);
    toast.success(`Public link copied: ${url}`);
  };

  useEffect(() => {
    (async () => {
      try {
        invalidateDocControlCache();
        // Preload Doc Control entries for every form, looked up by module key
        const map = {};
        for (const f of FORMS) {
          const doc = await getControlledDocumentByModule(f.related_module, {
            fallback: f.fallback_module,
            docType: 'Form',
          });
          if (doc) map[f.id] = doc;
        }
        setDocControlByFormId(map);
      } catch (e) {
        // non-fatal
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handlePrint = async (form) => {
    try {
      invalidateDocControlCache();
      const doc = await getControlledDocumentByModule(form.related_module, {
        fallback: form.fallback_module,
        docType: 'Form',
      });
      const footer = buildDocControlFooter(doc, {
        title: form.title,
        owner: 'Quality Manager',
      });
      const w = window.open('', '_blank', 'width=1100,height=1400');
      if (!w) { toast.error('Pop-up blocked'); return; }
      w.document.write(form.render(footer));
      w.document.close();
      setTimeout(() => { w.focus(); w.print(); }, 400);
    } catch (e) {
      toast.error('Could not generate form');
    }
  };

  // Group forms by their `group` field for visual organisation
  const grouped = FORMS.reduce((acc, f) => {
    (acc[f.group || 'Other'] ||= []).push(f);
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-6xl mx-auto" data-testid="forms-library-page">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
          <FileBadge2 className="w-7 h-7 text-blue-700" /> Forms Library
        </h1>
        <p className="text-slate-600 mt-1 text-sm">
          Controlled blank forms (QMSF templates). Each print pulls the live Document Control
          footer so the form number, issue and revision date stay in sync with your register.
        </p>
      </div>

      {loading ? (
        <Card className="p-8 text-center text-slate-500">Loading forms…</Card>
      ) : Object.entries(grouped).map(([group, list]) => (
        <div key={group} className="mb-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-2">{group}</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {list.map((f) => {
              const doc = docControlByFormId[f.id];
              return (
                <Card key={f.id} className="p-4 hover:shadow-md transition" data-testid={`form-card-${f.id}`}>
                  <div className="flex items-start gap-3">
                    <FileText className="w-8 h-8 text-blue-600 mt-1 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">{doc?.form_no || '—'}</span>
                        <h3 className="font-semibold text-slate-900">{f.title}</h3>
                      </div>
                      {f.description && (
                        <p className="text-xs text-slate-600 mt-1">{f.description}</p>
                      )}
                      <div className="text-xs text-slate-500 mt-2">
                        {doc ? (
                          <>Issue <strong>{doc.issue || '—'}</strong> · Rev <strong>{doc.revision_date ? formatDate(doc.revision_date) : '—'}</strong> · Owner <strong>{doc.owner || '—'}</strong></>
                        ) : (
                          <em>Not registered in Document Control yet</em>
                        )}
                      </div>
                      <div className="flex gap-2 mt-3 flex-wrap">
                        {FILL_ROUTES[f.id] && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => navigate(FILL_ROUTES[f.id])}
                            data-testid={`fill-form-${f.id}`}
                          >
                            <Pencil className="w-4 h-4 mr-1" /> Fill Online
                          </Button>
                        )}
                        {PUBLIC_ROUTES[f.id] && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => copyPublicLink(f)}
                            data-testid={`copy-public-${f.id}`}
                            title="Copy a public link to send to candidates"
                          >
                            <Link2 className="w-4 h-4 mr-1" /> Copy Public Link
                          </Button>
                        )}
                        {SUBMISSION_ROUTES[f.id] && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => navigate(SUBMISSION_ROUTES[f.id])}
                            data-testid={`submissions-${f.id}`}
                          >
                            <FileText className="w-4 h-4 mr-1" /> Submissions
                          </Button>
                        )}
                        <Button
                          size="sm"
                          onClick={() => handlePrint(f)}
                          data-testid={`print-form-${f.id}`}
                        >
                          <Printer className="w-4 h-4 mr-1" /> Print Blank
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default FormsLibrary;
