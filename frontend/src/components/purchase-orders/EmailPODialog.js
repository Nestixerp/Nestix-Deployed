import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Textarea } from '../ui/textarea';
import { Mail } from 'lucide-react';

const EmailPODialog = ({ open, onOpenChange, po, supplierContacts, onSend }) => {
  const [selectedContact, setSelectedContact] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');

  React.useEffect(() => {
    if (po) {
      setEmailSubject(`Purchase Order ${po.po_number}`);
      const deliveryDate = new Date(po.expected_delivery_date).toLocaleDateString('en-AU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
      setEmailMessage(`Dear Supplier,\n\nPlease find attached Purchase Order ${po.po_number} for your review.\n\nExpected Delivery Date: ${deliveryDate}\n\nTotal Amount: $${po.total.toFixed(2)}\n\nPlease confirm receipt and expected delivery.\n\nBest regards,\nNestix Team`);
    }
  }, [po]);

  const handleSend = () => {
    if (!selectedContact) {
      alert('Please select a contact person');
      return;
    }

    const contact = supplierContacts.find(c => c.id === selectedContact);
    onSend({
      contact_email: contact.email,
      contact_name: contact.name,
      subject: emailSubject,
      message: emailMessage,
      po_id: po.id
    });
    
    onOpenChange(false);
  };

  if (!po) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Mail className="h-5 w-5 mr-2" />
            Email Purchase Order
          </DialogTitle>
          <DialogDescription>
            Send {po.po_number} to {po.supplier_name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Select Contact Person *</Label>
            {supplierContacts.length === 0 ? (
              <div className="bg-yellow-50 border border-yellow-200 p-3 rounded text-sm">
                <p className="text-yellow-800 font-medium mb-2">⚠️ No contacts found for this supplier</p>
                <p className="text-yellow-700">
                  Please add a contact for <strong>{po.supplier_name}</strong> in the Suppliers module before sending emails.
                </p>
                <p className="text-yellow-700 mt-2">
                  Go to: <strong>Suppliers → {po.supplier_name} → Add Contact</strong>
                </p>
              </div>
            ) : (
              <Select value={selectedContact} onValueChange={setSelectedContact}>
                <SelectTrigger>
                  <SelectValue placeholder="Select contact" />
                </SelectTrigger>
                <SelectContent>
                  {supplierContacts.map(contact => (
                    <SelectItem key={contact.id} value={contact.id}>
                      {contact.name} ({contact.email}) - {contact.role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div>
            <Label>Subject</Label>
            <input
              type="text"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>

          <div>
            <Label>Message</Label>
            <Textarea
              value={emailMessage}
              onChange={(e) => setEmailMessage(e.target.value)}
              rows={8}
            />
          </div>

          <div className="bg-slate-50 p-3 rounded text-sm">
            <p className="font-medium mb-2">PO Summary:</p>
            <div className="space-y-1 text-slate-700">
              <div className="flex justify-between">
                <span>PO Number:</span>
                <span className="font-medium">{po.po_number}</span>
              </div>
              <div className="flex justify-between">
                <span>Items:</span>
                <span className="font-medium">{po.line_items.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Total:</span>
                <span className="font-medium">${po.total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              className="flex-1 bg-slate-900 hover:bg-slate-800" 
              onClick={handleSend}
              disabled={supplierContacts.length === 0}
            >
              <Mail className="h-4 w-4 mr-2" />
              Send Email
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EmailPODialog;
