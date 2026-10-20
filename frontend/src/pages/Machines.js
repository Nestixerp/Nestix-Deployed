import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { Cpu, Plus, Edit, Trash2, Search, AlertCircle } from 'lucide-react';
import api from '../services/api';
import { ToolingLibrary } from '../components/ToolingLibrary';
import { MachineWorkload } from '../components/MachineWorkload';
import { ToolingUsage } from '../components/ToolingUsage';

const Machines = () => {
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [formData, setFormData] = useState({
    machine_name: '',
    machine_number: '',
    machine_type: '',
    tooling_system: '',
    status: 'Active',
    notes: ''
  });

  useEffect(() => {
    fetchMachines();
  }, []);

  const fetchMachines = async () => {
    try {
      setLoading(true);
      const response = await api.get('/machines');
      setMachines(response.data);
    } catch (error) {
      console.error('Error fetching machines:', error);
      alert('Failed to fetch machines: ' + (error.response?.data?.detail || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateMachine = async () => {
    if (!formData.machine_name.trim()) {
      alert('Please enter a machine name');
      return;
    }

    try {
      await api.post('/machines', formData);
      setCreateDialogOpen(false);
      resetForm();
      fetchMachines();
      alert('Machine created successfully!');
    } catch (error) {
      console.error('Error creating machine:', error);
      alert('Failed to create machine: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleEditMachine = async () => {
    if (!formData.machine_name.trim()) {
      alert('Please enter a machine name');
      return;
    }

    try {
      await api.put(`/machines/${selectedMachine.id}`, formData);
      setEditDialogOpen(false);
      setSelectedMachine(null);
      resetForm();
      fetchMachines();
      alert('Machine updated successfully!');
    } catch (error) {
      console.error('Error updating machine:', error);
      alert('Failed to update machine: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleDeleteMachine = async () => {
    try {
      await api.delete(`/machines/${selectedMachine.id}`);
      setDeleteDialogOpen(false);
      setSelectedMachine(null);
      fetchMachines();
      alert('Machine deleted successfully!');
    } catch (error) {
      console.error('Error deleting machine:', error);
      alert('Failed to delete machine: ' + (error.response?.data?.detail || error.message));
    }
  };

  const openEditDialog = (machine) => {
    setSelectedMachine(machine);
    setFormData({
      machine_name: machine.machine_name || '',
      machine_number: machine.machine_number || '',
      machine_type: machine.machine_type || '',
      tooling_system: machine.tooling_system || '',
      status: machine.status || 'Active',
      notes: machine.notes || ''
    });
    setEditDialogOpen(true);
  };

  const openDeleteDialog = (machine) => {
    setSelectedMachine(machine);
    setDeleteDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      machine_name: '',
      machine_number: '',
      machine_type: '',
      tooling_system: '',
      status: 'Active',
      notes: ''
    });
  };

  const getStatusBadge = (status) => {
    const colors = {
      'Active': 'bg-green-100 text-green-800 border-green-300',
      'Inactive': 'bg-slate-100 text-slate-800 border-slate-300',
      'Maintenance': 'bg-amber-100 text-amber-800 border-amber-300'
    };
    return colors[status] || colors['Active'];
  };

  const filteredMachines = machines.filter(machine => {
    const searchLower = searchTerm.toLowerCase();
    return (
      machine.machine_name?.toLowerCase().includes(searchLower) ||
      machine.machine_number?.toLowerCase().includes(searchLower) ||
      machine.machine_type?.toLowerCase().includes(searchLower)
    );
  });

  if (loading) {
    return <div className="p-8">Loading machines...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Cpu className="w-6 h-6 text-blue-600" />
              Machine Management
            </span>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Machine
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search machines..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Machines Table */}
          {filteredMachines.length === 0 ? (
            <div className="text-center py-12">
              <Cpu className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 text-lg">
                {searchTerm ? 'No machines found matching your search' : 'No machines added yet'}
              </p>
              {!searchTerm && (
                <Button onClick={() => setCreateDialogOpen(true)} className="mt-4">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Your First Machine
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Machine Name</TableHead>
                  <TableHead>Machine Number</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMachines.map((machine) => (
                  <TableRow key={machine.id}>
                    <TableCell className="font-semibold">{machine.machine_name}</TableCell>
                    <TableCell>{machine.machine_number || '-'}</TableCell>
                    <TableCell>{machine.machine_type || '-'}</TableCell>
                    <TableCell>
                      <Badge className={`${getStatusBadge(machine.status)} border`}>
                        {machine.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{machine.notes || '-'}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(machine)}
                          className="text-blue-600 hover:text-blue-700"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDeleteDialog(machine)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Press Brake Workload */}
      <MachineWorkload />

      {/* Press Brake Tooling Library */}
      <ToolingLibrary />

      {/* Tooling Usage Report */}
      <ToolingUsage />

      {/* Create Machine Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add New Machine</DialogTitle>
            <DialogDescription>
              Add a machine to your production floor for job scheduling
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="machine-name">Machine Name *</Label>
              <Input
                id="machine-name"
                placeholder="e.g., Press Brake 1"
                value={formData.machine_name}
                onChange={(e) => setFormData({ ...formData, machine_name: e.target.value })}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="machine-number">Machine Number</Label>
              <Input
                id="machine-number"
                placeholder="e.g., MB-001"
                value={formData.machine_number}
                onChange={(e) => setFormData({ ...formData, machine_number: e.target.value })}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="machine-type">Machine Type</Label>
              <Input
                id="machine-type"
                placeholder="e.g., Press Brake, Laser Cutter, CNC"
                value={formData.machine_type}
                onChange={(e) => setFormData({ ...formData, machine_type: e.target.value })}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="tooling-system">Tooling System (Press Brakes)</Label>
              <select
                id="tooling-system"
                data-testid="machine-tooling-system-select"
                className="w-full p-2 border rounded-md"
                value={formData.tooling_system}
                onChange={(e) => setFormData({ ...formData, tooling_system: e.target.value })}
              >
                <option value="">None</option>
                <option value="Wila">Wila</option>
                <option value="Euro">Euro</option>
              </select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                className="w-full p-2 border rounded-md"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Maintenance">Maintenance</option>
              </select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Additional information about this machine"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateDialogOpen(false); resetForm(); }}>
              Cancel
            </Button>
            <Button onClick={handleCreateMachine}>Create Machine</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Machine Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Machine</DialogTitle>
            <DialogDescription>
              Update machine information
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-machine-name">Machine Name *</Label>
              <Input
                id="edit-machine-name"
                value={formData.machine_name}
                onChange={(e) => setFormData({ ...formData, machine_name: e.target.value })}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-machine-number">Machine Number</Label>
              <Input
                id="edit-machine-number"
                value={formData.machine_number}
                onChange={(e) => setFormData({ ...formData, machine_number: e.target.value })}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-machine-type">Machine Type</Label>
              <Input
                id="edit-machine-type"
                value={formData.machine_type}
                onChange={(e) => setFormData({ ...formData, machine_type: e.target.value })}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-tooling-system">Tooling System (Press Brakes)</Label>
              <select
                id="edit-tooling-system"
                data-testid="edit-machine-tooling-system-select"
                className="w-full p-2 border rounded-md"
                value={formData.tooling_system}
                onChange={(e) => setFormData({ ...formData, tooling_system: e.target.value })}
              >
                <option value="">None</option>
                <option value="Wila">Wila</option>
                <option value="Euro">Euro</option>
              </select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-status">Status</Label>
              <select
                id="edit-status"
                className="w-full p-2 border rounded-md"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Maintenance">Maintenance</option>
              </select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditDialogOpen(false); setSelectedMachine(null); resetForm(); }}>
              Cancel
            </Button>
            <Button onClick={handleEditMachine}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600" />
              Delete Machine?
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{selectedMachine?.machine_name}</strong>? 
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteDialogOpen(false); setSelectedMachine(null); }}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteMachine}>
              Delete Machine
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Machines;
