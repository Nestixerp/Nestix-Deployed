import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Badge } from '../ui/badge';
import { Plus, Edit, Trash2, Star, StarOff, Mail, Phone, Smartphone } from 'lucide-react';
import api from '../../services/api';

// Contact roles array (moved outside to prevent recreation)
const contactRoles = [
  'Primary Contact',
  'Purchaser',
  'Accounts Payable',
  'Engineer',
  'Manager',
  'Production',
  'Quality Control',
  'General'
];

// ContactFormFields component - MOVED OUTSIDE to prevent recreation on every render
const ContactFormFields = React.memo(({ data, onChange, contactRoles }) => (
  <div className="space-y-4">
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2">
        <Label>Name *</Label>
        <Input
          value={data.name}
          onChange={(e) => onChange('name', e.target.value)}
          placeholder="Contact name"
          required
          autoComplete="off"
        />
      </div>
      
      <div>
        <Label>Job Title</Label>
        <Input
          value={data.job_title}
          onChange={(e) => onChange('job_title', e.target.value)}
          placeholder="e.g. Procurement Manager"
          autoComplete="off"
        />
      </div>
      
      <div>
        <Label>Role *</Label>
        <div className="flex gap-2">
          <select
            className="flex-1 border rounded-md p-2"
            value={data.role && contactRoles.includes(data.role) ? data.role : 'Custom'}
            onChange={(e) => {
              if (e.target.value !== 'Custom') {
                onChange('role', e.target.value);
              }
            }}
          >
            {contactRoles.map(role => (
              <option key={role} value={role}>{role}</option>
            ))}
            <option value="Custom">+ Add Custom Role</option>
          </select>
          {(!contactRoles.includes(data.role) || data.role === '') && (
            <Input
              className="flex-1"
              value={data.role}
              onChange={(e) => onChange('role', e.target.value)}
              placeholder="Enter custom role"
              autoComplete="off"
            />
          )}
        </div>
      </div>
      
      <div className="col-span-2">
        <Label>Email</Label>
        <Input
          type="email"
          value={data.email}
          onChange={(e) => onChange('email', e.target.value)}
          placeholder="email@example.com"
          autoComplete="off"
        />
      </div>
      
      <div>
        <Label>Phone</Label>
        <Input
          value={data.phone}
          onChange={(e) => onChange('phone', e.target.value)}
          placeholder="(03) 1234 5678"
          autoComplete="off"
        />
      </div>
      
      <div>
        <Label>Mobile</Label>
        <Input
          value={data.mobile}
          onChange={(e) => onChange('mobile', e.target.value)}
          placeholder="0412 345 678"
          autoComplete="off"
        />
      </div>
      
      <div className="col-span-2">
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="is_primary"
            checked={data.is_primary}
            onChange={(e) => onChange('is_primary', e.target.checked)}
            className="rounded"
          />
          <Label htmlFor="is_primary" className="cursor-pointer">Set as Primary Contact</Label>
        </div>
      </div>
      
      <div className="col-span-2">
        <Label>Notes</Label>
        <Textarea
          value={data.notes}
          onChange={(e) => onChange('notes', e.target.value)}
          placeholder="Additional notes about this contact..."
          rows={3}
        />
      </div>
    </div>
  </div>
));

ContactFormFields.displayName = 'ContactFormFields';

