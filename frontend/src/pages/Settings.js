import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select } from '../components/ui/select';
import { useToast } from '../hooks/use-toast';
import api from '../services/api';
import { Building2, Globe, DollarSign, FileText, CreditCard, Mail, Image, Save, Upload, X, Wrench, AlertTriangle, CheckCircle } from 'lucide-react';

const Settings = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fixingPackingSlips, setFixingPackingSlips] = useState(false);
  const [packingSlipFixPreview, setPackingSlipFixPreview] = useState(null);
  const [dbHealth, setDbHealth] = useState(null);
  const [orphanRecords, setOrphanRecords] = useState(null);
  const [dataIntegrity, setDataIntegrity] = useState(null);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [loadingOrphans, setLoadingOrphans] = useState(false);
  const [loadingIntegrity, setLoadingIntegrity] = useState(false);
  const [settings, setSettings] = useState({
    company_name: '',
    company_abn: '',
    company_email: '',
    company_phone: '',
    company_website: '',
    company_tagline: '',
    company_logo_url: '',
    street_address: '',
    suburb: '',
    state: 'VIC',
    postcode: '',
    country: 'Australia',
    timezone: 'Australia/Melbourne',
    currency: 'AUD',
    currency_symbol: '$',
    date_format: 'DD/MM/YYYY',
    time_format: '24',
    gst_rate: 10.0,
    default_payment_terms: 'Net 30',
    quote_validity_days: 30,
    default_markup_percentage: 0.0,
    bank_name: '',
    bank_account_name: '',
    bank_bsb: '',
    bank_account_number: '',
    email_signature: '',
    email_footer: '',
    show_logo_on_quotes: true,
    show_logo_on_invoices: true,
    show_logo_on_job_sheets: true,
  });

  const [timezones, setTimezones] = useState([]);

  useEffect(() => {
    fetchSettings();
    fetchTimezones();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await api.get('/settings/');
      setSettings(response.data);
    } catch (error) {
      console.error('Error fetching settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to load settings',
        variant: 'destructive',
      });
    }
  };

  const fetchTimezones = async () => {
    try {
      const response = await api.get('/settings/timezones');
      setTimezones(response.data.timezones);
    } catch (error) {
      console.error('Error fetching timezones:', error);
    }
  };

  const handleInputChange = (field, value) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveSettings = async () => {
    setLoading(true);
    try {
      await api.post('/settings/', settings);
      window.dispatchEvent(new Event('company-settings-updated'));
      toast({
        title: 'Success',
        description: 'Settings saved successfully',
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to save settings',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
    if (!validTypes.includes(file.type)) {
      toast({
        title: 'Error',
        description: 'Please upload a valid image file (PNG, JPG, or SVG)',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'Error',
        description: 'File size must be less than 5MB',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await api.post('/settings/upload-logo', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setSettings(prev => ({ ...prev, company_logo_url: response.data.logo_url }));
      window.dispatchEvent(new Event('company-settings-updated'));
      toast({
        title: 'Success',
        description: 'Logo uploaded successfully',
      });
    } catch (error) {
      console.error('Error uploading logo:', error);
      toast({
        title: 'Error',
        description: 'Failed to upload logo',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteLogo = async () => {
    try {
      await api.delete('/settings/logo');
      setSettings(prev => ({ ...prev, company_logo_url: '' }));
      window.dispatchEvent(new Event('company-settings-updated'));
      toast({
        title: 'Success',
        description: 'Logo deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting logo:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete logo',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Company Settings</h1>
          <p className="text-gray-500 mt-1">Configure your company information and system preferences</p>
        </div>
        <Button onClick={handleSaveSettings} disabled={loading} className="bg-blue-600 hover:bg-blue-700">
          <Save className="w-4 h-4 mr-2" />
          {loading ? 'Saving...' : 'Save All Settings'}
        </Button>
      </div>

      {/* Company Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Building2 className="w-5 h-5 mr-2" />
            Company Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Logo Upload */}
          <div>
            <Label>Company Logo</Label>
            <div className="mt-2 flex items-center gap-4">
              {settings.company_logo_url ? (
                <div className="relative">
                  <img
                    src={settings.company_logo_url}
                    alt="Company Logo"
                    className="h-24 w-auto object-contain border border-gray-300 rounded p-2"
                  />
                  <button
                    onClick={handleDeleteLogo}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="h-24 w-24 border-2 border-dashed border-gray-300 rounded flex items-center justify-center">
                  <Image className="w-8 h-8 text-gray-400" />
                </div>
              )}
              <div>
                <input
                  type="file"
                  id="logo-upload"
                  accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
                <label htmlFor="logo-upload">
                  <Button type="button" onClick={() => document.getElementById('logo-upload').click()} disabled={uploading}>
                    <Upload className="w-4 h-4 mr-2" />
                    {uploading ? 'Uploading...' : 'Upload Logo'}
                  </Button>
                </label>
                <p className="text-sm text-gray-500 mt-1">PNG, JPG, or SVG (max 5MB)</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Company Name *</Label>
              <Input
                value={settings.company_name}
                onChange={(e) => handleInputChange('company_name', e.target.value)}
                placeholder="Your Company Pty Ltd"
              />
            </div>
            <div>
              <Label>ABN</Label>
              <Input
                value={settings.company_abn}
                onChange={(e) => handleInputChange('company_abn', e.target.value)}
                placeholder="12 345 678 901"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={settings.company_email}
                onChange={(e) => handleInputChange('company_email', e.target.value)}
                placeholder="info@company.com"
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                value={settings.company_phone}
                onChange={(e) => handleInputChange('company_phone', e.target.value)}
                placeholder="(03) 1234 5678"
              />
            </div>
            <div>
              <Label>Website</Label>
              <Input
                value={settings.company_website}
                onChange={(e) => handleInputChange('company_website', e.target.value)}
                placeholder="www.company.com"
              />
            </div>
          </div>

          <div>
            <Label>Company Tagline</Label>
            <Input
              value={settings.company_tagline}
              onChange={(e) => handleInputChange('company_tagline', e.target.value)}
              placeholder="Your trusted manufacturing partner"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Street Address</Label>
              <Input
                value={settings.street_address}
                onChange={(e) => handleInputChange('street_address', e.target.value)}
                placeholder="123 Manufacturing Drive"
              />
            </div>
            <div>
              <Label>Suburb</Label>
              <Input
                value={settings.suburb}
                onChange={(e) => handleInputChange('suburb', e.target.value)}
                placeholder="Melbourne"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>State</Label>
                <select
                  value={settings.state}
                  onChange={(e) => handleInputChange('state', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="VIC">VIC</option>
                  <option value="NSW">NSW</option>
                  <option value="QLD">QLD</option>
                  <option value="SA">SA</option>
                  <option value="WA">WA</option>
                  <option value="TAS">TAS</option>
                  <option value="NT">NT</option>
                  <option value="ACT">ACT</option>
                </select>
              </div>
              <div>
                <Label>Postcode</Label>
                <Input
                  value={settings.postcode}
                  onChange={(e) => handleInputChange('postcode', e.target.value)}
                  placeholder="3000"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Regional Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Globe className="w-5 h-5 mr-2" />
            Regional Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Timezone</Label>
              <select
                value={settings.timezone}
                onChange={(e) => handleInputChange('timezone', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                {timezones.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Currency</Label>
              <div className="flex gap-2">
                <Input
                  value={settings.currency}
                  onChange={(e) => handleInputChange('currency', e.target.value)}
                  placeholder="AUD"
                  className="w-20"
                />
                <Input
                  value={settings.currency_symbol}
                  onChange={(e) => handleInputChange('currency_symbol', e.target.value)}
                  placeholder="$"
                  className="w-16"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Date Format</Label>
              <select
                value={settings.date_format}
                onChange={(e) => handleInputChange('date_format', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="DD/MM/YYYY">DD/MM/YYYY (Australian)</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY (US)</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD (ISO)</option>
              </select>
            </div>
            <div>
              <Label>Time Format</Label>
              <select
                value={settings.time_format}
                onChange={(e) => handleInputChange('time_format', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="24">24-hour (14:30)</option>
                <option value="12">12-hour (2:30 PM)</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Business Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <DollarSign className="w-5 h-5 mr-2" />
            Business Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>GST Rate (%)</Label>
              <Input
                type="number"
                step="0.1"
                value={settings.gst_rate}
                onChange={(e) => handleInputChange('gst_rate', parseFloat(e.target.value))}
              />
            </div>
            <div>
              <Label>Default Payment Terms</Label>
              <Input
                value={settings.default_payment_terms}
                onChange={(e) => handleInputChange('default_payment_terms', e.target.value)}
                placeholder="Net 30"
              />
            </div>
            <div>
              <Label>Quote Validity (Days)</Label>
              <Input
                type="number"
                value={settings.quote_validity_days}
                onChange={(e) => handleInputChange('quote_validity_days', parseInt(e.target.value))}
              />
            </div>
          </div>

          <div>
            <Label>Default Markup (%)</Label>
            <Input
              type="number"
              step="0.1"
              value={settings.default_markup_percentage}
              onChange={(e) => handleInputChange('default_markup_percentage', parseFloat(e.target.value))}
            />
          </div>
        </CardContent>
      </Card>

      {/* Bank Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <CreditCard className="w-5 h-5 mr-2" />
            Bank Details (for Invoices)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Bank Name</Label>
              <Input
                value={settings.bank_name}
                onChange={(e) => handleInputChange('bank_name', e.target.value)}
                placeholder="Commonwealth Bank"
              />
            </div>
            <div>
              <Label>Account Name</Label>
              <Input
                value={settings.bank_account_name}
                onChange={(e) => handleInputChange('bank_account_name', e.target.value)}
                placeholder="Your Company Pty Ltd"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>BSB</Label>
              <Input
                value={settings.bank_bsb}
                onChange={(e) => handleInputChange('bank_bsb', e.target.value)}
                placeholder="123-456"
              />
            </div>
            <div>
              <Label>Account Number</Label>
              <Input
                value={settings.bank_account_number}
                onChange={(e) => handleInputChange('bank_account_number', e.target.value)}
                placeholder="12345678"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Email Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Mail className="w-5 h-5 mr-2" />
            Email Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Email Signature</Label>
            <Textarea
              value={settings.email_signature}
              onChange={(e) => handleInputChange('email_signature', e.target.value)}
              placeholder="Best regards,&#10;Your Name&#10;Your Company Pty Ltd"
              rows={4}
            />
          </div>

          <div>
            <Label>Email Footer</Label>
            <Textarea
              value={settings.email_footer}
              onChange={(e) => handleInputChange('email_footer', e.target.value)}
              placeholder="This email and any attachments are confidential..."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Display Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <FileText className="w-5 h-5 mr-2" />
            Display Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="show_logo_quotes"
              checked={settings.show_logo_on_quotes}
              onChange={(e) => handleInputChange('show_logo_on_quotes', e.target.checked)}
              className="w-4 h-4"
            />
            <Label htmlFor="show_logo_quotes" className="cursor-pointer">Show logo on Quotes</Label>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="show_logo_invoices"
              checked={settings.show_logo_on_invoices}
              onChange={(e) => handleInputChange('show_logo_on_invoices', e.target.checked)}
              className="w-4 h-4"
            />
            <Label htmlFor="show_logo_invoices" className="cursor-pointer">Show logo on Invoices</Label>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="show_logo_job_sheets"
              checked={settings.show_logo_on_job_sheets}
              onChange={(e) => handleInputChange('show_logo_on_job_sheets', e.target.checked)}
              className="w-4 h-4"
            />
            <Label htmlFor="show_logo_job_sheets" className="cursor-pointer">Show logo on Job Sheets</Label>
          </div>
        </CardContent>
      </Card>

      {/* Admin Tools - Data Maintenance */}
      <Card className="border-amber-300 bg-amber-50">
        <CardHeader>
          <CardTitle className="flex items-center text-amber-900">
            <Wrench className="w-5 h-5 mr-2" />
            Admin Tools - Data Maintenance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Packing Slip Fix Tool */}
          <div className="bg-white rounded-lg p-4 border border-amber-200">
            <h4 className="font-semibold text-amber-900 mb-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Fix Invoiced Packing Slips
            </h4>
            <p className="text-sm text-gray-600 mb-3">
              This tool scans invoice items to find packing slips that were invoiced but not properly marked. 
              Running this will update the database to correctly flag these packing slips, removing them from 
              the &quot;Available Jobs&quot; list in the Invoices module.
            </p>
            
            {packingSlipFixPreview && (
              <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-3">
                <div className="text-sm">
                  <div className="font-semibold text-blue-900 mb-2">Database Status:</div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="bg-white rounded p-2 text-center">
                      <div className="font-bold text-lg">{packingSlipFixPreview.database_stats.total_packing_slips}</div>
                      <div className="text-gray-600">Total Packing Slips</div>
                    </div>
                    <div className="bg-white rounded p-2 text-center">
                      <div className="font-bold text-lg text-green-600">{packingSlipFixPreview.database_stats.currently_marked_invoiced}</div>
                      <div className="text-gray-600">Marked Invoiced</div>
                    </div>
                    <div className="bg-white rounded p-2 text-center">
                      <div className="font-bold text-lg text-amber-600">{packingSlipFixPreview.database_stats.completed_but_not_invoiced}</div>
                      <div className="text-gray-600">Not Marked</div>
                    </div>
                  </div>
                  
                  {packingSlipFixPreview.count_to_fix > 0 ? (
                    <div className="mt-3">
                      <div className="font-semibold text-amber-900 mb-1">
                        Found {packingSlipFixPreview.count_to_fix} packing slip(s) that need fixing:
                      </div>
                      <div className="max-h-32 overflow-y-auto bg-white rounded p-2 text-xs">
                        {packingSlipFixPreview.packing_slips_to_fix.map((ps, idx) => (
                          <div key={idx} className="flex justify-between py-1 border-b border-gray-100 last:border-0">
                            <span className="font-mono">{ps.packing_slip_number}</span>
                            <span className="text-gray-500">{ps.customer_name}</span>
                            <span className="text-blue-600">→ Invoice {ps.invoice_number}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 text-green-700 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      All packing slips are correctly marked!
                    </div>
                  )}
                </div>
              </div>
            )}
            
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={async () => {
                  try {
                    setFixingPackingSlips(true);
                    const response = await api.get('/settings/admin/fix-invoiced-packing-slips/preview');
                    setPackingSlipFixPreview(response.data);
                    toast({
                      title: 'Preview Ready',
                      description: `Found ${response.data.count_to_fix} packing slips that need fixing`,
                    });
                  } catch (error) {
                    toast({
                      title: 'Error',
                      description: 'Failed to preview: ' + (error.response?.data?.detail || error.message),
                      variant: 'destructive',
                    });
                  } finally {
                    setFixingPackingSlips(false);
                  }
                }}
                disabled={fixingPackingSlips}
              >
                {fixingPackingSlips ? 'Scanning...' : 'Preview Changes'}
              </Button>
              
              {packingSlipFixPreview && packingSlipFixPreview.count_to_fix > 0 && (
                <Button 
                  className="bg-amber-600 hover:bg-amber-700"
                  onClick={async () => {
                    if (!window.confirm(`Are you sure you want to mark ${packingSlipFixPreview.count_to_fix} packing slip(s) as invoiced?`)) {
                      return;
                    }
                    try {
                      setFixingPackingSlips(true);
                      const response = await api.post('/settings/admin/fix-invoiced-packing-slips/execute');
                      toast({
                        title: 'Success!',
                        description: `Fixed ${response.data.updated_count} packing slip(s)`,
                      });
                      setPackingSlipFixPreview(null);
                      // Re-run preview to show updated state
                      const preview = await api.get('/settings/admin/fix-invoiced-packing-slips/preview');
                      setPackingSlipFixPreview(preview.data);
                    } catch (error) {
                      toast({
                        title: 'Error',
                        description: 'Failed to fix: ' + (error.response?.data?.detail || error.message),
                        variant: 'destructive',
                      });
                    } finally {
                      setFixingPackingSlips(false);
                    }
                  }}
                  disabled={fixingPackingSlips}
                >
                  {fixingPackingSlips ? 'Fixing...' : `Fix ${packingSlipFixPreview.count_to_fix} Packing Slip(s)`}
                </Button>
              )}
            </div>
          </div>

          {/* Database Health Check Tool */}
          <div className="bg-white rounded-lg p-4 border border-amber-200 mt-4">
            <h4 className="font-semibold text-amber-900 mb-2 flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              Database Health Check
            </h4>
            <p className="text-sm text-gray-600 mb-3">
              View database statistics and health indicators across all collections.
            </p>
            
            {dbHealth && (
              <div className="bg-green-50 border border-green-200 rounded p-3 mb-3">
                <div className="text-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-semibold text-green-900">Status:</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${dbHealth.health_score === 'Good' ? 'bg-green-200 text-green-800' : 'bg-yellow-200 text-yellow-800'}`}>
                      {dbHealth.health_score}
                    </span>
                    <span className="text-gray-600">({dbHealth.total_records.toLocaleString()} total records)</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    {Object.entries(dbHealth.collections).map(([name, count]) => (
                      <div key={name} className="bg-white rounded p-2 text-center">
                        <div className="font-bold text-lg">{count}</div>
                        <div className="text-gray-600 capitalize">{name.replace('_', ' ')}</div>
                      </div>
                    ))}
                  </div>
                  {dbHealth.status_breakdowns && (
                    <div className="mt-3 pt-3 border-t border-green-200">
                      <div className="font-semibold text-green-900 mb-2">Status Breakdowns:</div>
                      <div className="grid grid-cols-3 gap-3 text-xs">
                        <div>
                          <div className="font-medium mb-1">Quotes</div>
                          {Object.entries(dbHealth.status_breakdowns.quotes || {}).map(([status, count]) => (
                            <div key={status} className="flex justify-between">
                              <span>{status}:</span>
                              <span className="font-medium">{count}</span>
                            </div>
                          ))}
                        </div>
                        <div>
                          <div className="font-medium mb-1">Job Sheets</div>
                          {Object.entries(dbHealth.status_breakdowns.job_sheets || {}).map(([status, count]) => (
                            <div key={status} className="flex justify-between">
                              <span>{status}:</span>
                              <span className="font-medium">{count}</span>
                            </div>
                          ))}
                        </div>
                        <div>
                          <div className="font-medium mb-1">Invoices</div>
                          {Object.entries(dbHealth.status_breakdowns.invoices || {}).map(([status, count]) => (
                            <div key={status} className="flex justify-between">
                              <span>{status}:</span>
                              <span className="font-medium">{count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            <Button 
              variant="outline" 
              onClick={async () => {
                try {
                  setLoadingHealth(true);
                  const response = await api.get('/settings/admin/database-health');
                  setDbHealth(response.data);
                  toast({ title: 'Health Check Complete', description: `Database has ${response.data.total_records} total records` });
                } catch (error) {
                  toast({ title: 'Error', description: 'Failed to check health: ' + (error.response?.data?.detail || error.message), variant: 'destructive' });
                } finally {
                  setLoadingHealth(false);
                }
              }}
              disabled={loadingHealth}
            >
              {loadingHealth ? 'Checking...' : 'Run Health Check'}
            </Button>
          </div>

          {/* Orphan Record Detection Tool */}
          <div className="bg-white rounded-lg p-4 border border-amber-200 mt-4">
            <h4 className="font-semibold text-amber-900 mb-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Orphan Record Detection
            </h4>
            <p className="text-sm text-gray-600 mb-3">
              Find records that reference non-existent parent records (e.g., job sheets without quotes).
            </p>
            
            {orphanRecords && (
              <div className={`border rounded p-3 mb-3 ${orphanRecords.total_orphan_count === 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="text-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-semibold">Status:</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${orphanRecords.total_orphan_count === 0 ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
                      {orphanRecords.status}
                    </span>
                  </div>
                  {orphanRecords.total_orphan_count > 0 && (
                    <div className="space-y-2 text-xs">
                      {orphanRecords.orphans.job_sheets_without_quotes.length > 0 && (
                        <div className="bg-white rounded p-2">
                          <div className="font-medium text-red-800 mb-1">Job Sheets Missing Quotes ({orphanRecords.orphans.job_sheets_without_quotes.length}):</div>
                          {orphanRecords.orphans.job_sheets_without_quotes.slice(0, 5).map((item, idx) => (
                            <div key={idx} className="text-gray-600">{item.job_sheet_number} → Missing: {item.missing_quote}</div>
                          ))}
                          {orphanRecords.orphans.job_sheets_without_quotes.length > 5 && <div className="text-gray-500">...and {orphanRecords.orphans.job_sheets_without_quotes.length - 5} more</div>}
                        </div>
                      )}
                      {orphanRecords.orphans.packing_slips_without_job_sheets.length > 0 && (
                        <div className="bg-white rounded p-2">
                          <div className="font-medium text-red-800 mb-1">Packing Slips Missing Job Sheets ({orphanRecords.orphans.packing_slips_without_job_sheets.length}):</div>
                          {orphanRecords.orphans.packing_slips_without_job_sheets.slice(0, 5).map((item, idx) => (
                            <div key={idx} className="text-gray-600">{item.packing_slip_number} → Missing: {item.missing_job_sheet}</div>
                          ))}
                          {orphanRecords.orphans.packing_slips_without_job_sheets.length > 5 && <div className="text-gray-500">...and {orphanRecords.orphans.packing_slips_without_job_sheets.length - 5} more</div>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
            
            <Button 
              variant="outline" 
              onClick={async () => {
                try {
                  setLoadingOrphans(true);
                  const response = await api.get('/settings/admin/orphan-records');
                  setOrphanRecords(response.data);
                  toast({ title: 'Scan Complete', description: response.data.status });
                } catch (error) {
                  toast({ title: 'Error', description: 'Failed to scan: ' + (error.response?.data?.detail || error.message), variant: 'destructive' });
                } finally {
                  setLoadingOrphans(false);
                }
              }}
              disabled={loadingOrphans}
            >
              {loadingOrphans ? 'Scanning...' : 'Scan for Orphans'}
            </Button>
          </div>

          {/* Data Integrity Check Tool */}
          <div className="bg-white rounded-lg p-4 border border-amber-200 mt-4">
            <h4 className="font-semibold text-amber-900 mb-2 flex items-center gap-2">
              <Wrench className="w-4 h-4" />
              Data Integrity Check
            </h4>
            <p className="text-sm text-gray-600 mb-3">
              Find records with missing required fields (customers without names, quotes without totals, etc.).
            </p>
            
            {dataIntegrity && (
              <div className={`border rounded p-3 mb-3 ${dataIntegrity.total_issue_count === 0 ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
                <div className="text-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-semibold">Status:</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${dataIntegrity.total_issue_count === 0 ? 'bg-green-200 text-green-800' : 'bg-yellow-200 text-yellow-800'}`}>
                      {dataIntegrity.status}
                    </span>
                  </div>
                  {dataIntegrity.total_issue_count > 0 && (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {Object.entries(dataIntegrity.issues).map(([key, items]) => (
                        items.length > 0 && (
                          <div key={key} className="bg-white rounded p-2">
                            <div className="font-medium text-yellow-800 mb-1 capitalize">{key.replace(/_/g, ' ')} ({items.length})</div>
                            {items.slice(0, 3).map((item, idx) => (
                              <div key={idx} className="text-gray-600 truncate">{JSON.stringify(item).slice(0, 50)}...</div>
                            ))}
                            {items.length > 3 && <div className="text-gray-500">...and {items.length - 3} more</div>}
                          </div>
                        )
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            
            <Button 
              variant="outline" 
              onClick={async () => {
                try {
                  setLoadingIntegrity(true);
                  const response = await api.get('/settings/admin/data-integrity');
                  setDataIntegrity(response.data);
                  toast({ title: 'Check Complete', description: response.data.status });
                } catch (error) {
                  toast({ title: 'Error', description: 'Failed to check: ' + (error.response?.data?.detail || error.message), variant: 'destructive' });
                } finally {
                  setLoadingIntegrity(false);
                }
              }}
              disabled={loadingIntegrity}
            >
              {loadingIntegrity ? 'Checking...' : 'Check Data Integrity'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Save Button (Bottom) */}
      <div className="flex justify-end">
        <Button onClick={handleSaveSettings} disabled={loading} className="bg-blue-600 hover:bg-blue-700">
          <Save className="w-4 h-4 mr-2" />
          {loading ? 'Saving...' : 'Save All Settings'}
        </Button>
      </div>
    </div>
  );
};

export default Settings;
