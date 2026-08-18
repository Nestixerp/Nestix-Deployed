import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Loader2 } from 'lucide-react';
import { toast } from '../../hooks/use-toast';
import api from '../../services/api';

const MaterialDetailDialog = ({ open, onOpenChange, material }) => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && material) {
      fetchHistory();
    }
  }, [open, material]);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/materials/${material.id}/history`);
      setHistory(response.data);
    } catch (error) {
      console.error('Error fetching history:', error);
      toast({ title: 'Error', description: 'Failed to load material history', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (!material) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Material Details & History</DialogTitle>
          <DialogDescription>View stock levels and transaction history</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="details" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="history">Transaction History</TabsTrigger>
          </TabsList>
          
          <TabsContent value="details" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle className="text-base">Material Information</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div><Label className="text-xs text-slate-600">Material Type</Label><p className="font-medium">{material.name}</p></div>
                  <div><Label className="text-xs text-slate-600">Thickness</Label><p className="font-medium">{material.thickness}</p></div>
                  <div><Label className="text-xs text-slate-600">Grade</Label><p className="font-medium">{material.grade}</p></div>
                  <div><Label className="text-xs text-slate-600">Finish</Label><p className="font-medium">{material.finish}</p></div>
                  <div><Label className="text-xs text-slate-600">Dimensions</Label><p className="font-medium">{material.width}mm × {material.length}mm</p></div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Stock & Pricing</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div><Label className="text-xs text-slate-600">Current Stock</Label><p className="text-2xl font-bold text-slate-900">{material.stock.toLocaleString()} Sheets</p></div>
                  <div><Label className="text-xs text-slate-600">Reorder Level</Label><p className="font-medium">{material.reorder_level} Sheets</p></div>
                  <div><Label className="text-xs text-slate-600">Location</Label><p className="font-medium">{material.location}</p></div>
                  <div><Label className="text-xs text-slate-600">Supplier</Label><p className="font-medium">{material.supplier}</p></div>
                  <div><Label className="text-xs text-slate-600">Cost Average</Label><p className="text-lg font-semibold text-blue-600">${(material.cost_average || 0).toFixed(2)}</p></div>
                  <div><Label className="text-xs text-slate-600">Selling Price (with {material.markup_percentage}% markup)</Label><p className="text-xl font-semibold text-green-600">${(material.selling_price || 0).toFixed(2)}</p></div>
                  <div><Label className="text-xs text-slate-600">Weight per Sheet</Label><p className="font-medium">{(material.weight_per_sheet || 0).toFixed(2)} kg</p></div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader><CardTitle className="text-base">Stock Status</CardTitle></CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="h-4 bg-slate-200 rounded-full overflow-hidden">
                      <div className={`h-full ${material.stock <= material.reorder_level ? 'bg-red-500' : material.stock <= material.reorder_level * 1.5 ? 'bg-orange-500' : 'bg-green-500'}`} style={{width: `${Math.min((material.stock / (material.reorder_level * 2)) * 100, 100)}%`}}></div>
                    </div>
                  </div>
                  <div className="text-sm font-medium">
                    {material.stock <= material.reorder_level ? (<span className="text-red-600">⚠️ Low Stock - Reorder Now</span>) : material.stock <= material.reorder_level * 1.5 ? (<span className="text-orange-600">⚠️ Stock Running Low</span>) : (<span className="text-green-600">✓ Stock Healthy</span>)}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="history" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Transaction History</CardTitle></CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
                ) : history.length === 0 ? (
                  <p className="text-center text-slate-500 py-8">No transactions recorded yet</p>
                ) : (
                  <div className="space-y-3">
                    {history.map((transaction, i) => (
                      <div key={i} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:border-slate-300 transition-colors">
                        <div>
                          <p className="font-medium">{transaction.type}</p>
                          <p className="text-sm text-slate-600">{transaction.reference || transaction.note}</p>
                          <p className="text-xs text-slate-500">{new Date(transaction.created_at).toLocaleDateString()} • {transaction.user}</p>
                        </div>
                        <div className={`text-lg font-bold ${transaction.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {transaction.quantity > 0 ? '+' : ''}{transaction.quantity} Sheets
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default MaterialDetailDialog;