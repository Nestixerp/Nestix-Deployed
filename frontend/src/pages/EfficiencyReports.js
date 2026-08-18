import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  DollarSign, 
  Activity,
  Calendar,
  Filter,
  Edit
} from 'lucide-react';

import API_BACKEND from '../lib/backendUrl';
const BACKEND_URL = API_BACKEND;

const EfficiencyReports = () => {
  const [loading, setLoading] = useState(true);
  const [dashboardMetrics, setDashboardMetrics] = useState(null);
  const [recentJobs, setRecentJobs] = useState([]);
  const [processSummary, setProcessSummary] = useState([]);
  const [customerSummary, setCustomerSummary] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState('month');
  const [selectedView, setSelectedView] = useState('overview');
  const [editingJob, setEditingJob] = useState(null);
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  useEffect(() => {
    fetchEfficiencyData();
  }, [selectedPeriod]);

  const fetchEfficiencyData = async () => {
    try {
      setLoading(true);
      
      // Get token from currentUser in localStorage
      const currentUserStr = localStorage.getItem('currentUser');
      if (!currentUserStr) {
        console.error('No user logged in');
        setLoading(false);
        return;
      }
      
      const currentUser = JSON.parse(currentUserStr);
      const token = currentUser.token;
      
      if (!token) {
        console.error('No token found in user data');
        setLoading(false);
        return;
      }
      
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };

      // Fetch dashboard metrics
      const metricsRes = await fetch(`${BACKEND_URL}/api/efficiency/dashboard-metrics`, {
        headers
      });
      const metricsData = await metricsRes.json();
      console.log('Dashboard metrics received:', metricsData);
      setDashboardMetrics(metricsData);

      // Fetch recent jobs
      const recentRes = await fetch(`${BACKEND_URL}/api/efficiency/recent-jobs?limit=100`, {
        headers
      });
      const recentData = await recentRes.json();
      console.log('Recent jobs received:', recentData);
      setRecentJobs(recentData.recent_jobs || []);

      // Fetch process breakdown
      const processRes = await fetch(`${BACKEND_URL}/api/efficiency/by-process?period=${selectedPeriod}`, {
        headers
      });
      const processData = await processRes.json();
      console.log('Process summary received:', processData);
      setProcessSummary(processData.process_breakdown || []);

      // Fetch customer breakdown
      const customerRes = await fetch(`${BACKEND_URL}/api/efficiency/by-customer?period=${selectedPeriod}`, {
        headers
      });
      const customerData = await customerRes.json();
      console.log('Customer summary received:', customerData);
      setCustomerSummary(customerData.customer_breakdown || []);

    } catch (error) {
      console.error('Error fetching efficiency data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD'
    }).format(value || 0);
  };

  const formatHours = (hours) => {
    return `${(hours || 0).toFixed(1)}h`;
  };

  const formatPercent = (percent) => {
    return `${(percent || 0).toFixed(1)}%`;
  };

  const getEfficiencyColor = (percent) => {
    if (percent >= 100) return 'text-green-600';
    if (percent >= 80) return 'text-blue-600';
    if (percent >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getMoneyImpactColor = (impact) => {
    if (impact > 0) return 'text-green-600';
    if (impact < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  const handleEditJob = (job) => {
    setEditingJob(job);
    // Set default times based on current data or estimated
    const now = new Date();
    const estimatedMs = (job.estimated_hours || 0) * 60 * 60 * 1000;
    
    // Default start time: 2 hours ago
    const defaultStart = new Date(now.getTime() - estimatedMs - (2 * 60 * 60 * 1000));
    // Default end time: estimated duration after start
    const defaultEnd = new Date(defaultStart.getTime() + estimatedMs);
    
    setEditStartTime(defaultStart.toISOString().slice(0, 16));
    setEditEndTime(defaultEnd.toISOString().slice(0, 16));
    setEditDialogOpen(true);
  };

  const handleSaveEditedTimes = async () => {
    if (!editingJob) return;
    
    try {
      const currentUserStr = localStorage.getItem('currentUser');
      const currentUser = JSON.parse(currentUserStr);
      const token = currentUser.token;
      
      const response = await fetch(`${BACKEND_URL}/api/job-sheets/${editingJob.job_sheet_id}/record-time`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          started_at: new Date(editStartTime).toISOString(),
          completed_at: new Date(editEndTime).toISOString()
        })
      });
      
      if (response.ok) {
        alert('✅ Job times updated successfully!');
        setEditDialogOpen(false);
        setEditingJob(null);
        // Refresh data
        fetchEfficiencyData();
      } else {
        const error = await response.json();
        alert(`❌ Error: ${error.detail || 'Failed to update times'}`);
      }
    } catch (error) {
      console.error('Error updating times:', error);
      alert('❌ Error updating job times');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading efficiency data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Job Efficiency Reports</h1>
          <p className="text-gray-600 mt-1">Track estimated vs. actual hours and financial impact</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={selectedPeriod === 'week' ? 'default' : 'outline'}
            onClick={() => setSelectedPeriod('week')}
          >
            <Calendar className="h-4 w-4 mr-2" />
            This Week
          </Button>
          <Button
            variant={selectedPeriod === 'month' ? 'default' : 'outline'}
            onClick={() => setSelectedPeriod('month')}
          >
            <Calendar className="h-4 w-4 mr-2" />
            This Month
          </Button>
        </div>
      </div>

      {/* Dashboard Metrics Cards */}
      {dashboardMetrics && dashboardMetrics.this_week && dashboardMetrics.this_month && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* This Week - Jobs Completed */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                This Week - Jobs
              </CardTitle>
              <Activity className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboardMetrics?.this_week?.jobs_completed || 0}</div>
              <p className="text-xs text-gray-500 mt-1">Completed jobs</p>
            </CardContent>
          </Card>

          {/* This Week - Hours Saved */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                This Week - Hours
              </CardTitle>
              <Clock className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${getMoneyImpactColor(dashboardMetrics?.this_week?.hours_saved || 0)}`}>
                {(dashboardMetrics?.this_week?.hours_saved || 0) > 0 ? '+' : ''}
                {formatHours(dashboardMetrics?.this_week?.hours_saved || 0)}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Efficiency: {formatPercent(dashboardMetrics?.this_week?.efficiency_percent || 0)}
              </p>
            </CardContent>
          </Card>

          {/* This Month - Jobs Completed */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                This Month - Jobs
              </CardTitle>
              <Activity className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboardMetrics?.this_month?.jobs_completed || 0}</div>
              <p className="text-xs text-gray-500 mt-1">Completed jobs</p>
            </CardContent>
          </Card>

          {/* This Month - Money Impact */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                This Month - Impact
              </CardTitle>
              <DollarSign className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${getMoneyImpactColor(dashboardMetrics?.this_month?.money_impact || 0)}`}>
                {(dashboardMetrics?.this_month?.money_impact || 0) > 0 ? '+' : ''}
                {formatCurrency(dashboardMetrics?.this_month?.money_impact || 0)}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {formatHours(dashboardMetrics?.this_month?.hours_saved || 0)} saved
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* View Selector */}
      <div className="flex gap-2 border-b border-gray-200">
        <Button
          variant={selectedView === 'overview' ? 'default' : 'ghost'}
          onClick={() => setSelectedView('overview')}
          className="rounded-b-none"
        >
          Overview
        </Button>
        <Button
          variant={selectedView === 'process' ? 'default' : 'ghost'}
          onClick={() => setSelectedView('process')}
          className="rounded-b-none"
        >
          By Process
        </Button>
        <Button
          variant={selectedView === 'customer' ? 'default' : 'ghost'}
          onClick={() => setSelectedView('customer')}
          className="rounded-b-none"
        >
          By Customer
        </Button>
        <Button
          variant={selectedView === 'recent' ? 'default' : 'ghost'}
          onClick={() => setSelectedView('recent')}
          className="rounded-b-none"
        >
          Recent Jobs
        </Button>
      </div>

      {/* Overview View */}
      {selectedView === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Process Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Top Processes - {selectedPeriod === 'week' ? 'This Week' : 'This Month'}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {processSummary.slice(0, 5).map((process, index) => (
                  <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium">{process.process_name}</p>
                      <p className="text-sm text-gray-600">
                        {process.total_jobs} jobs • {formatHours(process.total_hours_saved)} saved
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold ${getMoneyImpactColor(process.money_impact)}`}>
                        {process.money_impact > 0 ? '+' : ''}
                        {formatCurrency(process.money_impact)}
                      </p>
                      <p className={`text-sm ${getEfficiencyColor(process.efficiency_percent)}`}>
                        {formatPercent(process.efficiency_percent)}
                      </p>
                    </div>
                  </div>
                ))}
                {processSummary.length === 0 && (
                  <p className="text-center text-gray-500 py-4">No data available for this period</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Customer Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Top Customers - {selectedPeriod === 'week' ? 'This Week' : 'This Month'}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {customerSummary.slice(0, 5).map((customer, index) => (
                  <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium">{customer.customer_name}</p>
                      <p className="text-sm text-gray-600">
                        {customer.total_jobs} jobs • {formatHours(customer.total_hours_saved)} saved
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold ${getMoneyImpactColor(customer.money_impact)}`}>
                        {customer.money_impact > 0 ? '+' : ''}
                        {formatCurrency(customer.money_impact)}
                      </p>
                      <p className={`text-sm ${getEfficiencyColor(customer.efficiency_percent)}`}>
                        {formatPercent(customer.efficiency_percent)}
                      </p>
                    </div>
                  </div>
                ))}
                {customerSummary.length === 0 && (
                  <p className="text-center text-gray-500 py-4">No data available for this period</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Process View */}
      {selectedView === 'process' && (
        <Card>
          <CardHeader>
            <CardTitle>Efficiency by Process - {selectedPeriod === 'week' ? 'This Week' : 'This Month'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3">Process</th>
                    <th className="text-center p-3">Jobs</th>
                    <th className="text-right p-3">Estimated</th>
                    <th className="text-right p-3">Actual</th>
                    <th className="text-right p-3">Hours Saved</th>
                    <th className="text-right p-3">Efficiency</th>
                    <th className="text-right p-3">Money Impact</th>
                  </tr>
                </thead>
                <tbody>
                  {processSummary.map((process, index) => (
                    <tr key={index} className="border-b hover:bg-gray-50">
                      <td className="p-3 font-medium">{process.process_name}</td>
                      <td className="p-3 text-center">{process.total_jobs}</td>
                      <td className="p-3 text-right">{formatHours(process.total_estimated_hours)}</td>
                      <td className="p-3 text-right">{formatHours(process.total_actual_hours)}</td>
                      <td className={`p-3 text-right font-medium ${getMoneyImpactColor(process.total_hours_saved)}`}>
                        {process.total_hours_saved > 0 ? '+' : ''}
                        {formatHours(process.total_hours_saved)}
                      </td>
                      <td className={`p-3 text-right font-medium ${getEfficiencyColor(process.efficiency_percent)}`}>
                        {formatPercent(process.efficiency_percent)}
                      </td>
                      <td className={`p-3 text-right font-bold ${getMoneyImpactColor(process.money_impact)}`}>
                        {process.money_impact > 0 ? '+' : ''}
                        {formatCurrency(process.money_impact)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {processSummary.length === 0 && (
                <p className="text-center text-gray-500 py-8">No data available for this period</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Customer View */}
      {selectedView === 'customer' && (
        <Card>
          <CardHeader>
            <CardTitle>Efficiency by Customer - {selectedPeriod === 'week' ? 'This Week' : 'This Month'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3">Customer</th>
                    <th className="text-center p-3">Jobs</th>
                    <th className="text-right p-3">Estimated</th>
                    <th className="text-right p-3">Actual</th>
                    <th className="text-right p-3">Hours Saved</th>
                    <th className="text-right p-3">Efficiency</th>
                    <th className="text-right p-3">Money Impact</th>
                  </tr>
                </thead>
                <tbody>
                  {customerSummary.map((customer, index) => (
                    <tr key={index} className="border-b hover:bg-gray-50">
                      <td className="p-3 font-medium">{customer.customer_name}</td>
                      <td className="p-3 text-center">{customer.total_jobs}</td>
                      <td className="p-3 text-right">{formatHours(customer.total_estimated_hours)}</td>
                      <td className="p-3 text-right">{formatHours(customer.total_actual_hours)}</td>
                      <td className={`p-3 text-right font-medium ${getMoneyImpactColor(customer.total_hours_saved)}`}>
                        {customer.total_hours_saved > 0 ? '+' : ''}
                        {formatHours(customer.total_hours_saved)}
                      </td>
                      <td className={`p-3 text-right font-medium ${getEfficiencyColor(customer.efficiency_percent)}`}>
                        {formatPercent(customer.efficiency_percent)}
                      </td>
                      <td className={`p-3 text-right font-bold ${getMoneyImpactColor(customer.money_impact)}`}>
                        {customer.money_impact > 0 ? '+' : ''}
                        {formatCurrency(customer.money_impact)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {customerSummary.length === 0 && (
                <p className="text-center text-gray-500 py-8">No data available for this period</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Jobs View */}
      {selectedView === 'recent' && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Recent Completed Jobs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3">Job #</th>
                      <th className="text-left p-3">Customer</th>
                      <th className="text-left p-3">Part</th>
                      <th className="text-left p-3">Process</th>
                      <th className="text-right p-3">Estimated</th>
                      <th className="text-right p-3">Actual</th>
                      <th className="text-right p-3">Saved</th>
                      <th className="text-right p-3">Efficiency</th>
                      <th className="text-right p-3">Impact</th>
                      <th className="text-center p-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentJobs.map((job, index) => (
                      <tr 
                        key={index} 
                        className={`border-b ${
                          job.needs_time_entry 
                            ? 'bg-yellow-50 hover:bg-yellow-100' 
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        <td className="p-3 font-medium">
                          {job.job_sheet_number}
                          {job.needs_time_entry && (
                            <span className="ml-2 text-xs bg-yellow-200 text-yellow-800 px-2 py-1 rounded">
                              ⚠️ No Times
                            </span>
                          )}
                        </td>
                        <td className="p-3">{job.customer_name}</td>
                        <td className="p-3 text-sm">{job.part_description}</td>
                        <td className="p-3 text-sm">{job.process_name}</td>
                        <td className="p-3 text-right">
                          {job.needs_time_entry ? (
                            <span className="text-yellow-600">-</span>
                          ) : (
                            formatHours(job.estimated_hours)
                          )}
                        </td>
                        <td className="p-3 text-right">
                          {job.needs_time_entry ? (
                            <span className="text-yellow-600 font-bold">ADD TIME</span>
                          ) : (
                            formatHours(job.actual_hours)
                          )}
                        </td>
                        <td className={`p-3 text-right font-medium ${
                          job.needs_time_entry ? 'text-yellow-600' : getMoneyImpactColor(job.hours_saved)
                        }`}>
                          {job.needs_time_entry ? '-' : (
                            <>
                              {job.hours_saved > 0 ? '+' : ''}
                              {formatHours(job.hours_saved)}
                            </>
                          )}
                        </td>
                        <td className={`p-3 text-right ${
                          job.needs_time_entry ? 'text-yellow-600' : getEfficiencyColor(job.efficiency_percent)
                        }`}>
                          {job.needs_time_entry ? '-' : formatPercent(job.efficiency_percent)}
                        </td>
                        <td className={`p-3 text-right font-bold ${
                          job.needs_time_entry ? 'text-yellow-600' : getMoneyImpactColor(job.money_impact)
                        }`}>
                          {job.needs_time_entry ? '-' : (
                            <>
                              {job.money_impact > 0 ? '+' : ''}
                              {formatCurrency(job.money_impact)}
                            </>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <Button
                            size="sm"
                            variant={job.needs_time_entry ? "default" : "outline"}
                            onClick={() => handleEditJob(job)}
                            className={`h-8 ${
                              job.needs_time_entry ? 'bg-yellow-500 hover:bg-yellow-600 text-white' : ''
                            }`}
                            title={job.needs_time_entry ? 'Add Times (Required)' : 'Edit Times'}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {recentJobs.length === 0 && (
                  <p className="text-center text-gray-500 py-8">No recent completed jobs</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Edit Time Dialog */}
          {editDialogOpen && editingJob && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <Card className="w-full max-w-md">
                <CardHeader>
                  <CardTitle>Edit Job Times - {editingJob.job_sheet_number}</CardTitle>
                  <p className="text-sm text-gray-600 mt-2">
                    {editingJob.customer_name} - {editingJob.part_description}
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Start Time</label>
                    <input
                      type="datetime-local"
                      value={editStartTime}
                      onChange={(e) => setEditStartTime(e.target.value)}
                      className="w-full border rounded p-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">End Time</label>
                    <input
                      type="datetime-local"
                      value={editEndTime}
                      onChange={(e) => setEditEndTime(e.target.value)}
                      className="w-full border rounded p-2"
                    />
                  </div>
                  <div className="bg-blue-50 p-3 rounded">
                    <p className="text-sm text-blue-900">
                      <strong>Estimated:</strong> {formatHours(editingJob.estimated_hours)}
                    </p>
                    <p className="text-sm text-blue-900 mt-1">
                      <strong>Current Actual:</strong> {formatHours(editingJob.actual_hours)}
                    </p>
                  </div>
                  <div className="flex gap-2 pt-4">
                    <Button onClick={handleSaveEditedTimes} className="flex-1">
                      Save Changes
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditDialogOpen(false);
                        setEditingJob(null);
                      }}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default EfficiencyReports;