const CustomerContacts = ({ customerId }) => {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState(null);
  
  const [contactForm, setContactForm] = useState({
    name: '',
    job_title: '',
    role: 'General',
    email: '',
    phone: '',
    mobile: '',
    is_primary: false,
    notes: ''
  });

  const handleContactInputChange = useCallback((field, value) => {
    setContactForm(prev => ({
      ...prev,
      [field]: value
    }));
  }, []);

  useEffect(() => {
    if (customerId) {
      fetchContacts();
    }
  }, [customerId]);

  const fetchContacts = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/customers/${customerId}/contacts`);
      setContacts(response.data);
    } catch (error) {
      console.error('Error fetching contacts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddContact = async () => {
    try {
      await api.post(`/customers/${customerId}/contacts`, contactForm);
      setIsAddDialogOpen(false);
      resetForm();
      fetchContacts();
    } catch (error) {
      console.error('Error adding contact:', error);
      alert(error.response?.data?.detail || 'Failed to add contact');
    }
  };

  const handleEditContact = async () => {
    try {
      await api.put(`/customers/${customerId}/contacts/${selectedContact.id}`, contactForm);
      setIsEditDialogOpen(false);
      resetForm();
      fetchContacts();
    } catch (error) {
      console.error('Error updating contact:', error);
      alert(error.response?.data?.detail || 'Failed to update contact');
    }
  };

  const handleDeleteContact = async (contactId) => {
    if (!window.confirm('Are you sure you want to delete this contact?')) return;
    
    try {
      await api.delete(`/customers/${customerId}/contacts/${contactId}`);
      fetchContacts();
    } catch (error) {
      console.error('Error deleting contact:', error);
      alert(error.response?.data?.detail || 'Failed to delete contact');
    }
  };

  const openEditDialog = (contact) => {
    setSelectedContact(contact);
    setContactForm({
      name: contact.name || '',
      job_title: contact.job_title || '',
      role: contact.role || 'General',
      email: contact.email || '',
      phone: contact.phone || '',
      mobile: contact.mobile || '',
      is_primary: contact.is_primary || false,
      notes: contact.notes || ''
    });
    setIsEditDialogOpen(true);
  };

  const resetForm = () => {
    setContactForm({
      name: '',
      job_title: '',
      role: 'General',
      email: '',
      phone: '',
      mobile: '',
      is_primary: false,
      notes: ''
    });
    setSelectedContact(null);
  };

  const getRoleBadgeColor = (role) => {
    switch(role) {
      case 'Primary Contact': return 'bg-blue-100 text-blue-800';
      case 'Purchaser': return 'bg-green-100 text-green-800';
      case 'Accounts Payable': return 'bg-purple-100 text-purple-800';
      case 'Engineer': return 'bg-orange-100 text-orange-800';
      case 'Manager': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return <div className="text-center py-4">Loading contacts...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Contact Persons</h3>
        <Button
          size="sm"
          onClick={() => {
            resetForm();
            setIsAddDialogOpen(true);
          }}
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Contact
        </Button>
      </div>

      {contacts.length === 0 ? (
        <div className="text-center py-8 bg-slate-50 rounded-lg">
          <p className="text-slate-600">No contacts added yet</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-4"
            onClick={() => {
              resetForm();
              setIsAddDialogOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add First Contact
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Job Title</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Contact Info</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.map((contact) => (
                <TableRow key={contact.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {contact.is_primary && (
                        <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                      )}
                      <span className="font-medium">{contact.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>{contact.job_title || '-'}</TableCell>
                  <TableCell>
                    <Badge className={getRoleBadgeColor(contact.role)}>
                      {contact.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 text-sm">
                      {contact.email && (
                        <div className="flex items-center gap-1 text-slate-600">
                          <Mail className="w-3 h-3" />
                          {contact.email}
                        </div>
                      )}
                      {contact.phone && (
                        <div className="flex items-center gap-1 text-slate-600">
                          <Phone className="w-3 h-3" />
                          {contact.phone}
                        </div>
                      )}
                      {contact.mobile && (
                        <div className="flex items-center gap-1 text-slate-600">
                          <Smartphone className="w-3 h-3" />
                          {contact.mobile}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(contact)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteContact(contact.id)}
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add Contact Dialog */}
      <Dialog 
        open={isAddDialogOpen} 
        onOpenChange={setIsAddDialogOpen}
        modal={true}
      >
        <DialogContent 
          className="max-w-2xl" 
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Add New Contact</DialogTitle>
            <DialogDescription>
              Add a new contact person for this customer
            </DialogDescription>
          </DialogHeader>
          <ContactFormFields data={contactForm} onChange={handleContactInputChange} contactRoles={contactRoles} />
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsAddDialogOpen(false);
              resetForm();
            }}>
              Cancel
            </Button>
            <Button onClick={handleAddContact}>Add Contact</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Contact Dialog */}
      <Dialog 
        open={isEditDialogOpen} 
        onOpenChange={setIsEditDialogOpen}
        modal={true}
      >
        <DialogContent 
          className="max-w-2xl" 
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Edit Contact</DialogTitle>
            <DialogDescription>
              Update contact information
            </DialogDescription>
          </DialogHeader>
          <ContactFormFields data={contactForm} onChange={handleContactInputChange} contactRoles={contactRoles} />
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsEditDialogOpen(false);
              resetForm();
            }}>
              Cancel
            </Button>
            <Button onClick={handleEditContact}>Update Contact</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CustomerContacts;
