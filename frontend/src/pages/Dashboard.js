import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { FileText, Users, Truck, Package, TrendingUp, DollarSign, AlertTriangle, Clock, Calendar, ShoppingCart } from 'lucide-react';
import api from '../services/api';

const Dashboard = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardMetrics();
  }, []);

  const fetchDashboardMetrics = async () => {
    try {
      setLoading(true);
      const response = await api.get('/dashboard/metrics');
      console.log('Dashboard metrics received:', response.data);
      console.log('Revenue YTD:', response.data.revenue_ytd);
      console.log('Quotes Today:', response.data.quotes_today_count);
      console.log('Jobs Created Today:', response.data.jobs_created_today);
      console.log('Active Work Hours:', response.data.hours_active_work);
      setMetrics(response.data);
    } catch (error) {
      console.error('Error fetching dashboard metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-200 rounded w-1/4 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-32 bg-slate-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
    }).format(amount || 0);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-AU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Welcome back, {currentUser?.name}</h1>
        <p className="text-slate-600 mt-2">Here's what's happening with your business today.</p>
      </div>

      {/* Stats Grid - Compact 6 columns */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        {/* Low Stock Alert */}
        <Card 
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => navigate('/inventory')}
        >
          <CardContent className="p-4">
            <div className="text-center">
              <div className="bg-orange-500 w-10 h-10 rounded-lg flex items-center justify-center mx-auto mb-2">
                <AlertTriangle className="w-5 h-5 text-white" />
              </div>
              <p className="text-xs font-medium text-slate-600">Low Stock</p>
              <h3 className="text-xl font-bold text-slate-900 mt-1">{metrics?.low_stock?.count || 0}</h3>
            </div>
          </CardContent>
        </Card>

        {/* Overdue Purchase Orders */}
        <Card 
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => navigate('/purchase-orders')}
        >
          <CardContent className="p-4">
            <div className="text-center">
              <div className="bg-red-500 w-10 h-10 rounded-lg flex items-center justify-center mx-auto mb-2">
                <Truck className="w-5 h-5 text-white" />
              </div>
              <p className="text-xs font-medium text-slate-600">Overdue POs</p>
              <h3 className="text-xl font-bold text-slate-900 mt-1">{metrics?.overdue_pos?.count || 0}</h3>
            </div>
          </CardContent>
        </Card>

        {/* Revenue YTD */}
        <Card>
          <CardContent className="p-4">
            <div className="text-center">
              <div className="bg-green-500 w-10 h-10 rounded-lg flex items-center justify-center mx-auto mb-2">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <p className="text-xs font-medium text-slate-600">Revenue YTD</p>
              <h3 className="text-lg font-bold text-slate-900 mt-1">
                {formatCurrency(metrics?.revenue_ytd)}
              </h3>
            </div>
          </CardContent>
        </Card>

        {/* Revenue MTD */}
        <Card>
          <CardContent className="p-4">
            <div className="text-center">
              <div className="bg-blue-500 w-10 h-10 rounded-lg flex items-center justify-center mx-auto mb-2">
                <DollarSign className="w-5 h-5 text-white" />
              </div>
              <p className="text-xs font-medium text-slate-600">Revenue MTD</p>
              <h3 className="text-lg font-bold text-slate-900 mt-1">
                {formatCurrency(metrics?.revenue_mtd)}
              </h3>
            </div>
          </CardContent>
        </Card>

        {/* Inventory Spend MTD */}
        <Card>
          <CardContent className="p-4">
            <div className="text-center">
              <div className="bg-purple-500 w-10 h-10 rounded-lg flex items-center justify-center mx-auto mb-2">
                <ShoppingCart className="w-5 h-5 text-white" />
              </div>
              <p className="text-xs font-medium text-slate-600">Inventory MTD</p>
              <h3 className="text-lg font-bold text-slate-900 mt-1">
                {formatCurrency(metrics?.inventory_spend_mtd)}
              </h3>
            </div>
          </CardContent>
        </Card>

        {/* Hours Active Work */}
        <Card>
          <CardContent className="p-4">
            <div className="text-center">
              <div className="bg-indigo-500 w-10 h-10 rounded-lg flex items-center justify-center mx-auto mb-2">
                <Clock className="w-5 h-5 text-white" />
              </div>
              <p className="text-xs font-medium text-slate-600">Active Work</p>
              <h3 className="text-xl font-bold text-slate-900 mt-1">
                {(metrics?.hours_active_work || 0).toFixed(1)} hrs
              </h3>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quotes Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {/* Quotes Today */}
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-600">Quotes Today</p>
                <h3 className="text-2xl font-bold text-slate-900 mt-1">{metrics?.quotes_today_count || 0}</h3>
                <p className="text-sm text-blue-600 mt-1">{formatCurrency(metrics?.quotes_today_value || 0)}</p>
              </div>
              <div className="bg-blue-500 w-12 h-12 rounded-lg flex items-center justify-center">
                <FileText className="w-6 h-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quotes This Week */}
        <Card className="bg-gradient-to-br from-green-50 to-green-100">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-600">Quotes This Week</p>
                <h3 className="text-2xl font-bold text-slate-900 mt-1">{metrics?.quotes_week_count || 0}</h3>
                <p className="text-sm text-green-600 mt-1">{formatCurrency(metrics?.quotes_week_value || 0)}</p>
              </div>
              <div className="bg-green-500 w-12 h-12 rounded-lg flex items-center justify-center">
                <FileText className="w-6 h-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quotes This Month */}
        <Card className="bg-gradient-to-br from-purple-50 to-purple-100">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-600">Quotes This Month</p>
                <h3 className="text-2xl font-bold text-slate-900 mt-1">{metrics?.quotes_month_count || 0}</h3>
                <p className="text-sm text-purple-600 mt-1">{formatCurrency(metrics?.quotes_month_value || 0)}</p>
              </div>
              <div className="bg-purple-500 w-12 h-12 rounded-lg flex items-center justify-center">
                <FileText className="w-6 h-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Low Stock Materials Detail */}
        <Card>
          <CardHeader>
            <CardTitle>Low Stock Materials</CardTitle>
            <CardDescription>Materials below reorder level</CardDescription>
          </CardHeader>
          <CardContent>
            {metrics?.low_stock?.materials?.length > 0 ? (
              <div className="space-y-4">
                {metrics.low_stock.materials.map((material) => (
                  <div 
                    key={material.id} 
                    className="flex items-center justify-between p-4 border border-orange-200 bg-orange-50 rounded-lg hover:border-orange-300 transition-colors cursor-pointer"
                    onClick={() => navigate('/inventory')}
                  >
                    <div>
                      <p className="font-medium text-slate-900">
                        {material.material_type} - {material.thickness}
                      </p>
                      <p className="text-sm text-slate-600">Grade: {material.grade}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-orange-600">
                        {material.current_stock} / {material.reorder_level}
                      </p>
                      <span className="inline-block px-2 py-1 text-xs rounded-full bg-orange-100 text-orange-800 mt-1">
                        Low Stock
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 text-center py-8">✓ All materials are well stocked</p>
            )}
          </CardContent>
        </Card>

        {/* Overdue Purchase Orders Detail */}
        <Card>
          <CardHeader>
            <CardTitle>Overdue Purchase Orders</CardTitle>
            <CardDescription>POs past expected delivery date</CardDescription>
          </CardHeader>
          <CardContent>
            {metrics?.overdue_pos?.pos?.length > 0 ? (
              <div className="space-y-4">
                {metrics.overdue_pos.pos.map((po) => (
                  <div 
                    key={po.id} 
                    className="flex items-center justify-between p-4 border border-red-200 bg-red-50 rounded-lg hover:border-red-300 transition-colors cursor-pointer"
                    onClick={() => navigate('/purchase-orders')}
                  >
                    <div>
                      <p className="font-medium text-slate-900">{po.po_number}</p>
                      <p className="text-sm text-slate-600">{po.supplier_name}</p>
                      <p className="text-xs text-slate-500 mt-1">Due: {formatDate(po.expected_delivery_date)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-slate-900">{formatCurrency(po.total)}</p>
                      <span className="inline-block px-2 py-1 text-xs rounded-full bg-red-100 text-red-800 mt-1">
                        {po.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 text-center py-8">✓ No overdue purchase orders</p>
            )}
          </CardContent>
        </Card>

        {/* Recent Quotes Detail */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Quotes</CardTitle>
            <CardDescription>Last 5 quotes created</CardDescription>
          </CardHeader>
          <CardContent>
            {metrics?.recent_quotes?.length > 0 ? (
              <div className="space-y-4">
                {metrics.recent_quotes.map((quote) => (
                  <div 
                    key={quote.id} 
                    className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:border-slate-300 transition-colors cursor-pointer"
                    onClick={() => navigate('/quotes')}
                  >
                    <div>
                      <p className="font-medium text-slate-900">Quote #{quote.quote_number}</p>
                      <p className="text-sm text-slate-600">{quote.customer_name}</p>
                      <p className="text-xs text-slate-500 mt-1">{formatDate(quote.created_at)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-slate-900">{formatCurrency(quote.quote_total)}</p>
                      <span className={`inline-block px-2 py-1 text-xs rounded-full mt-1 ${
                        quote.status === 'Draft' ? 'bg-slate-100 text-slate-800' :
                        quote.status === 'Sent' ? 'bg-blue-100 text-blue-800' :
                        quote.status === 'Accepted' ? 'bg-green-100 text-green-800' :
                        'bg-slate-100 text-slate-800'
                      }`}>
                        {quote.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 text-center py-8">No recent quotes</p>
            )}
          </CardContent>
        </Card>

        {/* Time Tracking Info */}
        <Card>
          <CardHeader>
            <CardTitle>Time Tracking</CardTitle>
            <CardDescription>Job Sheet hours tracking (Coming Soon)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-4 border border-slate-200 bg-slate-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-700">Active Work</p>
                    <p className="text-sm text-slate-500 mt-1">In-progress & pending job sheets</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-green-600">
                      ${(metrics?.active_work_value || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-sm text-slate-500 mt-1">
                      {metrics?.hours_active_work?.toFixed(1) || '0.0'} hours
                    </p>
                  </div>
                </div>
              </div>
              <div className="p-4 border border-slate-200 bg-slate-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-700">Hours Entered Today</p>
                    <p className="text-sm text-slate-500 mt-1">Today's job sheet entries</p>
                  </div>
                  <p className="text-2xl font-bold text-slate-400">
                    {metrics?.hours_today?.toFixed(1) || '0.0'}
                  </p>
                </div>
              </div>
              <div className="text-center py-4">
                <p className="text-sm text-slate-500">
                  ⏳ Time tracking will be active once Job Sheets module is implemented
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
