import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { Alert, AlertDescription } from '../components/ui/alert';
import { CheckCircle, AlertCircle, Download, Upload, Database } from 'lucide-react';
import api from '../services/api';

const DataMigration = () => {
  const [exportData, setExportData] = useState('');
  const [importData, setImportData] = useState('');
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
    
    try {
      const response = await api.get('/data-migration/export-all');
      const jsonString = JSON.stringify(response.data, null, 2);
      setExportData(jsonString);
      setExportResult(response.data.summary);
    } catch (err) {
      setError('Failed to export data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadExport = () => {
    const blob = new Blob([exportData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nestix-data-export.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    if (!importData.trim()) {
      setError('Please paste the export data first');
      return;
    }

    setLoading(true);
    setError('');
    setImportResult(null);

    try {
      const parsedData = JSON.parse(importData);
      const response = await api.post('/data-migration/import-all', parsedData);
      setImportResult(response.data.import_summary);
      alert('✅ Data imported successfully!');
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError('Invalid JSON format. Please check the pasted data.');
      } else {
        setError('Failed to import data: ' + (err.response?.data?.detail || err.message));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCopyExport = () => {
    navigator.clipboard.writeText(exportData);
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
            Step 1: Export Data
          </CardTitle>
          <CardDescription>
            Export all data from this deployment (customers, quotes, job sheets, etc.)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button 
            onClick={handleExport} 
            disabled={loading}
            className="w-full"
            size="lg"
          >
            <Database className="w-4 h-4 mr-2" />
            {loading ? 'Exporting...' : 'Export All Data'}
          </Button>

          {exportResult && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="font-semibold mb-2">Export Successful!</div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {Object.entries(exportResult).map(([collection, count]) => (
                    <div key={collection}>
                      <span className="font-medium">{collection}:</span> {count}
                    </div>
                  ))}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {exportData && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Button onClick={handleCopyExport} variant="outline" className="flex-1">
                  Copy to Clipboard
                </Button>
                <Button onClick={handleDownloadExport} variant="outline" className="flex-1">
                  Download JSON File
                </Button>
              </div>
              
              <Textarea
                value={exportData}
                readOnly
                rows={8}
                className="font-mono text-xs"
                placeholder="Export data will appear here..."
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Import Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Upload className="w-5 h-5 mr-2" />
            Step 2: Import Data
          </CardTitle>
          <CardDescription>
            Paste the exported JSON data and click Import
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={importData}
            onChange={(e) => setImportData(e.target.value)}
            rows={10}
            className="font-mono text-xs"
            placeholder="Paste the exported JSON data here..."
          />

          <Button 
            onClick={handleImport} 
            disabled={loading || !importData}
            className="w-full bg-green-600 hover:bg-green-700"
            size="lg"
          >
            <Upload className="w-4 h-4 mr-2" />
            {loading ? 'Importing...' : 'Import Data'}
          </Button>

          {importResult && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="font-semibold mb-2">Import Successful!</div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {Object.entries(importResult).map(([collection, count]) => (
                    <div key={collection}>
                      <span className="font-medium">{collection}:</span> {count}
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
          <CardTitle className="text-lg">Migration Instructions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            <strong>Exporting from quotetojob.preview:</strong>
            <ol className="list-decimal ml-5 mt-1 space-y-1">
              <li>Go to: https://quote-pdf-breaks.preview.emergentagent.com/data-migration</li>
              <li>Click "Export All Data"</li>
              <li>Click "Copy to Clipboard" or "Download JSON File"</li>
            </ol>
          </div>
          <div className="mt-4">
            <strong>Importing to pressbrake-quotes:</strong>
            <ol className="list-decimal ml-5 mt-1 space-y-1">
              <li>Go to: https://pressbrake-quotes.emergent.host/data-migration</li>
              <li>Paste the JSON data in the Import section</li>
              <li>Click "Import Data"</li>
              <li>Wait for confirmation</li>
            </ol>
          </div>
          <div className="mt-4 p-3 bg-yellow-100 rounded">
            <strong>⚠️ Important:</strong> Make sure users are initialized on pressbrake-quotes first by visiting:
            <code className="block mt-1 bg-white p-2 rounded">
              https://pressbrake-quotes.emergent.host/api/seed/reset-users
            </code>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DataMigration;
