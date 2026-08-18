import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Plus, Search, TrendingUp, Mail, Phone, MapPin, Edit } from 'lucide-react';
import { mockCustomers } from '../mock/mockData';

const Customers = () => {
  const [customers, setCustomers] = useState(mockCustomers);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const filteredCustomers = customers.filter(customer =>
    customer.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.contactName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleViewCustomer = (customer) => {
    setSelectedCustomer(customer);
    setIsDialogOpen(true);
  };

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Customers</h1>
          <p className="text-slate-600 mt-2">Manage your customer relationships</p>
        </div>
        <Button className="bg-slate-900 hover:bg-slate-800">
          <Plus className="w-4 h-4 mr-2" />
          New Customer
        </Button>
      </div>

      {/* Search and Filter */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                placeholder="Search customers by name or contact..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Customers Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Customers ({filteredCustomers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Total Spend</TableHead>
                <TableHead>Orders</TableHead>
                <TableHead>Last Order</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCustomers.map((customer) => (
                <TableRow key={customer.id} className="cursor-pointer hover:bg-slate-50">
                  <TableCell className="font-medium">{customer.companyName}</TableCell>
                  <TableCell>
                    <div>
                      <p className="text-sm font-medium">{customer.contactName}</p>
                      <p className="text-xs text-slate-500">{customer.email}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <p>{customer.suburb}, {customer.state}</p>
                      <p className="text-slate-500">{customer.postcode}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-semibold text-green-600">
                      ${customer.totalSpend.toLocaleString()}
                    </div>
                  </TableCell>
                  <TableCell>{customer.orders}</TableCell>
                  <TableCell className="text-sm text-slate-600">{customer.lastOrderDate}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleViewCustomer(customer)}
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

      {/* Customer Detail Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Customer Details</DialogTitle>
            <DialogDescription>View and manage customer information</DialogDescription>
          </DialogHeader>
          {selectedCustomer && (
            <Tabs defaultValue="info" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="info">Information</TabsTrigger>
                <TabsTrigger value="spend">Spend Analysis</TabsTrigger>
                <TabsTrigger value="history">Order History</TabsTrigger>
              </TabsList>
              
              <TabsContent value="info" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Company Name</Label>
                    <Input value={selectedCustomer.companyName} readOnly className="mt-1" />
                  </div>
                  <div>
                    <Label>Contact Name</Label>
                    <Input value={selectedCustomer.contactName} readOnly className="mt-1" />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Mail className="w-4 h-4 text-slate-400" />
                      <Input value={selectedCustomer.email} readOnly />
                    </div>
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Phone className="w-4 h-4 text-slate-400" />
                      <Input value={selectedCustomer.phone} readOnly />
                    </div>
                  </div>
                  <div className="col-span-2">
                    <Label>Address</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <MapPin className="w-4 h-4 text-slate-400" />
                      <Input value={`${selectedCustomer.address}, ${selectedCustomer.suburb}, ${selectedCustomer.state} ${selectedCustomer.postcode}`} readOnly />
                    </div>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="spend" className="space-y-4 mt-4">
                <div className="grid grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <p className="text-sm text-slate-600">Total Spend</p>
                        <p className="text-2xl font-bold text-slate-900 mt-2">${selectedCustomer.totalSpend.toLocaleString()}</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <p className="text-sm text-slate-600">Total Orders</p>
                        <p className="text-2xl font-bold text-slate-900 mt-2">{selectedCustomer.orders}</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <p className="text-sm text-slate-600">Avg Order Value</p>
                        <p className="text-2xl font-bold text-slate-900 mt-2">${Math.round(selectedCustomer.totalSpend / selectedCustomer.orders).toLocaleString()}</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
                <div className="mt-6">
                  <h4 className="font-semibold mb-4">Monthly Spend Trend</h4>
                  <div className="h-64 bg-slate-50 rounded-lg flex items-center justify-center text-slate-500">
                    Chart visualization (Coming soon)
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="history" className="mt-4">
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="border border-slate-200 rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium">Order #Q-78{6398 - i}</p>
                          <p className="text-sm text-slate-600 mt-1">Laser cutting - Steel parts</p>
                          <p className="text-xs text-slate-500 mt-1">2025-07-{20 - i}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">${(Math.random() * 1000 + 500).toFixed(2)}</p>
                          <span className="inline-block px-2 py-1 text-xs rounded-full bg-green-100 text-green-800 mt-1">
                            Completed
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Customers;
