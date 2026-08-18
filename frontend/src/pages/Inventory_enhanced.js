import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Textarea } from '../components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Plus, Search, Package, TrendingDown, AlertTriangle, Edit, History, PlusCircle, MinusCircle, Loader2 } from 'lucide-react';
import { toast } from '../hooks/use-toast';
import api from '../services/api';

const Inventory = () => {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isAdjustmentDialogOpen, setIsAdjustmentDialogOpen] = useState(false);
  const [isAddMaterialDialogOpen, setIsAddMaterialDialogOpen] = useState(false);
  const [isEditMaterialDialogOpen, setIsEditMaterialDialogOpen] = useState(false);
  const [isAddAttributeDialogOpen, setIsAddAttributeDialogOpen] = useState(false);
  const [adjustmentType, setAdjustmentType] = useState('add');
  const [adjustmentQty, setAdjustmentQty] = useState('');
  const [adjustmentNote, setAdjustmentNote] = useState('');
  const [materialHistory, setMaterialHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  // Dropdown attribute options
  const [materialTypes, setMaterialTypes] = useState(['Mild Steel', 'Stainless Steel', 'Aluminium', 'Galvanized Steel']);
  const [grades, setGrades] = useState(['HA3', '304', '316', '316L', '5005']);
  const [finishes, setFinishes] = useState(['P&O', '2B', 'Galv', 'Mill', 'Anodised']);
  const [thicknesses, setThicknesses] = useState(['2mm', '3mm', '5mm', '6mm', '8mm', '10mm']);
  
  // Add new attribute state
  const [newAttributeType, setNewAttributeType] = useState('');
  const [newAttributeValue, setNewAttributeValue] = useState('');
  
  // Filter states
  const [filterType, setFilterType] = useState('all');
  const [filterThickness, setFilterThickness] = useState('all');
  const [filterGrade, setFilterGrade] = useState('all');
  const [filterFinish, setFilterFinish] = useState('all');

  // New/Edit material form state
  const [materialForm, setMaterialForm] = useState({
    name: '',
    type: 'Sheet',
    grade: '',
    finish: '',
    thickness: '',
    weight_per_sheet: '',
    stock: 0,
    location: '',
    width: 1220,
    length: 2440,
    supplier: '',
    reorder_level: 10,
    markup_percentage: 15.0
  });

  // Load materials on mount
  useEffect(() => {
    fetchMaterials();
  }, []);

  const fetchMaterials = async () => {
    try {
      setLoading(true);
      const response = await api.get('/materials');
      setMaterials(response.data);
    } catch (error) {
      console.error('Error fetching materials:', error);
      toast({
        title: 'Error',
        description: 'Failed to load materials',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchMaterialHistory = async (materialId) => {
    try {
      setLoadingHistory(true);
      const response = await api.get(`/materials/${materialId}/history`);
      setMaterialHistory(response.data);
    } catch (error) {
      console.error('Error fetching history:', error);
      toast({
        title: 'Error',
        description: 'Failed to load material history',
        variant: 'destructive'
      });
    } finally {
      setLoadingHistory(false);
    }
  };

  // Extract unique values for filters
  const uniqueTypes = useMemo(() => {
    return ['all', ...new Set(materials.map(m => m.name))];
  }, [materials]);

  const uniqueThicknesses = useMemo(() => {
    return ['all', ...new Set(materials.map(m => m.thickness))];
  }, [materials]);

  const uniqueGrades = useMemo(() => {
    return ['all', ...new Set(materials.map(m => m.grade))];
  }, [materials]);

  const uniqueFinishes = useMemo(() => {
    return ['all', ...new Set(materials.map(m => m.finish))];
  }, [materials]);

  // Apply filters
  const filteredMaterials = useMemo(() => {
    return materials.filter(material => {
      const matchesSearch = material.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          material.location.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = filterType === 'all' || material.name === filterType;
      const matchesThickness = filterThickness === 'all' || material.thickness === filterThickness;
      const matchesGrade = filterGrade === 'all' || material.grade === filterGrade;
      const matchesFinish = filterFinish === 'all' || material.finish === filterFinish;
      
      return matchesSearch && matchesType && matchesThickness && matchesGrade && matchesFinish;
    });
  }, [materials, searchTerm, filterType, filterThickness, filterGrade, filterFinish]);

  // Calculate totals
  const totalStock = filteredMaterials.reduce((sum, m) => sum + m.stock, 0);
  const lowStockCount = filteredMaterials.filter(m => m.stock <= m.reorder_level).length;
  const totalValue = filteredMaterials.reduce((sum, m) => sum + (m.stock * (m.selling_price || m.cost_average || 0)), 0);

  const handleViewMaterial = async (material) => {
    setSelectedMaterial(material);
    setIsDialogOpen(true);
    await fetchMaterialHistory(material.id);
  };

  const handleStockAdjustment = (material, type) => {
    setSelectedMaterial(material);
    setAdjustmentType(type);
    setAdjustmentQty('');
    setAdjustmentNote('');
    setIsAdjustmentDialogOpen(true);
  };

  const handleEditMaterial = (material) => {
    setSelectedMaterial(material);
    setMaterialForm({
      name: material.name,
      type: material.type,
      grade: material.grade,
      finish: material.finish,
      thickness: material.thickness,
      weight_per_sheet: material.weight_per_sheet,
      stock: material.stock,
      location: material.location,
      width: material.width,
      length: material.length,
      supplier: material.supplier,
      reorder_level: material.reorder_level,
      markup_percentage: material.markup_percentage
    });
    setIsEditMaterialDialogOpen(true);
  };

  const handleSaveAdjustment = async () => {
    const qty = parseInt(adjustmentQty);
    if (!qty || qty <= 0) return;

    try {
      await api.post('/materials/adjust-stock', {
        material_id: selectedMaterial.id,
        type: adjustmentType,
        quantity: qty,
        note: adjustmentNote || `${adjustmentType === 'add' ? 'Added' : 'Removed'} stock manually`,
        reference: 'Manual Adjustment'
      });

      toast({
        title: adjustmentType === 'add' ? 'Stock Added' : 'Stock Removed',
        description: `${qty} sheets ${adjustmentType === 'add' ? 'added to' : 'removed from'} ${selectedMaterial.name}`,
      });

      setIsAdjustmentDialogOpen(false);
      await fetchMaterials();
    } catch (error) {
      console.error('Error adjusting stock:', error);
      toast({
        title: 'Error',
        description: 'Failed to adjust stock',
        variant: 'destructive'
      });
    }
  };

  const handleAddMaterial = async () => {
    try {
      // Validate required fields
      if (!materialForm.name || !materialForm.grade || !materialForm.finish || !materialForm.thickness || !materialForm.location || !materialForm.supplier) {
        toast({
          title: 'Validation Error',
          description: 'Please fill in all required fields',
          variant: 'destructive'
        });
        return;
      }

      await api.post('/materials', materialForm);

      toast({
        title: 'Material Added',
        description: `${materialForm.name} has been added to inventory`,
      });

      setIsAddMaterialDialogOpen(false);
      resetForm();
      await fetchMaterials();
    } catch (error) {
      console.error('Error adding material:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.detail || 'Failed to add material',
        variant: 'destructive'
      });
    }
  };

  const handleUpdateMaterial = async () => {
    try {
      // Validate required fields
      if (!materialForm.name || !materialForm.grade || !materialForm.finish || !materialForm.thickness || !materialForm.location || !materialForm.supplier) {
        toast({
          title: 'Validation Error',
          description: 'Please fill in all required fields',
          variant: 'destructive'
        });
        return;
      }

      await api.put(`/materials/${selectedMaterial.id}`, materialForm);

      toast({
        title: 'Material Updated',
        description: `${materialForm.name} has been updated successfully`,
      });

      setIsEditMaterialDialogOpen(false);
      resetForm();
      await fetchMaterials();
    } catch (error) {
      console.error('Error updating material:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.detail || 'Failed to update material',
        variant: 'destructive'
      });
    }
  };

  const handleAddNewAttribute = async () => {
    if (!newAttributeValue.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Please enter a value',
        variant: 'destructive'
      });
      return;
    }

    // Add to local state immediately
    switch(newAttributeType) {
      case 'name':
        if (!materialTypes.includes(newAttributeValue)) {
          setMaterialTypes([...materialTypes, newAttributeValue]);
        }
        break;
      case 'grade':
        if (!grades.includes(newAttributeValue)) {
          setGrades([...grades, newAttributeValue]);
        }
        break;
      case 'finish':
        if (!finishes.includes(newAttributeValue)) {
          setFinishes([...finishes, newAttributeValue]);
        }
        break;
      case 'thickness':
        if (!thicknesses.includes(newAttributeValue)) {
          setThicknesses([...thicknesses, newAttributeValue]);
        }
        break;
    }

    toast({
      title: 'Option Added',
      description: `"${newAttributeValue}" has been added to the list`,
    });

    setIsAddAttributeDialogOpen(false);
    setNewAttributeValue('');
  };

  const openAddAttributeDialog = (attributeType) => {
    setNewAttributeType(attributeType);
    setNewAttributeValue('');
    setIsAddAttributeDialogOpen(true);
  };

  const resetForm = () => {
    setMaterialForm({
      name: '',
      type: 'Sheet',
      grade: '',
      finish: '',
      thickness: '',
      weight_per_sheet: '',
      stock: 0,
      location: '',
      width: 1220,
      length: 2440,
      supplier: '',
      reorder_level: 10,
      markup_percentage: 15.0
    });
  };

  const getStockColor = (stock, reorderLevel) => {
    if (stock <= reorderLevel) return 'text-red-600 bg-red-50';
    if (stock <= reorderLevel * 1.5) return 'text-orange-600 bg-orange-50';
    return 'text-green-600 bg-green-50';
  };

  const clearFilters = () => {
    setFilterType('all');
    setFilterThickness('all');
    setFilterGrade('all');
    setFilterFinish('all');
    setSearchTerm('');
  };

  const getAttributeLabel = (type) => {
    const labels = {
      'name': 'Material Type',
      'grade': 'Grade',
      'finish': 'Finish',
      'thickness': 'Thickness'
    };
    return labels[type] || type;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // Material Form Component (reusable for Add and Edit)
  const MaterialFormFields = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Material Type *</Label>
          <div className="flex gap-2">
            <Select 
              value={materialForm.name} 
              onValueChange={(value) => {
                if (value === '__add_new__') {
                  openAddAttributeDialog('name');
                } else {
                  setMaterialForm({...materialForm, name: value});
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {materialTypes.map(type => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
                <SelectItem value="__add_new__">
                  <span className="text-blue-600 font-semibold">+ Add New Type</span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>Form Type</Label>
          <Select 
            value={materialForm.type} 
            onValueChange={(value) => setMaterialForm({...materialForm, type: value})}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Sheet">Sheet</SelectItem>
              <SelectItem value="Plate">Plate</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label>Grade *</Label>
          <Select 
            value={materialForm.grade} 
            onValueChange={(value) => {
              if (value === '__add_new__') {
                openAddAttributeDialog('grade');
              } else {
                setMaterialForm({...materialForm, grade: value});
              }
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select grade" />
            </SelectTrigger>
            <SelectContent>
              {grades.map(grade => (
                <SelectItem key={grade} value={grade}>{grade}</SelectItem>
              ))}
              <SelectItem value="__add_new__">
                <span className="text-blue-600 font-semibold">+ Add New Grade</span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Finish *</Label>
          <Select 
            value={materialForm.finish} 
            onValueChange={(value) => {
              if (value === '__add_new__') {
                openAddAttributeDialog('finish');
              } else {
                setMaterialForm({...materialForm, finish: value});
              }
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select finish" />
            </SelectTrigger>
            <SelectContent>
              {finishes.map(finish => (
                <SelectItem key={finish} value={finish}>{finish}</SelectItem>
              ))}
              <SelectItem value="__add_new__">
                <span className="text-blue-600 font-semibold">+ Add New Finish</span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Thickness *</Label>
          <Select 
            value={materialForm.thickness} 
            onValueChange={(value) => {
              if (value === '__add_new__') {
                openAddAttributeDialog('thickness');
              } else {
                setMaterialForm({...materialForm, thickness: value});
              }
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select thickness" />
            </SelectTrigger>
            <SelectContent>
              {thicknesses.map(thickness => (
                <SelectItem key={thickness} value={thickness}>{thickness}</SelectItem>
              ))}
              <SelectItem value="__add_new__">
                <span className="text-blue-600 font-semibold">+ Add New Thickness</span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label>Width (mm)</Label>
          <Input
            type="number"
            value={materialForm.width}
            onChange={(e) => setMaterialForm({...materialForm, width: parseInt(e.target.value)})}
          />
        </div>
        <div>
          <Label>Length (mm)</Label>
          <Input
            type="number"
            value={materialForm.length}
            onChange={(e) => setMaterialForm({...materialForm, length: parseInt(e.target.value)})}
          />
        </div>
        <div>
          <Label>Weight/Sheet (kg) *</Label>
          <Input
            type="number"
            step="0.01"
            placeholder="e.g., 74.48"
            value={materialForm.weight_per_sheet}
            onChange={(e) => setMaterialForm({...materialForm, weight_per_sheet: parseFloat(e.target.value)})}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label>Initial Stock (Sheets)</Label>
          <Input
            type="number"
            value={materialForm.stock}
            onChange={(e) => setMaterialForm({...materialForm, stock: parseInt(e.target.value)})}
          />
        </div>
        <div>
          <Label>Reorder Level</Label>
          <Input
            type="number"
            value={materialForm.reorder_level}
            onChange={(e) => setMaterialForm({...materialForm, reorder_level: parseInt(e.target.value)})}
          />
        </div>
        <div>
          <Label>Markup %</Label>
          <Input
            type="number"
            step="0.1"
            value={materialForm.markup_percentage}
            onChange={(e) => setMaterialForm({...materialForm, markup_percentage: parseFloat(e.target.value)})}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Location (Rack) *</Label>
          <Input
            placeholder="e.g., Rack A-12"
            value={materialForm.location}
            onChange={(e) => setMaterialForm({...materialForm, location: e.target.value})}
          />
        </div>
        <div>
          <Label>Supplier *</Label>
          <Input
            placeholder="e.g., Impact Steel"
            value={materialForm.supplier}
            onChange={(e) => setMaterialForm({...materialForm, supplier: e.target.value})}
          />
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Material Inventory</h1>
          <p className="text-slate-600 mt-2">Manage your steel and material stock</p>
        </div>
        <Button 
          className="bg-slate-900 hover:bg-slate-800"
          onClick={() => {
            resetForm();
            setIsAddMaterialDialogOpen(true);
          }}
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Material
        </Button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Total Items</p>
                <h3 className="text-2xl font-bold text-slate-900 mt-2">{filteredMaterials.length}</h3>
              </div>
              <div className="bg-blue-500 p-3 rounded-lg">
                <Package className="w-6 h-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Total Sheets</p>
                <h3 className="text-2xl font-bold text-slate-900 mt-2">{totalStock.toLocaleString()}</h3>
              </div>
              <div className="bg-green-500 p-3 rounded-lg">
                <TrendingDown className="w-6 h-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Low Stock Items</p>
                <h3 className="text-2xl font-bold text-red-600 mt-2">{lowStockCount}</h3>
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
                <p className="text-sm font-medium text-slate-600">Total Value</p>
                <h3 className="text-2xl font-bold text-slate-900 mt-2">${totalValue.toLocaleString(undefined, {maximumFractionDigits: 0})}</h3>
              </div>
              <div className="bg-purple-500 p-3 rounded-lg">
                <Package className="w-6 h-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Filter Materials</CardTitle>
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear Filters
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                placeholder="Search..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger>
                  <SelectValue placeholder="Material Type" />
                </SelectTrigger>
                <SelectContent>
                  {uniqueTypes.map(type => (
                    <SelectItem key={type} value={type}>
                      {type === 'all' ? 'All Types' : type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Select value={filterThickness} onValueChange={setFilterThickness}>
                <SelectTrigger>
                  <SelectValue placeholder="Thickness" />
                </SelectTrigger>
                <SelectContent>
                  {uniqueThicknesses.map(thickness => (
                    <SelectItem key={thickness} value={thickness}>
                      {thickness === 'all' ? 'All Thicknesses' : thickness}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Select value={filterGrade} onValueChange={setFilterGrade}>
                <SelectTrigger>
                  <SelectValue placeholder="Grade" />
                </SelectTrigger>
                <SelectContent>
                  {uniqueGrades.map(grade => (
                    <SelectItem key={grade} value={grade}>
                      {grade === 'all' ? 'All Grades' : grade}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Select value={filterFinish} onValueChange={setFilterFinish}>
                <SelectTrigger>
                  <SelectValue placeholder="Finish" />
                </SelectTrigger>
                <SelectContent>
                  {uniqueFinishes.map(finish => (
                    <SelectItem key={finish} value={finish}>
                      {finish === 'all' ? 'All Finishes' : finish}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Materials Table */}
      <Card>
        <CardHeader>
          <CardTitle>Stock List ({filteredMaterials.length} items)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Material Type</TableHead>
                <TableHead>Thickness</TableHead>
                <TableHead>Grade</TableHead>
                <TableHead>Finish</TableHead>
                <TableHead>Dimensions</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Stock (Sheets)</TableHead>
                <TableHead>Reorder Level</TableHead>
                <TableHead>Selling Price</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMaterials.map((material) => (
                <TableRow key={material.id} className="cursor-pointer hover:bg-slate-50">
                  <TableCell className="font-medium">{material.name}</TableCell>
                  <TableCell>{material.thickness}</TableCell>
                  <TableCell>{material.grade}</TableCell>
                  <TableCell>{material.finish}</TableCell>
                  <TableCell className="text-sm">{material.width}×{material.length}mm</TableCell>
                  <TableCell>
                    <span className="inline-block px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                      {material.location}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className={`inline-block px-3 py-1 rounded-full font-semibold ${getStockColor(material.stock, material.reorder_level)}`}>
                      {material.stock.toLocaleString()}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">{material.reorder_level}</TableCell>
                  <TableCell className="font-medium">
                    ${(material.selling_price || material.cost_average || 0).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditMaterial(material)}
                        title="Edit Material"
                      >
                        <Edit className="w-4 h-4 text-blue-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleStockAdjustment(material, 'add')}
                        title="Add Stock"
                      >
                        <PlusCircle className="w-4 h-4 text-green-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleStockAdjustment(material, 'remove')}
                        title="Remove Stock"
                      >
                        <MinusCircle className="w-4 h-4 text-red-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewMaterial(material)}
                        title="View Details"
                      >
                        <History className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add Material Dialog */}
      <Dialog open={isAddMaterialDialogOpen} onOpenChange={setIsAddMaterialDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Material</DialogTitle>
            <DialogDescription>Add a new material to your inventory</DialogDescription>
          </DialogHeader>
          <MaterialFormFields />
          <div className="flex gap-2 pt-4">
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={() => setIsAddMaterialDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button 
              className="flex-1 bg-slate-900 hover:bg-slate-800"
              onClick={handleAddMaterial}
            >
              Add Material
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Material Dialog */}
      <Dialog open={isEditMaterialDialogOpen} onOpenChange={setIsEditMaterialDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Material</DialogTitle>
            <DialogDescription>Update material information</DialogDescription>
          </DialogHeader>
          <MaterialFormFields />
          <div className="flex gap-2 pt-4">
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={() => setIsEditMaterialDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button 
              className="flex-1 bg-slate-900 hover:bg-slate-800"
              onClick={handleUpdateMaterial}
            >
              Update Material
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add New Attribute Dialog */}
      <Dialog open={isAddAttributeDialogOpen} onOpenChange={setIsAddAttributeDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New {getAttributeLabel(newAttributeType)}</DialogTitle>
            <DialogDescription>
              Add a new option to the {getAttributeLabel(newAttributeType)} dropdown
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{getAttributeLabel(newAttributeType)} Value</Label>
              <Input
                placeholder={`e.g., ${newAttributeType === 'thickness' ? '12mm' : 'New Value'}`}
                value={newAttributeValue}
                onChange={(e) => setNewAttributeValue(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleAddNewAttribute();
                  }
                }}
              />
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={() => setIsAddAttributeDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button 
                className="flex-1 bg-blue-600 hover:bg-blue-700"
                onClick={handleAddNewAttribute}
              >
                Add Option
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Stock Adjustment Dialog */}
      <Dialog open={isAdjustmentDialogOpen} onOpenChange={setIsAdjustmentDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{adjustmentType === 'add' ? 'Add Stock' : 'Remove Stock'}</DialogTitle>
            <DialogDescription>
              {adjustmentType === 'add' ? 'Add sheets to inventory' : 'Remove sheets from inventory'}
            </DialogDescription>
          </DialogHeader>
          {selectedMaterial && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 rounded-lg">
                <p className="font-semibold text-slate-900">{selectedMaterial.name}</p>
                <p className="text-sm text-slate-600">{selectedMaterial.thickness} - {selectedMaterial.grade} - {selectedMaterial.finish}</p>
                <p className="text-sm text-slate-600 mt-2">Current Stock: <span className="font-bold">{selectedMaterial.stock} sheets</span></p>
              </div>

              <div>
                <Label>Quantity (Sheets)</Label>
                <Input
                  type="number"
                  min="1"
                  value={adjustmentQty}
                  onChange={(e) => setAdjustmentQty(e.target.value)}
                  placeholder="Enter quantity"
                  className="mt-1"
                />
              </div>

              <div>
                <Label>Note (Optional)</Label>
                <Textarea
                  value={adjustmentNote}
                  onChange={(e) => setAdjustmentNote(e.target.value)}
                  placeholder="e.g., Purchase Order #1205, Job Q-786398, Stock Count Adjustment"
                  className="mt-1"
                  rows={3}
                />
              </div>

              {adjustmentQty && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    New Stock: <span className="font-bold">
                      {adjustmentType === 'add' 
                        ? selectedMaterial.stock + parseInt(adjustmentQty)
                        : Math.max(0, selectedMaterial.stock - parseInt(adjustmentQty))
                      } sheets
                    </span>
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => setIsAdjustmentDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  className={`flex-1 ${adjustmentType === 'add' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
                  onClick={handleSaveAdjustment}
                  disabled={!adjustmentQty || parseInt(adjustmentQty) <= 0}
                >
                  {adjustmentType === 'add' ? 'Add Stock' : 'Remove Stock'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Material Detail Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Material Details & History</DialogTitle>
            <DialogDescription>View stock levels and transaction history</DialogDescription>
          </DialogHeader>
          {selectedMaterial && (
            <Tabs defaultValue="details" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="history">Transaction History</TabsTrigger>
              </TabsList>
              
              <TabsContent value="details" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Material Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <Label className="text-xs text-slate-600">Material Type</Label>
                        <p className="font-medium">{selectedMaterial.name}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-slate-600">Thickness</Label>
                        <p className="font-medium">{selectedMaterial.thickness}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-slate-600">Grade</Label>
                        <p className="font-medium">{selectedMaterial.grade}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-slate-600">Finish</Label>
                        <p className="font-medium">{selectedMaterial.finish}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-slate-600">Dimensions</Label>
                        <p className="font-medium">{selectedMaterial.width}mm × {selectedMaterial.length}mm</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Stock & Pricing</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <Label className="text-xs text-slate-600">Current Stock</Label>
                        <p className="text-2xl font-bold text-slate-900">{selectedMaterial.stock.toLocaleString()} Sheets</p>
                      </div>
                      <div>
                        <Label className="text-xs text-slate-600">Reorder Level</Label>
                        <p className="font-medium">{selectedMaterial.reorder_level} Sheets</p>
                      </div>
                      <div>
                        <Label className="text-xs text-slate-600">Location</Label>
                        <p className="font-medium">{selectedMaterial.location}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-slate-600">Supplier</Label>
                        <p className="font-medium">{selectedMaterial.supplier}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-slate-600">Cost Average</Label>
                        <p className="text-lg font-semibold text-blue-600">
                          ${(selectedMaterial.cost_average || 0).toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs text-slate-600">Selling Price (with {selectedMaterial.markup_percentage}% markup)</Label>
                        <p className="text-xl font-semibold text-green-600">
                          ${(selectedMaterial.selling_price || 0).toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs text-slate-600">Weight per Sheet</Label>
                        <p className="font-medium">{selectedMaterial.weight_per_sheet.toFixed(2)} kg</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Stock Status</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <div className="h-4 bg-slate-200 rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${selectedMaterial.stock <= selectedMaterial.reorder_level ? 'bg-red-500' : selectedMaterial.stock <= selectedMaterial.reorder_level * 1.5 ? 'bg-orange-500' : 'bg-green-500'}`}
                            style={{width: `${Math.min((selectedMaterial.stock / (selectedMaterial.reorder_level * 2)) * 100, 100)}%`}}
                          ></div>
                        </div>
                      </div>
                      <div className="text-sm font-medium">
                        {selectedMaterial.stock <= selectedMaterial.reorder_level ? (
                          <span className="text-red-600">⚠️ Low Stock - Reorder Now</span>
                        ) : selectedMaterial.stock <= selectedMaterial.reorder_level * 1.5 ? (
                          <span className="text-orange-600">⚠️ Stock Running Low</span>
                        ) : (
                          <span className="text-green-600">✓ Stock Healthy</span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="history" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Transaction History</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {loadingHistory ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                      </div>
                    ) : materialHistory.length === 0 ? (
                      <p className="text-center text-slate-500 py-8">No transactions recorded yet</p>
                    ) : (
                      <div className="space-y-3">
                        {materialHistory.map((transaction, i) => (
                          <div key={i} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:border-slate-300 transition-colors">
                            <div>
                              <p className="font-medium">{transaction.type}</p>
                              <p className="text-sm text-slate-600">{transaction.reference || transaction.note}</p>
                              <p className="text-xs text-slate-500">
                                {new Date(transaction.created_at).toLocaleDateString()} • {transaction.user}
                              </p>
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
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Inventory;
