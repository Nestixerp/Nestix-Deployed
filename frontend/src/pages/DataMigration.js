import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { Alert, AlertDescription } from '../components/ui/alert';
import { CheckCircle, AlertCircle, Download, Upload, Database } from 'lucide-react';
import api from '../services/api';

const DataMigration = () => {
  const exportRef = React.useRef('');
  const [exportReady, setExportReady] = useState(false);
  const [importData, setImportData] = useState('');
  const [importFileName, setImportFileName] = useState('');
  const [importMode, setImportMode] = useState('replace');
  const [loading, setLoading] = useState(false);
  const [exportResult, setExportResult] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [error, setError] = useState('');
  const [migrationResult, setMigrationResult] = useState(null);
  const [migrationLoading, setMigrationLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    setError('');
    setExportResult(null);
    setExportReady(false);
    
    try {
      const response = await api.get('/data-migration/export-all');
      exportRef.current = JSON.stringify(response.data);
      setExportReady(true);
      setExportResult(response.data.summary);
      // auto-download the backup file
      const blob = new Blob([exportRef.current], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nestix-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to export data: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadExport = () => {
    const blob = new Blob([exportRef.current], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nestix-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => setImportData(ev.target.result);
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!importData.trim()) {
      setError('Choose a backup file or paste the export data first');
      return;
    }
    if (importMode === 'replace' &&
        !window.confirm('REPLACE mode will CLEAR every collection contained in the backup file before restoring it. This cannot be undone. Continue?')) {
      return;
    }

    setLoading(true);
    setError('');
    setImportResult(null);

    try {
      const parsedData = JSON.parse(importData);
      const response = await api.post(`/data-migration/import-all?mode=${importMode}`, parsedData);
      setImportResult(response.data.import_summary);
      alert('✅ Data imported successfully!');
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError('Invalid JSON format. Please check the file / pasted data.');
      } else {
        setError('Failed to import data: ' + (err.response?.data?.detail || err.message));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCopyExport = () => {
    navigator.clipboard.writeText(exportRef.current);
    alert('✅ Export data copied to clipboard!');
  };

  const handleMigrateInvoicedField = async () => {
    if (!confirm('This will update all packing slips to use the "is_invoiced" field. Continue?')) {
      return;
    }

    setMigrationLoading(true);
    setError('');
    setMigrationResult(null);

    try {
      const response = await api.post('/data-migration/migrate-invoiced-field');
      setMigrationResult(response.data);
      alert('✅ Field migration completed successfully!');
    } catch (err) {
      setError('Failed to migrate field: ' + (err.response?.data?.detail || err.message));
    } finally {
      setMigrationLoading(false);
    }
  };

  const [weightMigrationResult, setWeightMigrationResult] = useState(null);
  const [weightMigrationLoading, setWeightMigrationLoading] = useState(false);

  const handleRecalculateWeights = async () => {
    if (!confirm('This will automatically calculate weight for all materials that currently have 0 or missing weight. Continue?')) {
      return;
    }

    setWeightMigrationLoading(true);
    setError('');
    setWeightMigrationResult(null);

    try {
      const response = await api.post('/data-migration/recalculate-material-weights');
      setWeightMigrationResult(response.data);
      alert('✅ Material weights recalculated successfully!');
    } catch (err) {
      setError('Failed to recalculate weights: ' + (err.response?.data?.detail || err.message));
    } finally {
      setWeightMigrationLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Data Migration Tool</h1>
        <p className="text-slate-600">Export data from one deployment and import to another</p>
      </div>

      {/* Field Migration Section */}
      <Card className="border-orange-300 bg-orange-50">
        <CardHeader>
          <CardTitle className="flex items-center text-orange-900">
            <AlertCircle className="w-5 h-5 mr-2" />
            Fix: Invoice Field Migration
          </CardTitle>
          <CardDescription>
            If you see invoiced packing slips appearing in "Create Invoice" dialog, click this button to fix the database field mismatch
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button 
            onClick={handleMigrateInvoicedField} 
            disabled={migrationLoading}
            className="w-full bg-orange-600 hover:bg-orange-700"
            size="lg"
          >
            <Database className="w-4 h-4 mr-2" />
            {migrationLoading ? 'Migrating...' : 'Migrate "invoiced" to "is_invoiced" Field'}
          </Button>

          {migrationResult && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="font-semibold mb-2">{migrationResult.message}</div>
                <div className="grid grid-cols-2 gap-2 text-sm mt-2">
                  <div>
                    <span className="font-medium">Total Packing Slips:</span> {migrationResult.summary.total_packing_slips}
                  </div>
                  <div>
                    <span className="font-medium">Renamed from old field:</span> {migrationResult.summary.renamed_from_old_field}
                  </div>
                  <div>
                    <span className="font-medium">Added new field:</span> {migrationResult.summary.added_new_field}
                  </div>
                  <div>
                    <span className="font-medium">With is_invoiced:</span> {migrationResult.summary.documents_with_new_field}
                  </div>
                </div>
                <div className="mt-3 text-xs text-green-700">
                  ✅ The invoice creation dialog will now correctly filter out invoiced packing slips
                </div>
              </AlertDescription>
            </Alert>
          )}

          <div className="text-sm text-slate-600 bg-white p-3 rounded border border-orange-200">
            <strong>What this does:</strong>
            <ul className="list-disc ml-5 mt-1 space-y-1">
              <li>Renames old "invoiced" field to "is_invoiced" in all packing slips</li>
              <li>Ensures all packing slips have the "is_invoiced" field (defaults to false)</li>
              <li>Fixes the field name mismatch between backend and frontend</li>
              <li>Safe to run multiple times</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Material Weight Recalculation Section */}
      <Card className="border-blue-300 bg-blue-50">
        <CardHeader>
          <CardTitle className="flex items-center text-blue-900">
            <Database className="w-5 h-5 mr-2" />
            Fix: Recalculate Material Weights
          </CardTitle>
          <CardDescription>
            If your materials show 0.00 kg weight, click this button to automatically calculate weights based on dimensions and material type
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button 
            onClick={handleRecalculateWeights} 
            disabled={weightMigrationLoading}
            className="w-full bg-blue-600 hover:bg-blue-700"
            size="lg"
          >
            <Database className="w-4 h-4 mr-2" />
            {weightMigrationLoading ? 'Calculating...' : 'Recalculate All Material Weights'}
          </Button>

          {weightMigrationResult && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="font-semibold mb-2">{weightMigrationResult.message}</div>
                <div className="grid grid-cols-2 gap-2 text-sm mt-2">
                  <div>
                    <span className="font-medium">Total Materials:</span> {weightMigrationResult.summary.total_materials}
                  </div>
                  <div>
                    <span className="font-medium">Materials with Weight:</span> {weightMigrationResult.summary.materials_with_weight}
                  </div>
                  <div>
                    <span className="font-medium">Updated:</span> <span className="text-green-600 font-semibold">{weightMigrationResult.summary.updated}</span>
                  </div>
                  <div>
                    <span className="font-medium">Skipped:</span> {weightMigrationResult.summary.skipped}
                  </div>
                </div>
                {weightMigrationResult.summary.errors && weightMigrationResult.summary.errors.length > 0 && (
                  <div className="mt-3 text-xs text-orange-700 bg-orange-100 p-2 rounded">
                    <strong>Skipped materials:</strong>
                    <ul className="list-disc ml-5 mt-1">
                      {weightMigrationResult.summary.errors.slice(0, 5).map((err, i) => (
                        <li key={i}>{err.name}: {err.reason || err.error}</li>
                      ))}
                      {weightMigrationResult.summary.errors.length > 5 && (
                        <li>...and {weightMigrationResult.summary.errors.length - 5} more</li>
                      )}
                    </ul>
                  </div>
                )}
                <div className="mt-3 text-xs text-green-700">
                  ✅ Material weights have been calculated and saved to the database
                </div>
              </AlertDescription>
            </Alert>
          )}

          <div className="text-sm text-slate-600 bg-white p-3 rounded border border-blue-200">
            <strong>What this does:</strong>
            <ul className="list-disc ml-5 mt-1 space-y-1">
              <li>Finds all materials with 0 or missing weight</li>
              <li>Calculates weight using: Width × Length × Thickness × Density ÷ 1,000,000</li>
              <li>Uses material-specific densities (Mild Steel: 7.85 g/cm³, Aluminium: 2.70 g/cm³, etc.)</li>
              <li>Updates weight_per_sheet in database</li>
              <li>Safe to run multiple times - only updates materials with 0 weight</li>
            </ul>
            <div className="mt-2 text-xs text-blue-800 bg-blue-100 p-2 rounded">
              <strong>Note:</strong> Materials must have material type, thickness, width, and length to calculate weight. Materials missing these fields will be skipped.
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Export Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Download className="w-5 h-5 mr-2" />
            Step 1: Full Backup (Export)
          </CardTitle>
          <CardDescription>
            Exports EVERY collection in the database — quotes, job sheets, customers, ISO modules, policies, RFQs, settings, users, everything. A backup file downloads automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button 
            onClick={handleExport} 
            disabled={loading}
            className="w-full"
            size="lg"
            data-testid="export-all-btn"
          >
            <Database className="w-4 h-4 mr-2" />
            {loading ? 'Exporting...' : 'Export Full Backup'}
          </Button>

          {exportResult && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="font-semibold mb-2" data-testid="export-success">Backup downloaded — {Object.keys(exportResult).length} collections, {Object.values(exportResult).reduce((a, b) => a + (Number(b) || 0), 0)} records</div>
                <div className="grid grid-cols-3 gap-1 text-xs max-h-48 overflow-y-auto">
                  {Object.entries(exportResult).filter(([, c]) => c > 0).map(([collection, count]) => (
                    <div key={collection}>
                      <span className="font-medium">{collection}:</span> {count}
                    </div>
                  ))}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {exportReady && (
            <div className="flex gap-2">
              <Button onClick={handleCopyExport} variant="outline" className="flex-1">
                Copy to Clipboard
              </Button>
              <Button onClick={handleDownloadExport} variant="outline" className="flex-1">
                Download Again
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Import Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Upload className="w-5 h-5 mr-2" />
            Step 2: Restore (Import)
          </CardTitle>
          <CardDescription>
            Choose a backup file (or paste the JSON), pick a mode, and click Restore
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <input type="file" accept=".json,application/json" onChange={handleImportFile}
              data-testid="import-file-input"
              className="text-sm file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:bg-slate-800 file:text-white file:cursor-pointer" />
            {importFileName && <span className="text-xs text-green-700 font-medium">✓ {importFileName} loaded</span>}
          </div>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="radio" name="importMode" checked={importMode === 'replace'} onChange={() => setImportMode('replace')} data-testid="mode-replace" />
              <b>Replace</b> — exact copy (clears each collection first). Use when migrating to a new deployment.
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" name="importMode" checked={importMode === 'merge'} onChange={() => setImportMode('merge')} data-testid="mode-merge" />
              <b>Merge</b> — update/add records by ID, keep everything else
            </label>
          </div>
          <Textarea
            value={importData.length > 100000 ? `(file loaded — ${(importData.length / 1e6).toFixed(1)} MB)` : importData}
            onChange={(e) => { setImportData(e.target.value); setImportFileName(''); }}
            rows={5}
            className="font-mono text-xs"
            placeholder="...or paste the exported JSON data here..."
            readOnly={importData.length > 100000}
          />

          <Button 
            onClick={handleImport} 
            disabled={loading || !importData}
            className="w-full bg-green-600 hover:bg-green-700"
            size="lg"
            data-testid="import-btn"
          >
            <Upload className="w-4 h-4 mr-2" />
            {loading ? 'Restoring...' : `Restore Backup (${importMode})`}
          </Button>

          {importResult && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="font-semibold mb-2" data-testid="import-success">Restore complete</div>
                <div className="grid grid-cols-3 gap-1 text-xs max-h-48 overflow-y-auto">
                  {Object.entries(importResult).map(([collection, count]) => (
                    <div key={collection}>
                      <span className="font-medium">{collection}:</span> {String(count)}
                    </div>
                  ))}
                </div>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Error Display */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Instructions */}
      <Card className="bg-blue-50">
        <CardHeader>
          <CardTitle className="text-lg">Migrating to a New Deployment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <ol className="list-decimal ml-5 space-y-1">
            <li>On your <b>OLD deployed site</b>: log in as admin → System → Data Migration → <b>Export Full Backup</b> (file downloads)</li>
            <li>Deploy the new instance and open it</li>
            <li>Log in as admin on the <b>NEW site</b> → System → Data Migration → choose the backup file → mode <b>Replace</b> → <b>Restore Backup</b></li>
            <li>Log out and back in (user accounts including passwords are restored from the backup)</li>
            <li>Verify quotes/job sheets/customers, then shut down the old deployment from the Home tab</li>
          </ol>
          <div className="mt-3 p-3 bg-yellow-100 rounded">
            <strong>⚠️ Replace mode</strong> clears each collection contained in the backup before restoring — use it only on a fresh deployment or when you want an exact copy.
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DataMigration;
