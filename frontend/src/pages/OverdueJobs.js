import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { AlertTriangle, Calendar, Clock, Package, User, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import api from '../services/api';
import { formatDate, formatDateTime } from '../utils/dateFormatter';

const OverdueJobs = () => {
  const navigate = useNavigate();
  const [overdueJobs, setOverdueJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all', 'overdue', 'due_today'
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc' = soonest first, 'desc' = latest first

  useEffect(() => {
    fetchOverdueJobs();
  }, []);

  const fetchOverdueJobs = async () => {
    try {
      setLoading(true);
      const response = await api.get('/job-sheets/overdue/list');
      setOverdueJobs(response.data.overdue_jobs || []);
    } catch (error) {
      console.error('Error fetching overdue jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  const getFilteredJobs = () => {
    let filtered = overdueJobs;
    
    if (filter === 'overdue') {
      filtered = overdueJobs.filter(job => job.days_overdue > 0);
    } else if (filter === 'due_today') {
      filtered = overdueJobs.filter(job => job.is_due_today);
    }
    
    // Sort by due date
    const sorted = [...filtered].sort((a, b) => {
      const dateA = new Date(a.due_date);
      const dateB = new Date(b.due_date);
      
      if (sortOrder === 'asc') {
        return dateA - dateB; // Soonest first
      } else {
        return dateB - dateA; // Latest first
      }
    });
    
    return sorted;
  };

  const toggleSortOrder = () => {
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
  };

  const getStatusColor = (status) => {
    const colors = {
      'Pending': 'bg-yellow-100 text-yellow-800 border-yellow-300',
      'In Progress': 'bg-blue-100 text-blue-800 border-blue-300',
      'On Hold': 'bg-gray-100 text-gray-800 border-gray-300',
    };
    return colors[status] || 'bg-gray-100 text-gray-800 border-gray-300';
  };

  const getOverdueColor = (daysOverdue) => {
    if (daysOverdue === 0) return 'text-amber-600';
    if (daysOverdue <= 3) return 'text-orange-600';
    return 'text-red-600';
  };

  // formatDate function now imported from centralized utility

  const filteredJobs = getFilteredJobs();
  const overdueCount = overdueJobs.filter(j => j.days_overdue > 0).length;
  const dueTodayCount = overdueJobs.filter(j => j.is_due_today).length;

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-24 bg-slate-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="w-8 h-8 text-red-600" />
              Overdue Jobs
            </h1>
            <p className="text-slate-600 mt-2">Job sheets due today or past due that need attention</p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card 
          className={`cursor-pointer transition-all ${filter === 'all' ? 'border-2 border-blue-500 shadow-lg' : 'hover:shadow-md'}`}
          onClick={() => setFilter('all')}
        >
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">All Jobs</p>
                <h3 className="text-3xl font-bold text-slate-900 mt-1">{overdueJobs.length}</h3>
              </div>
              <div className="bg-blue-500 p-3 rounded-lg">
                <Package className="w-6 h-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-all ${filter === 'due_today' ? 'border-2 border-amber-500 shadow-lg' : 'hover:shadow-md'}`}
          onClick={() => setFilter('due_today')}
        >
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Due Today</p>
                <h3 className="text-3xl font-bold text-amber-600 mt-1">{dueTodayCount}</h3>
              </div>
              <div className="bg-amber-500 p-3 rounded-lg">
                <Calendar className="w-6 h-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-all ${filter === 'overdue' ? 'border-2 border-red-500 shadow-lg' : 'hover:shadow-md'}`}
          onClick={() => setFilter('overdue')}
        >
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Past Due</p>
                <h3 className="text-3xl font-bold text-red-600 mt-1">{overdueCount}</h3>
              </div>
              <div className="bg-red-500 p-3 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Jobs List */}
      <Card>
        <CardHeader>
          <CardTitle>
            {filter === 'all' && 'All Overdue & Due Today Jobs'}
            {filter === 'overdue' && 'Past Due Jobs'}
            {filter === 'due_today' && 'Jobs Due Today'}
          </CardTitle>
          <CardDescription>
            {filteredJobs.length} job{filteredJobs.length !== 1 ? 's' : ''} requiring attention
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredJobs.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 text-lg">No jobs found for this filter</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Job #</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Customer</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Part Description</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Status</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Qty</th>
                    <th 
                      className="text-left py-3 px-4 text-sm font-semibold text-slate-700 cursor-pointer hover:bg-slate-50 select-none"
                      onClick={toggleSortOrder}
                    >
                      <div className="flex items-center gap-2">
                        Due Date
                        {sortOrder === 'asc' ? (
                          <ArrowUp className="w-4 h-4 text-blue-600" />
                        ) : (
                          <ArrowDown className="w-4 h-4 text-blue-600" />
                        )}
                      </div>
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Days Overdue</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredJobs.map((job) => (
                    <tr
                      key={job.id}
                      className="border-b hover:bg-slate-50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/job-sheets?view=${job.id}`)}
                    >
                      <td className="py-4 px-4">
                        <span className="font-semibold text-slate-900">{job.job_sheet_number}</span>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-slate-400" />
                          <span className="text-slate-700">{job.customer_name}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span className="text-slate-700">{job.part_description}</span>
                      </td>
                      <td className="py-4 px-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(job.status)}`}>
                          {job.status}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <span className="text-slate-700">{job.quantity_accepted || job.quantity_required}</span>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex flex-col gap-1">
                          <span className={`font-medium ${getOverdueColor(job.days_overdue)}`}>
                            {formatDate(job.due_date)}
                          </span>
                          {job.is_due_today && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 w-fit">
                              Due Today
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        {job.days_overdue > 0 ? (
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                            job.days_overdue <= 3 
                              ? 'bg-orange-100 text-orange-800 border border-orange-300' 
                              : 'bg-red-100 text-red-800 border border-red-300'
                          }`}>
                            {job.days_overdue} day{job.days_overdue !== 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/job-sheets?view=${job.id}`);
                          }}
                          className="px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          View Details
                        </button>
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
};

export default OverdueJobs;
