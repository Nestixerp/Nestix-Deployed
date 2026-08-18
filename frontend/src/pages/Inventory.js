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
import { Plus, Search, Package, TrendingDown, AlertTriangle, Edit, History, PlusCircle, MinusCircle, Loader2, Settings, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { toast } from '../hooks/use-toast';
import api from '../services/api';
import MaterialFormDialog from '../components/inventory/MaterialFormDialog';
import StockAdjustmentDialog from '../components/inventory/StockAdjustmentDialog';
import MaterialDetailDialog from '../components/inventory/MaterialDetailDialog';
import AddAttributeDialog from '../components/inventory/AddAttributeDialog';
import EditAttributeDialog from '../components/inventory/EditAttributeDialog';

// Sort icon component - outside main component to avoid re-renders
const SortIcon = ({ column, sortColumn, sortDirection }) => {
  if (sortColumn !== column) {
    return <ArrowUpDown className="inline w-3 h-3 ml-1 text-gray-400" />;
  }
  return sortDirection === 'asc' 
    ? <ArrowUp className="inline w-3 h-3 ml-1 text-blue-600" /> 
    : <ArrowDown className="inline w-3 h-3 ml-1 text-blue-600" />;
};

const Inventory = () => {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [isAddMaterialDialogOpen, setIsAddMaterialDialogOpen] = useState(false);
  const [isEditMaterialDialogOpen, setIsEditMaterialDialogOpen] = useState(false);
  const [isAdjustmentDialogOpen, setIsAdjustmentDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isAddAttributeDialogOpen, setIsAddAttributeDialogOpen] = useState(false);
  const [isEditAttributeDialogOpen, setIsEditAttributeDialogOpen] = useState(false);
  const [adjustmentType, setAdjustmentType] = useState('add');
  const [editAttributeType, setEditAttributeType] = useState('');
  
  // Sorting state
  const [sortColumn, setSortColumn] = useState(null); // 'name', 'thickness', 'grade', 'finish', 'sheets', 'size'
  const [sortDirection, setSortDirection] = useState('asc'); // 'asc' or 'desc'
  
  // Dropdown options - sorted alphabetically/numerically
  const [materialTypes, setMaterialTypes] = useState(['Aluminium', 'Galvanized Steel', 'Mild Steel', 'Stainless Steel']);
  const [grades, setGrades] = useState(['304', '316', '316L', '5005', 'HA3']);
  const [finishes, setFinishes] = useState(['2B', 'Anodised', 'Galv', 'Mill', 'P&O']);
  const [thicknesses, setThicknesses] = useState(['2mm', '3mm', '5mm', '6mm', '8mm', '10mm']);
  const [newAttributeType, setNewAttributeType] = useState('');
  
  // Filter states
  const [filterType, setFilterType] = useState('all');
  const [filterThickness, setFilterThickness] = useState('all');
  const [filterGrade, setFilterGrade] = useState('all');
  const [filterFinish, setFilterFinish] = useState('all');

  // Material form state
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

  useEffect(() => {
    fetchMaterials();
  }, []);

  const fetchMaterials = async () => {
    try {
      setLoading(true);
      const response = await api.get('/materials');
      // Sort materials alphabetically by material_type (name)
      const sortedMaterials = response.data.sort((a, b) => {
        const nameA = (a.material_type || a.name || '').toLowerCase();
        const nameB = (b.material_type || b.name || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });
      setMaterials(sortedMaterials);
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

  // Helper function to sort thickness values numerically
  const sortThicknesses = (thicknessArray) => {
    return thicknessArray.sort((a, b) => {
      const numA = parseFloat(a) || 0;
      const numB = parseFloat(b) || 0;
      return numA - numB;
    });
  };

  // Helper function to ensure thickness has 'mm' suffix
  const normalizeThickness = (thickness) => {
    if (!thickness) return thickness;
    const cleanValue = String(thickness).replace(/mm$/i, '').trim();
    return `${cleanValue}mm`;
  };

  const uniqueTypes = useMemo(() => {
    const types = [...new Set(materials.map(m => m.name))].filter(Boolean).sort((a, b) => a.localeCompare(b));
    return ['all', ...types];
  }, [materials]);
  
  const uniqueThicknesses = useMemo(() => {
    const thicknesses = [...new Set(materials.map(m => m.thickness))].filter(Boolean);
    return ['all', ...sortThicknesses(thicknesses)];
  }, [materials]);
  
  const uniqueGrades = useMemo(() => {
    const grades = [...new Set(materials.map(m => m.grade))].filter(Boolean).sort((a, b) => a.localeCompare(b));
    return ['all', ...grades];
  }, [materials]);
  
  const uniqueFinishes = useMemo(() => {
    const finishes = [...new Set(materials.map(m => m.finish))].filter(Boolean).sort((a, b) => a.localeCompare(b));
    return ['all', ...finishes];
  }, [materials]);

  // Handle column sort
  const handleSort = (column) => {
    if (sortColumn === column) {
      // Toggle direction if same column
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // New column, start with ascending
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const filteredMaterials = useMemo(() => {
    let result = materials.filter(material => {
      const matchesSearch = material.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          material.location.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = filterType === 'all' || material.name === filterType;
      const matchesThickness = filterThickness === 'all' || material.thickness === filterThickness;
      const matchesGrade = filterGrade === 'all' || material.grade === filterGrade;
      const matchesFinish = filterFinish === 'all' || material.finish === filterFinish;
      return matchesSearch && matchesType && matchesThickness && matchesGrade && matchesFinish;
    });

    // Apply sorting
    if (sortColumn) {
      result = [...result].sort((a, b) => {
        let comparison = 0;
        
        switch (sortColumn) {
          case 'name':
            comparison = (a.name || '').localeCompare(b.name || '');
            break;
          case 'thickness':
            // Extract numeric value for thickness sorting
            const thickA = parseFloat(a.thickness) || 0;
            const thickB = parseFloat(b.thickness) || 0;
            comparison = thickA - thickB;
            break;
          case 'grade':
            comparison = (a.grade || '').localeCompare(b.grade || '');
            break;
          case 'finish':
            comparison = (a.finish || '').localeCompare(b.finish || '');
            break;
          case 'sheets':
            comparison = (a.stock || 0) - (b.stock || 0);
            break;
          case 'size':
            // Sort by area (width x length)
            const areaA = (a.width || 0) * (a.length || 0);
            const areaB = (b.width || 0) * (b.length || 0);
            comparison = areaA - areaB;
            break;
          default:
            comparison = 0;
        }
        
        return sortDirection === 'asc' ? comparison : -comparison;
      });
    }

    return result;
  }, [materials, searchTerm, filterType, filterThickness, filterGrade, filterFinish, sortColumn, sortDirection]);

  const totalStock = filteredMaterials.reduce((sum, m) => sum + m.stock, 0);
  const lowStockCount = filteredMaterials.filter(m => m.stock <= m.reorder_level).length;
  const totalValue = filteredMaterials.reduce((sum, m) => sum + (m.stock * (m.selling_price || m.cost_average || 0)), 0);

  const handleEditMaterial = (material) => {
    setSelectedMaterial(material);
    setMaterialForm({
      name: material.name,
      type: material.type,
      grade: material.grade,
      finish: material.finish,
      thickness: material.thickness,
      weight_per_sheet: material.weight_per_sheet || 0,  // Provide default for old materials
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

  const handleUpdateMaterial = async () => {
    try {
      if (!materialForm.name || !materialForm.grade || !materialForm.finish || !materialForm.thickness || !materialForm.location || !materialForm.supplier) {
        toast({ title: 'Validation Error', description: 'Please fill in all required fields', variant: 'destructive' });
        return;
      }
      await api.put(`/materials/${selectedMaterial.id}`, materialForm);
      toast({ title: 'Material Updated', description: `${materialForm.name} has been updated successfully` });
      setIsEditMaterialDialogOpen(false);
      resetForm();
      await fetchMaterials();
    } catch (error) {
      console.error('Error updating material:', error);
      toast({ title: 'Error', description: error.response?.data?.detail || 'Failed to update material', variant: 'destructive' });
    }
  };

  const handleAddMaterial = async () => {
    try {
      if (!materialForm.name || !materialForm.grade || !materialForm.finish || !materialForm.thickness || !materialForm.location || !materialForm.supplier) {
        toast({ title: 'Validation Error', description: 'Please fill in all required fields', variant: 'destructive' });
        return;
      }
      await api.post('/materials', materialForm);
      toast({ title: 'Material Added', description: `${materialForm.name} has been added to inventory` });
      setIsAddMaterialDialogOpen(false);
      resetForm();
      await fetchMaterials();
    } catch (error) {
      console.error('Error adding material:', error);
      toast({ title: 'Error', description: error.response?.data?.detail || 'Failed to add material', variant: 'destructive' });
    }
  };

  const handleAddNewAttribute = (attributeType, value) => {
    if (!value.trim()) return;
    let normalizedValue = value.trim();
    
    // Auto-add 'mm' to thickness values if not present
    if (attributeType === 'thickness') {
      normalizedValue = normalizeThickness(normalizedValue);
    }
    
    switch(attributeType) {
      case 'name':
        if (!materialTypes.includes(normalizedValue)) {
          setMaterialTypes([...materialTypes, normalizedValue].sort((a, b) => a.localeCompare(b)));
        }
        break;
      case 'grade':
        if (!grades.includes(normalizedValue)) {
          setGrades([...grades, normalizedValue].sort((a, b) => a.localeCompare(b)));
        }
        break;
      case 'finish':
        if (!finishes.includes(normalizedValue)) {
          setFinishes([...finishes, normalizedValue].sort((a, b) => a.localeCompare(b)));
        }
        break;
      case 'thickness':
        if (!thicknesses.includes(normalizedValue)) {
          setThicknesses(sortThicknesses([...thicknesses, normalizedValue]));
        }
        break;
    }
    toast({ title: 'Option Added', description: `"${normalizedValue}" has been added to the list` });
  };

  const handleUpdateAttribute = (attributeType, index, newValue) => {
    switch(attributeType) {
      case 'name':
        const newTypes = [...materialTypes];
        newTypes[index] = newValue;
        setMaterialTypes(newTypes.sort((a, b) => a.localeCompare(b)));
        break;
      case 'grade':
        const newGrades = [...grades];
        newGrades[index] = newValue;
        setGrades(newGrades.sort((a, b) => a.localeCompare(b)));
        break;
      case 'finish':
        const newFinishes = [...finishes];
        newFinishes[index] = newValue;
        setFinishes(newFinishes.sort((a, b) => a.localeCompare(b)));
        break;
      case 'thickness':
        const newThicknesses = [...thicknesses];
        newThicknesses[index] = newValue;
        setThicknesses(sortThicknesses(newThicknesses));
        break;
    }
    toast({ title: 'Option Updated', description: `Option has been updated to "${newValue}"` });
  };

  const handleDeleteAttribute = (attributeType, index) => {
    switch(attributeType) {
      case 'name':
        setMaterialTypes(materialTypes.filter((_, i) => i !== index));
        break;
      case 'grade':
        setGrades(grades.filter((_, i) => i !== index));
        break;
      case 'finish':
        setFinishes(finishes.filter((_, i) => i !== index));
        break;
      case 'thickness':
        setThicknesses(thicknesses.filter((_, i) => i !== index));
        break;
    }
    toast({ title: 'Option Deleted', description: 'Option has been removed from the list' });
  };

  const openEditAttributeDialog = (type) => {
    setEditAttributeType(type);
    setIsEditAttributeDialogOpen(true);
  };

  const getAttributeValues = (type) => {
    switch(type) {
      case 'name': return materialTypes;
      case 'grade': return grades;
      case 'finish': return finishes;
      case 'thickness': return thicknesses;
      default: return [];
    }
  };

  const openAddAttributeDialog = (attributeType) => {
    setNewAttributeType(attributeType);
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
    setSortColumn(null);
    setSortDirection('asc');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Material Inventory</h1>
          <p className="text-slate-600 mt-2">Manage your steel and material stock</p>
        </div>
        <div className="flex gap-2">
          <div className="relative group">
            <Button variant="outline" className="gap-2">
              <Settings className="w-4 h-4" />
              Manage Options
            </Button>
            <div className="absolute right-0 mt-1 w-48 bg-white border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
              <div className="py-1">
                <button onClick={() => openEditAttributeDialog('name')} className="w-full px-4 py-2 text-left text-sm hover:bg-slate-100">Material Types</button>
                <button onClick={() => openEditAttributeDialog('thickness')} className="w-full px-4 py-2 text-left text-sm hover:bg-slate-100">Thicknesses</button>
                <button onClick={() => openEditAttributeDialog('grade')} className="w-full px-4 py-2 text-left text-sm hover:bg-slate-100">Grades</button>
                <button onClick={() => openEditAttributeDialog('finish')} className="w-full px-4 py-2 text-left text-sm hover:bg-slate-100">Finishes</button>
              </div>
            </div>
          </div>
          <Button className="bg-slate-900 hover:bg-slate-800" onClick={() => { resetForm(); setIsAddMaterialDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            Add Material
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm font-medium text-slate-600">Total Items</p><h3 className="text-2xl font-bold text-slate-900 mt-2">{filteredMaterials.length}</h3></div><div className="bg-blue-500 p-3 rounded-lg"><Package className="w-6 h-6 text-white" /></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm font-medium text-slate-600">Total Sheets</p><h3 className="text-2xl font-bold text-slate-900 mt-2">{totalStock.toLocaleString()}</h3></div><div className="bg-green-500 p-3 rounded-lg"><TrendingDown className="w-6 h-6 text-white" /></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm font-medium text-slate-600">Low Stock Items</p><h3 className="text-2xl font-bold text-red-600 mt-2">{lowStockCount}</h3></div><div className="bg-red-500 p-3 rounded-lg"><AlertTriangle className="w-6 h-6 text-white" /></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm font-medium text-slate-600">Total Value</p><h3 className="text-2xl font-bold text-slate-900 mt-2">${totalValue.toLocaleString(undefined, {maximumFractionDigits: 0})}</h3></div><div className="bg-purple-500 p-3 rounded-lg"><Package className="w-6 h-6 text-white" /></div></div></CardContent></Card>
      </div>

      {/* Filters */}
      <Card className="mb-6"><CardHeader><div className="flex items-center justify-between"><CardTitle className="text-base">Filter Materials</CardTitle><Button variant="ghost" size="sm" onClick={clearFilters}>Clear Filters</Button></div></CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-4">
            <div className="relative"><Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" /><Input placeholder="Search..." className="pl-10" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
            <Select value={filterType} onValueChange={setFilterType}><SelectTrigger><SelectValue placeholder="Material Type" /></SelectTrigger><SelectContent>{uniqueTypes.map(type => (<SelectItem key={type} value={type}>{type === 'all' ? 'All Types' : type}</SelectItem>))}</SelectContent></Select>
            <Select value={filterThickness} onValueChange={setFilterThickness}><SelectTrigger><SelectValue placeholder="Thickness" /></SelectTrigger><SelectContent>{uniqueThicknesses.map(thickness => (<SelectItem key={thickness} value={thickness}>{thickness === 'all' ? 'All Thicknesses' : thickness}</SelectItem>))}</SelectContent></Select>
            <Select value={filterGrade} onValueChange={setFilterGrade}><SelectTrigger><SelectValue placeholder="Grade" /></SelectTrigger><SelectContent>{uniqueGrades.map(grade => (<SelectItem key={grade} value={grade}>{grade === 'all' ? 'All Grades' : grade}</SelectItem>))}</SelectContent></Select>
            <Select value={filterFinish} onValueChange={setFilterFinish}><SelectTrigger><SelectValue placeholder="Finish" /></SelectTrigger><SelectContent>{uniqueFinishes.map(finish => (<SelectItem key={finish} value={finish}>{finish === 'all' ? 'All Finishes' : finish}</SelectItem>))}</SelectContent></Select>
          </div>
        </CardContent>
      </Card>

      {/* Materials Table */}
      <Card><CardHeader><CardTitle>Stock List ({filteredMaterials.length} items)</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead 
                  className="cursor-pointer hover:bg-slate-100 select-none" 
                  onClick={() => handleSort('name')}
                >
                  Material Type <SortIcon column="name" sortColumn={sortColumn} sortDirection={sortDirection} />
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-slate-100 select-none" 
                  onClick={() => handleSort('thickness')}
                >
                  Thickness <SortIcon column="thickness" sortColumn={sortColumn} sortDirection={sortDirection} />
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-slate-100 select-none" 
                  onClick={() => handleSort('grade')}
                >
                  Grade <SortIcon column="grade" sortColumn={sortColumn} sortDirection={sortDirection} />
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-slate-100 select-none" 
                  onClick={() => handleSort('finish')}
                >
                  Finish <SortIcon column="finish" sortColumn={sortColumn} sortDirection={sortDirection} />
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-slate-100 select-none" 
                  onClick={() => handleSort('size')}
                >
                  Dimensions <SortIcon column="size" sortColumn={sortColumn} sortDirection={sortDirection} />
                </TableHead>
                <TableHead>Weight/Sheet</TableHead>
                <TableHead>Location</TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-slate-100 select-none" 
                  onClick={() => handleSort('sheets')}
                >
                  Stock (Sheets) <SortIcon column="sheets" sortColumn={sortColumn} sortDirection={sortDirection} />
                </TableHead>
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
                  <TableCell className="font-medium text-sm">{material.weight_per_sheet ? `${material.weight_per_sheet} kg` : '-'}</TableCell>
                  <TableCell><span className="inline-block px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">{material.location}</span></TableCell>
                  <TableCell><div className={`inline-block px-3 py-1 rounded-full font-semibold ${getStockColor(material.stock, material.reorder_level)}`}>{material.stock.toLocaleString()}</div></TableCell>
                  <TableCell className="text-sm text-slate-600">{material.reorder_level}</TableCell>
                  <TableCell className="font-medium">${(material.selling_price || material.cost_average || 0).toFixed(2)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => handleEditMaterial(material)} title="Edit Material"><Edit className="w-4 h-4 text-blue-600" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => { setSelectedMaterial(material); setAdjustmentType('add'); setIsAdjustmentDialogOpen(true); }} title="Add Stock"><PlusCircle className="w-4 h-4 text-green-600" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => { setSelectedMaterial(material); setAdjustmentType('remove'); setIsAdjustmentDialogOpen(true); }} title="Remove Stock"><MinusCircle className="w-4 h-4 text-red-600" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => { setSelectedMaterial(material); setIsDetailDialogOpen(true); }} title="View Details"><History className="w-4 h-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <MaterialFormDialog
        open={isAddMaterialDialogOpen}
        onOpenChange={setIsAddMaterialDialogOpen}
        materialForm={materialForm}
        setMaterialForm={setMaterialForm}
        onSave={handleAddMaterial}
        materialTypes={materialTypes}
        grades={grades}
        finishes={finishes}
        thicknesses={thicknesses}
        onAddAttribute={openAddAttributeDialog}
        title="Add New Material"
        description="Add a new material to your inventory"
      />

      <MaterialFormDialog
        open={isEditMaterialDialogOpen}
        onOpenChange={setIsEditMaterialDialogOpen}
        materialForm={materialForm}
        setMaterialForm={setMaterialForm}
        onSave={handleUpdateMaterial}
        materialTypes={materialTypes}
        grades={grades}
        finishes={finishes}
        thicknesses={thicknesses}
        onAddAttribute={openAddAttributeDialog}
        title="Edit Material"
        description="Update material information"
      />

      <StockAdjustmentDialog
        open={isAdjustmentDialogOpen}
        onOpenChange={setIsAdjustmentDialogOpen}
        material={selectedMaterial}
        adjustmentType={adjustmentType}
        onSave={fetchMaterials}
      />

      <MaterialDetailDialog
        open={isDetailDialogOpen}
        onOpenChange={setIsDetailDialogOpen}
        material={selectedMaterial}
      />

      <AddAttributeDialog
        open={isAddAttributeDialogOpen}
        onOpenChange={setIsAddAttributeDialogOpen}
        attributeType={newAttributeType}
        onAdd={handleAddNewAttribute}
      />

      <EditAttributeDialog
        open={isEditAttributeDialogOpen}
        onOpenChange={setIsEditAttributeDialogOpen}
        attributeType={editAttributeType}
        values={getAttributeValues(editAttributeType)}
        onUpdate={handleUpdateAttribute}
        onDelete={handleDeleteAttribute}
      />
    </div>
  );
};

export default Inventory;