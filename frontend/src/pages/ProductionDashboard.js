import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Alert, AlertDescription } from '../components/ui/alert';
import { 
  Users, Clock, CheckCircle, AlertTriangle, TrendingUp, TrendingDown,
  Activity, Zap, Target, BarChart3
} from 'lucide-react';
import api from '../services/api';

const ProductionDashboard = () => {
  const [liveMetrics, setLiveMetrics] = useState(null);
  const [machineUtil, setMachineUtil] = useState(null);
  const [bottlenecks, setBottlenecks] = useState(null);
  const [dailySummary, setDailySummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAllData();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchAllData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchAllData = async () => {
    try {
      const [live, machine, bottleneck, daily] = await Promise.all([
        api.get('/production-dashboard/live-metrics'),
        api.get('/production-dashboard/machine-utilization'),
        api.get('/production-dashboard/bottlenecks'),
        api.get('/production-dashboard/daily-summary')
      ]);
      
      setLiveMetrics(live.data);
      setMachineUtil(machine.data);
      setBottlenecks(bottleneck.data);
      setDailySummary(daily.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center">Loading production dashboard...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Production Dashboard</h1>
          <p className="text-slate-600">Real-time production monitoring</p>
        </div>
        <div className="text-right text-sm text-slate-500">
          Last updated: {new Date().toLocaleTimeString()}
        </div>
      </div>

      {/* Top Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Active Operators */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Operators</CardTitle>
            <Users className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">
              {liveMetrics?.active_operators || 0}
            </div>
            <p className="text-xs text-slate-600 mt-1">
              {liveMetrics?.active_jobs_count || 0} active jobs
            </p>
          </CardContent>
        </Card>

        {/* Completed Today */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed Today</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {dailySummary?.jobs_completed || 0}
            </div>
            <p className="text-xs text-slate-600 mt-1">
              {dailySummary?.time_entries_completed || 0} time entries
            </p>
          </CardContent>
        </Card>

        {/* In Progress */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <Activity className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">
              {liveMetrics?.jobs_in_progress || 0}
            </div>
            <p className="text-xs text-slate-600 mt-1">
              {liveMetrics?.pending_jobs || 0} pending
            </p>
          </CardContent>
        </Card>

        {/* Avg Efficiency */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Efficiency</CardTitle>
            <TrendingUp className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-600">
              {dailySummary?.average_efficiency?.toFixed(1) || 0}%
            </div>
            <p className="text-xs text-slate-600 mt-1">
              {dailySummary?.total_work_hours?.toFixed(1) || 0} hours worked
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Who's Working Now */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Users className="w-5 h-5 mr-2" />
              Who's Working Now
            </CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(liveMetrics?.operators_working || {}).length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                No operators currently working
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(liveMetrics?.operators_working || {}).map(([operator, jobs]) => (
                  <div key={operator} className="border-b pb-3 last:border-0">
                    <div className="font-semibold text-lg">{operator}</div>
                    <div className="space-y-2 mt-2">
                      {jobs.map((job, idx) => (
                        <div key={idx} className="flex justify-between items-center text-sm">
                          <div>
                            <span className="font-mono">{job.job_number}</span>
                            <span className="text-slate-600 ml-2">- {job.process}</span>
                          </div>
                          <Badge variant={job.status === 'active' ? 'default' : 'secondary'}>
                            {job.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Machine/Process Utilization */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Zap className="w-5 h-5 mr-2" />
              Machine Utilization
            </CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(machineUtil?.processes || {}).length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                No machine data available
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(machineUtil?.processes || {}).map(([process, stats]) => (
                  <div key={process} className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold">{process}</span>
                      <Badge variant={stats.utilization_percent > 80 ? 'default' : 'secondary'}>
                        {stats.utilization_percent}%
                      </Badge>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full ${
                          stats.utilization_percent > 80 ? 'bg-green-500' : 
                          stats.utilization_percent > 50 ? 'bg-blue-500' : 
                          'bg-slate-400'
                        }`}
                        style={{ width: `${Math.min(stats.utilization_percent, 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-slate-600">
                      <span>{stats.active} active, {stats.completed} completed</span>
                      <span>{stats.total_hours?.toFixed(1)} hours</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottlenecks & Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Process Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <BarChart3 className="w-5 h-5 mr-2" />
              Process Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            {bottlenecks?.process_performance?.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                No performance data available
              </div>
            ) : (
              <div className="space-y-3">
                {bottlenecks?.process_performance?.slice(0, 5).map((process) => (
                  <div key={process.process} className="flex items-center justify-between p-3 border rounded">
                    <div>
                      <div className="font-semibold">{process.process}</div>
                      <div className="text-sm text-slate-600">
                        {process.total_jobs} jobs, {process.jobs_behind} behind
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-xl font-bold ${
                        process.avg_efficiency >= 100 ? 'text-green-600' :
                        process.avg_efficiency >= 80 ? 'text-orange-600' :
                        'text-red-600'
                      }`}>
                        {process.avg_efficiency.toFixed(1)}%
                      </div>
                      <Badge variant={
                        process.performance_rating === 'good' ? 'default' :
                        process.performance_rating === 'needs_attention' ? 'secondary' :
                        'destructive'
                      }>
                        {process.performance_rating.replace('_', ' ')}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Slowest Jobs */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <AlertTriangle className="w-5 h-5 mr-2 text-orange-600" />
              Jobs Running Behind
            </CardTitle>
          </CardHeader>
          <CardContent>
            {bottlenecks?.slowest_jobs?.length === 0 ? (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  All jobs are on track! No significant delays detected.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-3">
                {bottlenecks?.slowest_jobs?.map((job) => (
                  <div key={job.job_number} className="p-3 border border-orange-200 bg-orange-50 rounded">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-semibold">{job.job_number}</div>
                        <div className="text-sm text-slate-600">{job.customer}</div>
                        <div className="text-xs text-slate-500">{job.process}</div>
                      </div>
                      <Badge variant="destructive">
                        {job.efficiency_percent}%
                      </Badge>
                    </div>
                    <div className="mt-2 text-sm">
                      <span className="text-red-600 font-semibold">
                        +{job.hours_over} hours
                      </span>
                      <span className="text-slate-600"> over estimate</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Daily Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Target className="w-5 h-5 mr-2" />
            Today's Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {dailySummary?.jobs_completed || 0}
              </div>
              <div className="text-sm text-slate-600">Jobs Completed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {dailySummary?.total_work_hours?.toFixed(1) || 0}
              </div>
              <div className="text-sm text-slate-600">Work Hours</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">
                {dailySummary?.total_break_hours?.toFixed(1) || 0}
              </div>
              <div className="text-sm text-slate-600">Break Hours</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {dailySummary?.average_efficiency?.toFixed(1) || 0}%
              </div>
              <div className="text-sm text-slate-600">Avg Efficiency</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-slate-700">
                {dailySummary?.time_entries_completed || 0}
              </div>
              <div className="text-sm text-slate-600">Time Entries</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Debug Panel - Shows raw API data */}
      <Card className="border-orange-200 bg-orange-50">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-600" />
            Debug Info (Admin Only)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm space-y-2">
            <div><strong>API Response - Active Operators:</strong> {liveMetrics?.active_operators ?? 'null'}</div>
            <div><strong>API Response - Active Jobs Count:</strong> {liveMetrics?.active_jobs_count ?? 'null'}</div>
            <div><strong>Operators Working:</strong></div>
            <pre className="bg-white p-2 rounded text-xs overflow-auto max-h-40">
              {JSON.stringify(liveMetrics?.operators_working, null, 2) || 'No data'}
            </pre>
            <div className="text-xs text-orange-700 mt-2">
              If this shows 0 but Shop Floor shows active jobs, refresh both pages or check browser console (F12) for errors.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProductionDashboard;
