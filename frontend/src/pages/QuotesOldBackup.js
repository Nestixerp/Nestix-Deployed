import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Plus, Search, FileText, Edit, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { mockQuotes } from '../mock/mockData';

const Quotes = () => {
  const [quotes, setQuotes] = useState(mockQuotes);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  const filteredQuotes = quotes.filter(quote =>
    quote.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    quote.customer.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusColor = (status) => {
    switch(status.toLowerCase()) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'approved': return 'bg-blue-100 text-blue-800';
      case 'declined': return 'bg-red-100 text-red-800';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Quotes</h1>
          <p className="text-slate-600 mt-2">Create and manage quotes</p>
        </div>
        <Button 
          className="bg-slate-900 hover:bg-slate-800"
          onClick={() => navigate('/quotes/new')}
        >
          <Plus className="w-4 h-4 mr-2" />
          New Quote
        </Button>
      </div>

      {/* Search */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                placeholder="Search quotes by ID or customer..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quotes Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Quotes ({filteredQuotes.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quote ID</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Part Description</TableHead>
                <TableHead>Date Created</TableHead>
                <TableHead>Quoted Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredQuotes.map((quote) => (
                <TableRow key={quote.id} className="cursor-pointer hover:bg-slate-50">
                  <TableCell className="font-medium">{quote.id}</TableCell>
                  <TableCell>{quote.customer}</TableCell>
                  <TableCell>{quote.contactPerson}</TableCell>
                  <TableCell className="max-w-xs truncate">{quote.partDescription}</TableCell>
                  <TableCell>{quote.dateCreated}</TableCell>
                  <TableCell className="font-semibold text-green-600">
                    ${quote.quotedPrice.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <span className={`inline-block px-2 py-1 text-xs rounded-full ${getStatusColor(quote.status)}`}>
                      {quote.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/quotes/${quote.id}`)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                      >
                        <FileText className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default Quotes;
