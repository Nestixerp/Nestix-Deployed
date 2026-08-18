import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Plus, Search, Mail, Phone, MapPin, Edit, Globe, FileText } from 'lucide-react';
import { mockSuppliers } from '../mock/mockData';

const Suppliers = () => {
  const [suppliers, setSuppliers] = useState(mockSuppliers);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const filteredSuppliers = suppliers.filter(supplier =>
    supplier.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    supplier.contactName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleViewSupplier = (supplier) => {
    setSelectedSupplier(supplier);
    setIsDialogOpen(true);
  };

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Suppliers</h1>
          <p className="text-slate-600 mt-2">Manage your supplier relationships</p>
        </div>
        <Button className="bg-slate-900 hover:bg-slate-800">
          <Plus className="w-4 h-4 mr-2" />
          New Supplier
        </Button>
      </div>

      {/* Search */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                placeholder="Search suppliers by name or contact..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Suppliers Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Suppliers ({filteredSuppliers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company Name</TableHead>
                <TableHead>Contact Person</TableHead>
                <TableHead>Supplier Of</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Month Spend (Jul)</TableHead>
                <TableHead>Total Spend</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSuppliers.map((supplier) => (
                <TableRow key={supplier.id} className="cursor-pointer hover:bg-slate-50">
                  <TableCell className="font-medium">{supplier.companyName}</TableCell>
                  <TableCell>
                    <div>
                      <p className="text-sm font-medium">{supplier.contactName}</p>
                      <p className="text-xs text-slate-500">{supplier.contactPosition}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="inline-block px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                      {supplier.supplierOf}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <p>{supplier.suburb}, {supplier.state}</p>
                      <p className="text-slate-500">{supplier.postcode}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-semibold text-green-600">${supplier.currentMonthSpend?.toLocaleString() || '0.00'}</p>
                      <p className="text-xs text-slate-500">{supplier.monthlySpend?.[0]?.orders || 0} orders</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="font-medium text-slate-900">${supplier.totalSpend?.toLocaleString() || '0.00'}</p>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleViewSupplier(supplier)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Supplier Detail Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Supplier Details</DialogTitle>
            <DialogDescription>View and manage supplier information</DialogDescription>
          </DialogHeader>
          {selectedSupplier && (
            <Tabs defaultValue="company" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="company">Company Info</TabsTrigger>
                <TabsTrigger value="contacts">Contacts</TabsTrigger>
                <TabsTrigger value="financial">Financial</TabsTrigger>
                <TabsTrigger value="orders">Purchase Orders</TabsTrigger>
              </TabsList>
              
              <TabsContent value="company" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label>Company Name</Label>
                    <Input value={selectedSupplier.companyName} readOnly className="mt-1 font-medium" />
                  </div>
                  <div>
                    <Label>Supplier Of</Label>
                    <Input value={selectedSupplier.supplierOf} readOnly className="mt-1" />
                  </div>
                  <div>
                    <Label>ABN</Label>
                    <Input value={selectedSupplier.abn} readOnly className="mt-1" />
                  </div>
                  <div className="col-span-2">
                    <Label>Street Address</Label>
                    <Input value={selectedSupplier.address} readOnly className="mt-1" />
                  </div>
                  <div>
                    <Label>Suburb</Label>
                    <Input value={selectedSupplier.suburb} readOnly className="mt-1" />
                  </div>
                  <div>
                    <Label>State</Label>
                    <Input value={selectedSupplier.state} readOnly className="mt-1" />
                  </div>
                  <div>
                    <Label>Postcode</Label>
                    <Input value={selectedSupplier.postcode} readOnly className="mt-1" />
                  </div>
                  <div>
                    <Label>Website</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Globe className="w-4 h-4 text-slate-400" />
                      <Input value={selectedSupplier.website} readOnly />
                    </div>
                  </div>
                  <div className="col-span-2">
                    <Label>Supplier Notes</Label>
                    <Textarea value={selectedSupplier.notes} readOnly className="mt-1" rows={4} />
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="contacts" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Primary Contact</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Contact Name</Label>
                        <Input value={selectedSupplier.contactName} readOnly className="mt-1" />
                      </div>
                      <div>
                        <Label>Position</Label>
                        <Input value={selectedSupplier.contactPosition} readOnly className="mt-1" />
                      </div>
                      <div>
                        <Label>Mobile Phone</Label>
                        <div className="flex items-center gap-2 mt-1">
                          <Phone className="w-4 h-4 text-slate-400" />
                          <Input value={selectedSupplier.mobile} readOnly />
                        </div>
                      </div>
                      <div>
                        <Label>Office Phone</Label>
                        <div className="flex items-center gap-2 mt-1">
                          <Phone className="w-4 h-4 text-slate-400" />
                          <Input value={selectedSupplier.phone} readOnly />
                        </div>
                      </div>
                      <div>
                        <Label>Fax</Label>
                        <Input value={selectedSupplier.fax} readOnly className="mt-1" />
                      </div>
                      <div>
                        <Label>Email</Label>
                        <div className="flex items-center gap-2 mt-1">
                          <Mail className="w-4 h-4 text-slate-400" />
                          <Input value={selectedSupplier.email} readOnly />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Company Structure</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="grid grid-cols-3 gap-4 p-3 bg-slate-50 rounded-lg">
                        <div>
                          <p className="text-xs text-slate-600">Managing Director</p>
                          <p className="text-sm font-medium mt-1">-</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-600">Phone</p>
                          <p className="text-sm font-medium mt-1">9734 8977</p>
                        </div>
                        <div></div>
                      </div>
                      <div className="grid grid-cols-3 gap-4 p-3 bg-slate-50 rounded-lg">
                        <div>
                          <p className="text-xs text-slate-600">Sales Manager</p>
                          <p className="text-sm font-medium mt-1">{selectedSupplier.contactName}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-600">Phone</p>
                          <p className="text-sm font-medium mt-1">8766 6913</p>
                        </div>
                        <div></div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="financial" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <Label>Account Number</Label>
                      <Input value={selectedSupplier.accountNumber} readOnly className="mt-1 font-medium" />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <Label>Account Status</Label>
                      <Input value="60 days EOM" readOnly className="mt-1 font-medium" />
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Charges & Fees</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 border border-slate-200 rounded-lg">
                        <span className="text-sm font-medium">Supplier Delivery Charge</span>
                        <span className="font-semibold">${selectedSupplier.deliveryCharge.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between p-3 border border-slate-200 rounded-lg">
                        <span className="text-sm font-medium">Supplier Pallet Charge</span>
                        <span className="font-semibold">${selectedSupplier.palletCharge.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between p-3 border border-slate-200 rounded-lg">
                        <span className="text-sm font-medium">Supplier Test Cert Charge</span>
                        <span className="font-semibold">${selectedSupplier.testCertCharge.toFixed(2)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="orders" className="mt-4">
                <Tabs defaultValue="monthly" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="monthly">Monthly Spend</TabsTrigger>
                    <TabsTrigger value="orders">Purchase Orders</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="monthly" className="space-y-4 mt-4">
                    <div className="grid grid-cols-3 gap-4">
                      <Card>
                        <CardContent className="pt-6">
                          <p className="text-sm text-slate-600">Current Month (Jul)</p>
                          <p className="text-2xl font-bold text-slate-900 mt-2">
                            ${selectedSupplier.currentMonthSpend?.toLocaleString() || '0.00'}
                          </p>
                          <p className="text-xs text-slate-500 mt-2">
                            {selectedSupplier.monthlySpend?.[0]?.orders || 0} orders this month
                          </p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-6">
                          <p className="text-sm text-slate-600">Total Lifetime Spend</p>
                          <p className="text-2xl font-bold text-green-600 mt-2">
                            ${selectedSupplier.totalSpend?.toLocaleString() || '0.00'}
                          </p>
                          <p className="text-xs text-slate-500 mt-2">All time</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-6">
                          <p className="text-sm text-slate-600">Average Monthly</p>
                          <p className="text-2xl font-bold text-blue-600 mt-2">
                            ${selectedSupplier.monthlySpend ? 
                              (selectedSupplier.monthlySpend.reduce((sum, m) => sum + m.spent, 0) / selectedSupplier.monthlySpend.length).toFixed(2) : 
                              '0.00'}
                          </p>
                          <p className="text-xs text-slate-500 mt-2">Last 5 months</p>
                        </CardContent>
                      </Card>
                    </div>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Monthly Spend Breakdown</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {selectedSupplier.monthlySpend?.map((monthData, i) => {
                            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                            const [year, month] = monthData.month.split('-');
                            const monthName = monthNames[parseInt(month) - 1];
                            const isCurrentMonth = i === 0;
                            
                            return (
                              <div key={i} className={`flex items-center justify-between p-4 border-2 rounded-lg ${isCurrentMonth ? 'border-green-200 bg-green-50' : 'border-slate-200'}`}>
                                <div>
                                  <p className="font-medium">{monthName} {year}</p>
                                  <p className="text-sm text-slate-600 mt-1">{monthData.orders} orders</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-xl font-bold text-slate-900">${monthData.spent.toLocaleString()}</p>
                                  {isCurrentMonth && (
                                    <span className="inline-block px-2 py-1 text-xs rounded-full bg-green-600 text-white mt-1">
                                      Current
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>
                  
                  <TabsContent value="orders" className="mt-4">
                    <div className="space-y-3">
                      {[
                        { date: 'Jul 15, 2025', createdBy: 'Peter C', value: 16606.00 },
                        { date: 'Jul 8, 2025', createdBy: 'Peter C', value: 643.00 },
                        { date: 'Jun 28, 2025', createdBy: 'Peter C', value: 9663.60 },
                        { date: 'Jun 22, 2025', createdBy: 'John', value: 1012.00 },
                        { date: 'Jun 15, 2025', createdBy: 'John', value: 1316.00 }
                      ].map((po, i) => (
                        <div key={i} className="border border-slate-200 rounded-lg p-4 hover:border-slate-300 transition-colors">
                          <div className="flex justify-between items-center">
                            <div>
                              <p className="font-medium">PO #{1000 + i}</p>
                              <p className="text-sm text-slate-600 mt-1">Created by {po.createdBy}</p>
                              <p className="text-xs text-slate-500 mt-1">{po.date}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold text-lg">${po.value.toLocaleString()}</p>
                              <Button size="sm" variant="outline" className="mt-2">
                                <FileText className="w-3 h-3 mr-1" />
                                View
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </TabsContent>
                </Tabs>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Suppliers;
