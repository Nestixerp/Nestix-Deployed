import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { TrendingUp, TrendingDown, AlertTriangle, Award, DollarSign, Package, Loader2 } from 'lucide-react';
import { toast } from '../hooks/use-toast';
import api from '../services/api';
import { useNavigate } from 'react-router-dom';

const SupplierDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const response = await api.get('/suppliers/analytics/dashboard');
      setDashboard(response.data);
    } catch (error) {
      console.error('Error fetching dashboard:', error);
      toast({ title: 'Error', description: 'Failed to load dashboard data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const getPerformanceColor = (rating) => {
    switch(rating) {
      case 'Excellent': return 'text-green-600';
      case 'Good': return 'text-blue-600';
      case 'Needs Improvement': return 'text-orange-600';
      case 'Poor': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getRatingBadgeColor = (rating) => {
    switch(rating) {
      case 'Excellent': return 'bg-green-100 text-green-800';
      case 'Good': return 'bg-blue-100 text-blue-800';
      case 'Needs Improvement': return 'bg-orange-100 text-orange-800';
      case 'Poor': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="p-8">
        <div className="text-center py-12">
          <Package className="w-16 h-16 mx-auto text-slate-300 mb-4" />
          <p className="text-slate-500">No dashboard data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Supplier Performance Dashboard</h1>
        <p className="text-slate-600 mt-2">Monitor supplier performance and key metrics</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Avg Days Late</p>
                <h3 className="text-2xl font-bold text-slate-900 mt-2">{dashboard.system_average_days_late}</h3>
                <p className="text-xs text-slate-500 mt-1">System-wide average</p>
              </div>
              <div className="bg-orange-500 p-3 rounded-lg">
                <TrendingDown className="w-6 h-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Suppliers with Alerts</p>
                <h3 className="text-2xl font-bold text-red-600 mt-2">{dashboard.suppliers_with_alerts}</h3>
                <p className="text-xs text-slate-500 mt-1">Require attention</p>
              </div>
              <div className="bg-red-500 p-3 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Top Performers</p>
                <h3 className="text-2xl font-bold text-green-600 mt-2">{dashboard.top_performers.length}</h3>
                <p className="text-xs text-slate-500 mt-1">Excellent rated</p>
              </div>
              <div className="bg-green-500 p-3 rounded-lg">
                <Award className="w-6 h-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Categories</p>
                <h3 className="text-2xl font-bold text-slate-900 mt-2">{dashboard.spend_by_category.length}</h3>
                <p className="text-xs text-slate-500 mt-1">Active categories</p>
              </div>
              <div className="bg-purple-500 p-3 rounded-lg">
                <Package className="w-6 h-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Top Performers */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="w-5 h-5 text-green-600" />
              Top 5 Performing Suppliers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dashboard.top_performers.length === 0 ? (
              <p className="text-center text-slate-500 py-8">No data available yet</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier</TableHead>
                    <TableHead>On-Time %</TableHead>
                    <TableHead>Rating</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.top_performers.map((supplier) => (
                    <TableRow 
                      key={supplier.id}
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => navigate('/suppliers')}
                    >
                      <TableCell>
                        <div>
                          <p className="font-medium">{supplier.company_name}</p>
                          <p className="text-xs text-slate-500">{supplier.supplier_code}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-semibold text-green-600">{supplier.on_time_delivery}%</span>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-block px-2 py-1 text-xs rounded-full ${getRatingBadgeColor(supplier.performance_rating)}`}>
                          {supplier.performance_rating}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Bottom Performers */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-red-600" />
              Bottom 5 Suppliers (Late Deliveries)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dashboard.bottom_performers.length === 0 ? (
              <p className="text-center text-slate-500 py-8">No data available yet</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Avg Days Late</TableHead>
                    <TableHead>Rating</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.bottom_performers.map((supplier) => (
                    <TableRow 
                      key={supplier.id}
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => navigate('/suppliers')}
                    >
                      <TableCell>
                        <div>
                          <p className="font-medium">{supplier.company_name}</p>
                          <p className="text-xs text-slate-500">{supplier.supplier_code}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-semibold text-red-600">{supplier.average_days_late} days</span>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-block px-2 py-1 text-xs rounded-full ${getRatingBadgeColor(supplier.performance_rating)}`}>
                          {supplier.performance_rating}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Spend by Category */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-green-600" />
            Total FY Spend by Category
          </CardTitle>
        </CardHeader>
        <CardContent>
          {dashboard.spend_by_category.length === 0 ? (
            <p className="text-center text-slate-500 py-8">No spend data available yet</p>
          ) : (
            <div className="space-y-4">
              {dashboard.spend_by_category.map((item) => (
                <div key={item.category} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                  <div className="flex-1">
                    <p className="font-semibold text-slate-900">{item.category}</p>
                    <p className="text-sm text-slate-600">{item.supplier_count} suppliers</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-green-600">${item.total_spend.toLocaleString()}</p>
                    <p className="text-xs text-slate-500">FY Total</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SupplierDashboard;
