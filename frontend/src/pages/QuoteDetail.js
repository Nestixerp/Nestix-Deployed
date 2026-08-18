import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { ArrowLeft, Plus, Trash2, Calculator, FileText, Save, ClipboardList } from 'lucide-react';
import { toast } from '../hooks/use-toast';
import { mockCustomers, mockProcesses } from '../mock/mockData';
import { materialsAPI } from '../services/api';

const QuoteDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'new';

  const [quoteData, setQuoteData] = useState({
    customer: '',
    contactPerson: '',
    partDescription: '',
    itemRef: '',
    material: {
      type: '',
      thickness: '',
      grade: '',
      finish: '',
      sheetCost: '',
      usage: '',
      calculatedMaterialCost: '0.00',
      sheetWeight: '',
      sheetSize: ''
    },
    geometry: {
      length: '',
      width: '',
      diameter: '',
      pierceCount: '',
      totalPerimeter: '',
      totalArea: '',
      partsPerSheet: ''
    },
    sellingPrice: '',
    buyingCost: '',
    markup: '',
    processes: []
  });

  const [processes, setProcesses] = useState([]);
  const [availableMaterials, setAvailableMaterials] = useState([]);
  const [loadingMaterials, setLoadingMaterials] = useState(true);
  const [selectedMaterialId, setSelectedMaterialId] = useState('');
  
  // Material filter states
  const [materialGrade, setMaterialGrade] = useState('');
  const [materialType, setMaterialType] = useState('');
  const [materialFinish, setMaterialFinish] = useState('');
  const [materialSize, setMaterialSize] = useState('');
  
  // Filtered options for cascading dropdowns
  const [availableGrades, setAvailableGrades] = useState([]);
  const [availableTypes, setAvailableTypes] = useState([]);
  const [availableFinishes, setAvailableFinishes] = useState([]);
  const [availableSizes, setAvailableSizes] = useState([]);
  const [filteredMaterials, setFilteredMaterials] = useState([]);

  // Load materials from backend on mount
  useEffect(() => {
    const loadMaterials = async () => {
      try {
        const materials = await materialsAPI.getForQuoting();
        setAvailableMaterials(materials);
        
        // Extract unique values for dropdowns
        const grades = [...new Set(materials.map(m => m.grade))];
        const types = [...new Set(materials.map(m => m.name))];
        const finishes = [...new Set(materials.map(m => m.finish))];
        const sizes = [...new Set(materials.map(m => m.thickness))];
        
        setAvailableGrades(grades.sort());
        setAvailableTypes(types.sort());
        setAvailableFinishes(finishes.sort());
        setAvailableSizes(sizes.sort());
      } catch (error) {
        console.error('Error loading materials:', error);
        toast({
          title: "Error",
          description: "Failed to load materials from inventory",
          variant: "destructive"
        });
      } finally {
        setLoadingMaterials(false);
      }
    };
    
    loadMaterials();
  }, []);

  // Filter materials based on selected criteria
  useEffect(() => {
    let filtered = availableMaterials;
    
    if (materialGrade) {
      filtered = filtered.filter(m => m.grade === materialGrade);
    }
    if (materialType) {
      filtered = filtered.filter(m => m.name === materialType);
    }
    if (materialFinish) {
      filtered = filtered.filter(m => m.finish === materialFinish);
    }
    if (materialSize) {
      filtered = filtered.filter(m => m.thickness === materialSize);
    }
    
    setFilteredMaterials(filtered);
    
    // If only one material matches all criteria, auto-select it
    if (filtered.length === 1 && materialGrade && materialType && materialFinish && materialSize) {
      const material = filtered[0];
      setSelectedMaterialId(material.id);
      
      // Calculate cost with 10% markup
      const costWithMarkup = (material.cost_per_sheet * 1.10).toFixed(2);
      
      // Auto-populate material fields
      setQuoteData({
        ...quoteData,
        material: {
          ...quoteData.material,
          type: material.name,
          thickness: material.thickness,
          grade: material.grade,
          finish: material.finish,
          sheetCost: costWithMarkup,
          sheetWeight: material.weight_per_sheet.toString(),
          sheetSize: `${material.width}x${material.length}`
        }
      });
      
      toast({
        title: "Material Selected",
        description: `${material.name} ${material.thickness} ${material.grade} ${material.finish} - Cost: $${costWithMarkup}/sheet (incl. 10% markup)`,
        duration: 3000
      });
    }
  }, [materialGrade, materialType, materialFinish, materialSize, availableMaterials]);

  const addProcess = (processType = '') => {
    const newProcess = {
      id: Date.now(),
      type: processType,
      isOutsource: false,
      // Laser Cutting fields
      cuttingTime: '',
      programmingCost: '',
      setupCost: '',
      cuttingCostPerPart: '',
      deliveryCost: '',
      // Press Brake fields
      bendCount: '',
      setupTime: '',
      cycleTime: '',
      // Outsource fields
      supplierName: '',
      contactPerson: '',
      phoneNo: '',
      unitCost: '',
      otherCosts: '',
      transportCosts: '',
      totalCosts: '',
      marginPercentage: '',
      actualMargin: '',
      sellPrice: ''
    };
    setProcesses([...processes, newProcess]);
  };

  const removeProcess = (processId) => {
    setProcesses(processes.filter(p => p.id !== processId));
  };

  const updateProcess = (processId, field, value) => {
    setProcesses(processes.map(p => {
      if (p.id === processId) {
        const updated = { ...p, [field]: value };
        
        // Auto-calculate for outsource processes
        if (p.isOutsource) {
          const unitCost = parseFloat(updated.unitCost) || 0;
          const otherCosts = parseFloat(updated.otherCosts) || 0;
          const transportCosts = parseFloat(updated.transportCosts) || 0;
          const marginPercent = parseFloat(updated.marginPercentage) || 0;
          
          const totalCosts = unitCost + otherCosts + transportCosts;
          const actualMargin = (totalCosts * marginPercent) / 100;
          const sellPrice = totalCosts + actualMargin;
          
          updated.totalCosts = totalCosts.toFixed(2);
          updated.actualMargin = actualMargin.toFixed(2);
          updated.sellPrice = sellPrice.toFixed(2);
        }
        
        return updated;
      }
      return p;
    }));
  };

  const handleSave = () => {
    toast({
      title: "Quote Saved",
      description: `Quote ${isNew ? 'created' : 'updated'} successfully`,
    });
  };

  const handleGeneratePDF = () => {
    toast({
      title: "PDF Generated",
      description: "Quote PDF has been generated successfully",
    });
  };

  const handleCreateJobSheet = () => {
    toast({
      title: "Job Sheet Created",
      description: `Job sheet created from quote ${id}`,
    });
    navigate('/jobsheets');
  };

  const handleCreateInvoice = () => {
    toast({
      title: "Invoice Created",
      description: `Invoice created from quote ${id}`,
    });
    navigate('/invoices');
  };

  // Calculate average material cost from inventory + 10% markup
  const calculateMaterialPrice = () => {
    // In production, this would fetch from actual inventory
    // For now, using mock calculation
    const avgCostPerSheet = 85.00; // Example average from inventory
    const markup = avgCostPerSheet * 0.10; // 10% markup
    return (avgCostPerSheet + markup).toFixed(2);
  };

  return (
    <div className="p-8">
      <div className="mb-6">
        <Button variant="ghost" onClick={() => navigate('/quotes')} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Quotes
        </Button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">
              {isNew ? 'New Quote' : `Quote ${id}`}
            </h1>
            <p className="text-slate-600 mt-2">Create and manage quote details</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleGeneratePDF}>
              <FileText className="w-4 h-4 mr-2" />
              PDF
            </Button>
            <Button variant="outline" onClick={handleCreateJobSheet}>
              <ClipboardList className="w-4 h-4 mr-2" />
              Create Job Sheet
            </Button>
            <Button variant="outline" onClick={handleCreateInvoice}>
              <FileText className="w-4 h-4 mr-2" />
              Create Invoice
            </Button>
            <Button className="bg-slate-900 hover:bg-slate-800" onClick={handleSave}>
              <Save className="w-4 h-4 mr-2" />
              Save Quote
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Main Content - 2 columns */}
        <div className="col-span-2 space-y-6">
          {/* Customer & Quote Info */}
          <Card>
            <CardHeader>
              <CardTitle>Quote Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Customer</Label>
                  <Select value={quoteData.customer} onValueChange={(value) => setQuoteData({...quoteData, customer: value})}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {mockCustomers.map(customer => (
                        <SelectItem key={customer.id} value={customer.companyName}>
                          {customer.companyName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Contact Person</Label>
                  <Input
                    className="mt-1"
                    value={quoteData.contactPerson}
                    onChange={(e) => setQuoteData({...quoteData, contactPerson: e.target.value})}
                    placeholder="Enter contact name"
                  />
                </div>
                <div>
                  <Label>Item Reference</Label>
                  <Input
                    className="mt-1"
                    value={quoteData.itemRef}
                    onChange={(e) => setQuoteData({...quoteData, itemRef: e.target.value})}
                    placeholder="Enter item ref"
                  />
                </div>
                <div>
                  <Label>Date</Label>
                  <Input
                    className="mt-1"
                    type="date"
                    defaultValue={new Date().toISOString().split('T')[0]}
                  />
                </div>
                <div className="col-span-2">
                  <Label>Part Description</Label>
                  <Textarea
                    className="mt-1"
                    value={quoteData.partDescription}
                    onChange={(e) => setQuoteData({...quoteData, partDescription: e.target.value})}
                    placeholder="Enter part description"
                    rows={2}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Material Information */}
          <Card>
            <CardHeader>
              <CardTitle>Material Selection (From Inventory)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4 mb-4">
                <div>
                  <Label>Material Grade</Label>
                  <Select value={materialGrade} onValueChange={setMaterialGrade} disabled={loadingMaterials}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select grade" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableGrades.map(grade => (
                        <SelectItem key={grade} value={grade}>
                          {grade}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Material Type</Label>
                  <Select value={materialType} onValueChange={setMaterialType} disabled={loadingMaterials}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableTypes.map(type => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Material Finish</Label>
                  <Select value={materialFinish} onValueChange={setMaterialFinish} disabled={loadingMaterials}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select finish" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableFinishes.map(finish => (
                        <SelectItem key={finish} value={finish}>
                          {finish}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Material Size (Thickness)</Label>
                  <Select value={materialSize} onValueChange={setMaterialSize} disabled={loadingMaterials}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select size" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSizes.map(size => (
                        <SelectItem key={size} value={size}>
                          {size}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Show matching materials */}
              {(materialGrade || materialType || materialFinish || materialSize) && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <span className="font-semibold">Matching materials in inventory:</span> {filteredMaterials.length} 
                    {filteredMaterials.length === 1 && ' (Auto-selected)'}
                    {filteredMaterials.length > 1 && ' (Select more filters to narrow down)'}
                    {filteredMaterials.length === 0 && ' (No material found with these specs)'}
                  </p>
                  {filteredMaterials.length > 0 && filteredMaterials.length <= 3 && (
                    <div className="mt-2 space-y-1">
                      {filteredMaterials.map(mat => (
                        <p key={mat.id} className="text-xs text-blue-700">
                          • {mat.name} {mat.thickness} {mat.grade} {mat.finish} - Stock: {mat.stock} sheets @ ${mat.cost_per_sheet}/sheet
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Selected Material Summary */}
              {selectedMaterialId && (
                <div className="grid grid-cols-5 gap-4 p-4 bg-green-50 border-2 border-green-200 rounded-lg">
                  <div>
                    <Label className="text-xs text-green-700">Material Type</Label>
                    <p className="font-semibold mt-1 text-green-900">{quoteData.material.type}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-green-700">Thickness</Label>
                    <p className="font-semibold mt-1 text-green-900">{quoteData.material.thickness}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-green-700">Grade</Label>
                    <p className="font-semibold mt-1 text-green-900">{quoteData.material.grade}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-green-700">Finish</Label>
                    <p className="font-semibold mt-1 text-green-900">{quoteData.material.finish}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-green-700">Sheet Size</Label>
                    <p className="font-semibold mt-1 text-green-900">{quoteData.material.sheetSize}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Material Usage & Cost Calculation */}
          {selectedMaterialId && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Material Usage & Cost Calculation</CardTitle>
                <p className="text-xs text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                  Pricing: Avg Stock Cost + 10% Markup
                </p>
              </div>
            </CardHeader>
            <CardContent>

              <div className="border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-slate-900">Material Usage & Cost Calculation</h4>
                  <p className="text-xs text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                    Pricing: Avg Stock Cost + 10% Markup
                  </p>
                </div>
                <div className="grid grid-cols-6 gap-4">
                  <div>
                    <Label className="text-xs">Sheet Cost ($)</Label>
                    <Input
                      className="mt-1"
                      type="number"
                      step="0.01"
                      value={quoteData.material.sheetCost}
                      onChange={(e) => {
                        const sheetCost = parseFloat(e.target.value) || 0;
                        const usage = parseFloat(quoteData.material.usage) || 0;
                        const materialCost = (sheetCost * usage).toFixed(2);
                        setQuoteData({
                          ...quoteData, 
                          material: {
                            ...quoteData.material, 
                            sheetCost: e.target.value,
                            calculatedMaterialCost: materialCost
                          },
                          buyingCost: materialCost
                        });
                      }}
                      placeholder="300.00"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Usage (Sheet)</Label>
                    <Input
                      className="mt-1"
                      type="number"
                      step="0.01"
                      value={quoteData.material.usage}
                      onChange={(e) => {
                        const sheetCost = parseFloat(quoteData.material.sheetCost) || 0;
                        const usage = parseFloat(e.target.value) || 0;
                        const materialCost = (sheetCost * usage).toFixed(2);
                        setQuoteData({
                          ...quoteData, 
                          material: {
                            ...quoteData.material, 
                            usage: e.target.value,
                            calculatedMaterialCost: materialCost
                          },
                          buyingCost: materialCost
                        });
                      }}
                      placeholder="0.5"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Material Cost ($)</Label>
                    <Input
                      className="mt-1 bg-yellow-50 font-semibold text-green-600"
                      value={quoteData.material.calculatedMaterialCost}
                      readOnly
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Sheet Weight (kg)</Label>
                    <Input
                      className="mt-1"
                      type="number"
                      step="0.01"
                      value={quoteData.material.sheetWeight}
                      onChange={(e) => setQuoteData({...quoteData, material: {...quoteData.material, sheetWeight: e.target.value}})}
                      placeholder="25.5"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Sheet Size (mm)</Label>
                    <Input
                      className="mt-1"
                      value={quoteData.material.sheetSize}
                      onChange={(e) => setQuoteData({...quoteData, material: {...quoteData.material, sheetSize: e.target.value}})}
                      placeholder="1220x2440"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Cost per kg ($)</Label>
                    <Input
                      className="mt-1 bg-slate-50"
                      value={quoteData.material.sheetWeight && quoteData.material.calculatedMaterialCost && parseFloat(quoteData.material.calculatedMaterialCost) > 0 ? 
                        (parseFloat(quoteData.material.calculatedMaterialCost) / parseFloat(quoteData.material.sheetWeight)).toFixed(2) : 
                        '0.00'}
                      readOnly
                    />
                  </div>
                </div>
                <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-800">
                    <span className="font-semibold">Calculation:</span> Sheet Cost × Usage = Material Cost
                    {quoteData.material.sheetCost && quoteData.material.usage && (
                      <span className="font-bold ml-2">
                        (${quoteData.material.sheetCost} × {quoteData.material.usage} = ${quoteData.material.calculatedMaterialCost})
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          )}

          {/* Processes */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Processes</CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => addProcess('Laser Cutting')}>
                    <Plus className="w-4 h-4 mr-1" />
                    Laser Cutting
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => addProcess('Press Brake')}>
                    <Plus className="w-4 h-4 mr-1" />
                    Press Brake
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => {
                    const newProc = {
                      id: Date.now(),
                      type: 'Outsource',
                      isOutsource: true,
                      supplierName: '',
                      contactPerson: '',
                      phoneNo: '',
                      unitCost: '',
                      otherCosts: '',
                      transportCosts: '',
                      totalCosts: '0.00',
                      marginPercentage: '',
                      actualMargin: '0.00',
                      sellPrice: '0.00'
                    };
                    setProcesses([...processes, newProc]);
                  }}>
                    <Plus className="w-4 h-4 mr-1" />
                    Outsource
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {processes.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <p>No processes added yet. Click the buttons above to add processes.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {processes.map((process, index) => (
                    <Card key={process.id} className="border-2 border-slate-200">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="text-lg">{process.type || 'Process'}</CardTitle>
                            {process.isOutsource && (
                              <p className="text-xs text-slate-500 mt-1">Outsource Process</p>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removeProcess(process.id)}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {!process.isOutsource && process.type === 'Laser Cutting' && (
                          <div className="grid grid-cols-5 gap-3">
                            <div>
                              <Label className="text-xs">Cutting Time (Part)</Label>
                              <Input
                                className="mt-1"
                                type="number"
                                step="0.01"
                                value={process.cuttingTime}
                                onChange={(e) => updateProcess(process.id, 'cuttingTime', e.target.value)}
                                placeholder="4.00 min"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Programming Cost</Label>
                              <Input
                                className="mt-1"
                                type="number"
                                step="0.01"
                                value={process.programmingCost}
                                onChange={(e) => updateProcess(process.id, 'programmingCost', e.target.value)}
                                placeholder="$9.95"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Setup Cost</Label>
                              <Input
                                className="mt-1"
                                type="number"
                                step="0.01"
                                value={process.setupCost}
                                onChange={(e) => updateProcess(process.id, 'setupCost', e.target.value)}
                                placeholder="$1.90"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Cutting Cost/Part</Label>
                              <Input
                                className="mt-1"
                                type="number"
                                step="0.01"
                                value={process.cuttingCostPerPart}
                                onChange={(e) => updateProcess(process.id, 'cuttingCostPerPart', e.target.value)}
                                placeholder="$8.40"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Delivery Cost</Label>
                              <Input
                                className="mt-1"
                                type="number"
                                step="0.01"
                                value={process.deliveryCost}
                                onChange={(e) => updateProcess(process.id, 'deliveryCost', e.target.value)}
                                placeholder="$0"
                              />
                            </div>
                          </div>
                        )}

                        {!process.isOutsource && process.type === 'Press Brake' && (
                          <div className="grid grid-cols-4 gap-3">
                            <div>
                              <Label className="text-xs">Bend Count</Label>
                              <Input
                                className="mt-1"
                                type="number"
                                value={process.bendCount}
                                onChange={(e) => updateProcess(process.id, 'bendCount', e.target.value)}
                                placeholder="12"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Setup Time (min)</Label>
                              <Input
                                className="mt-1"
                                type="number"
                                step="0.1"
                                value={process.setupTime}
                                onChange={(e) => updateProcess(process.id, 'setupTime', e.target.value)}
                                placeholder="15"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Cycle Time (min)</Label>
                              <Input
                                className="mt-1"
                                type="number"
                                step="0.1"
                                value={process.cycleTime}
                                onChange={(e) => updateProcess(process.id, 'cycleTime', e.target.value)}
                                placeholder="2.5"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Total Cost</Label>
                              <Input
                                className="mt-1 bg-yellow-50"
                                value={((parseFloat(process.setupTime) || 0) + (parseFloat(process.cycleTime) || 0) * (parseFloat(process.bendCount) || 0) / 60 * 85).toFixed(2)}
                                readOnly
                              />
                            </div>
                          </div>
                        )}

                        {process.isOutsource && (
                          <div className="space-y-3">
                            <div className="grid grid-cols-3 gap-3">
                              <div>
                                <Label className="text-xs">Supplier Name</Label>
                                <Input
                                  className="mt-1"
                                  value={process.supplierName}
                                  onChange={(e) => updateProcess(process.id, 'supplierName', e.target.value)}
                                  placeholder="Enter supplier"
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Contact Person</Label>
                                <Input
                                  className="mt-1"
                                  value={process.contactPerson}
                                  onChange={(e) => updateProcess(process.id, 'contactPerson', e.target.value)}
                                  placeholder="Enter contact"
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Phone No.</Label>
                                <Input
                                  className="mt-1"
                                  value={process.phoneNo}
                                  onChange={(e) => updateProcess(process.id, 'phoneNo', e.target.value)}
                                  placeholder="Enter phone"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-6 gap-3">
                              <div>
                                <Label className="text-xs">Unit Cost ($)</Label>
                                <Input
                                  className="mt-1"
                                  type="number"
                                  step="0.01"
                                  value={process.unitCost}
                                  onChange={(e) => updateProcess(process.id, 'unitCost', e.target.value)}
                                  placeholder="0.00"
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Other Costs ($)</Label>
                                <Input
                                  className="mt-1"
                                  type="number"
                                  step="0.01"
                                  value={process.otherCosts}
                                  onChange={(e) => updateProcess(process.id, 'otherCosts', e.target.value)}
                                  placeholder="0.00"
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Transport ($)</Label>
                                <Input
                                  className="mt-1"
                                  type="number"
                                  step="0.01"
                                  value={process.transportCosts}
                                  onChange={(e) => updateProcess(process.id, 'transportCosts', e.target.value)}
                                  placeholder="0.00"
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Total Costs ($)</Label>
                                <Input
                                  className="mt-1 bg-yellow-50 font-medium"
                                  value={process.totalCosts}
                                  readOnly
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Markup %</Label>
                                <Input
                                  className="mt-1"
                                  type="number"
                                  step="1"
                                  value={process.marginPercentage}
                                  onChange={(e) => updateProcess(process.id, 'marginPercentage', e.target.value)}
                                  placeholder="25"
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Sell Price ($)</Label>
                                <Input
                                  className="mt-1 bg-green-50 font-medium"
                                  value={process.sellPrice}
                                  readOnly
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Geometry Calculator */}
          <Card>
            <CardHeader>
              <CardTitle>Geometry & Parts Per Sheet Calculator</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Part Dimensions */}
                <div>
                  <h4 className="font-semibold mb-3 text-slate-900">Part Dimensions</h4>
                  <div className="grid grid-cols-4 gap-4">
                    <div>
                      <Label className="text-xs">Part Length (mm)</Label>
                      <Input
                        className="mt-1"
                        type="number"
                        value={quoteData.geometry.length}
                        onChange={(e) => {
                          const length = parseFloat(e.target.value) || 0;
                          const width = parseFloat(quoteData.geometry.width) || 0;
                          const perimeter = length && width ? (2 * (length + width)).toFixed(2) : '';
                          const area = length && width ? (length * width).toFixed(2) : '';
                          
                          // Calculate parts per sheet
                          let partsPerSheet = '';
                          if (quoteData.material.sheetSize && length && width) {
                            const [sheetLength, sheetWidth] = quoteData.material.sheetSize.split('x').map(s => parseFloat(s.trim()));
                            if (sheetLength && sheetWidth) {
                              const partsAlongLength = Math.floor(sheetLength / length);
                              const partsAlongWidth = Math.floor(sheetWidth / width);
                              const option1 = partsAlongLength * partsAlongWidth;
                              
                              const partsAlongLengthRotated = Math.floor(sheetLength / width);
                              const partsAlongWidthRotated = Math.floor(sheetWidth / length);
                              const option2 = partsAlongLengthRotated * partsAlongWidthRotated;
                              
                              partsPerSheet = Math.max(option1, option2);
                            }
                          }
                          
                          // Calculate usage
                          const usage = partsPerSheet ? (1 / partsPerSheet).toFixed(4) : '';
                          const sheetCost = parseFloat(quoteData.material.sheetCost) || 0;
                          const materialCost = usage && sheetCost ? (sheetCost * parseFloat(usage)).toFixed(2) : quoteData.material.calculatedMaterialCost;
                          
                          setQuoteData({
                            ...quoteData, 
                            geometry: {
                              ...quoteData.geometry, 
                              length: e.target.value,
                              totalPerimeter: perimeter,
                              totalArea: area,
                              partsPerSheet: partsPerSheet
                            },
                            material: {
                              ...quoteData.material,
                              usage: usage || quoteData.material.usage,
                              calculatedMaterialCost: materialCost
                            },
                            buyingCost: materialCost
                          });
                        }}
                        placeholder="100"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Part Width (mm)</Label>
                      <Input
                        className="mt-1"
                        type="number"
                        value={quoteData.geometry.width}
                        onChange={(e) => {
                          const length = parseFloat(quoteData.geometry.length) || 0;
                          const width = parseFloat(e.target.value) || 0;
                          const perimeter = length && width ? (2 * (length + width)).toFixed(2) : '';
                          const area = length && width ? (length * width).toFixed(2) : '';
                          
                          // Calculate parts per sheet
                          let partsPerSheet = '';
                          if (quoteData.material.sheetSize && length && width) {
                            const [sheetLength, sheetWidth] = quoteData.material.sheetSize.split('x').map(s => parseFloat(s.trim()));
                            if (sheetLength && sheetWidth) {
                              const partsAlongLength = Math.floor(sheetLength / length);
                              const partsAlongWidth = Math.floor(sheetWidth / width);
                              const option1 = partsAlongLength * partsAlongWidth;
                              
                              const partsAlongLengthRotated = Math.floor(sheetLength / width);
                              const partsAlongWidthRotated = Math.floor(sheetWidth / length);
                              const option2 = partsAlongLengthRotated * partsAlongWidthRotated;
                              
                              partsPerSheet = Math.max(option1, option2);
                            }
                          }
                          
                          // Calculate usage
                          const usage = partsPerSheet ? (1 / partsPerSheet).toFixed(4) : '';
                          const sheetCost = parseFloat(quoteData.material.sheetCost) || 0;
                          const materialCost = usage && sheetCost ? (sheetCost * parseFloat(usage)).toFixed(2) : quoteData.material.calculatedMaterialCost;
                          
                          setQuoteData({
                            ...quoteData, 
                            geometry: {
                              ...quoteData.geometry, 
                              width: e.target.value,
                              totalPerimeter: perimeter,
                              totalArea: area,
                              partsPerSheet: partsPerSheet
                            },
                            material: {
                              ...quoteData.material,
                              usage: usage || quoteData.material.usage,
                              calculatedMaterialCost: materialCost
                            },
                            buyingCost: materialCost
                          });
                        }}
                        placeholder="50"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Pierce Count</Label>
                      <Input
                        className="mt-1"
                        type="number"
                        value={quoteData.geometry.pierceCount}
                        onChange={(e) => setQuoteData({...quoteData, geometry: {...quoteData.geometry, pierceCount: e.target.value}})}
                        placeholder="1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Diameter (mm)</Label>
                      <Input
                        className="mt-1"
                        type="number"
                        value={quoteData.geometry.diameter}
                        onChange={(e) => setQuoteData({...quoteData, geometry: {...quoteData.geometry, diameter: e.target.value}})}
                        placeholder="110"
                      />
                    </div>
                  </div>
                </div>

                {/* Auto-calculated values */}
                <div className="border-t border-slate-200 pt-4">
                  <h4 className="font-semibold mb-3 text-slate-900">Auto-Calculated Values</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label className="text-xs">Total Perimeter (mm)</Label>
                      <Input
                        className="mt-1 bg-yellow-50 font-medium"
                        value={quoteData.geometry.totalPerimeter}
                        readOnly
                        placeholder="Auto-calculated"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Total Area (mm²)</Label>
                      <Input
                        className="mt-1 bg-yellow-50 font-medium"
                        value={quoteData.geometry.totalArea}
                        readOnly
                        placeholder="Auto-calculated"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Parts Per Sheet</Label>
                      <Input
                        className="mt-1 bg-blue-50 font-bold text-blue-600"
                        value={quoteData.geometry.partsPerSheet || '0'}
                        readOnly
                      />
                    </div>
                  </div>
                </div>

                {/* Parts per sheet explanation */}
                {quoteData.geometry.partsPerSheet && quoteData.material.sheetSize && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-800">
                      <span className="font-semibold">Sheet Utilization:</span> {quoteData.geometry.partsPerSheet} parts fit on a {quoteData.material.sheetSize}mm sheet.
                      {quoteData.geometry.length && quoteData.geometry.width && (
                        <span> Each part is {quoteData.geometry.length}×{quoteData.geometry.width}mm.</span>
                      )}
                      {quoteData.material.usage && (
                        <span className="font-bold ml-2">Sheet usage per part: {quoteData.material.usage}</span>
                      )}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Cost Summary Sidebar - 1 column */}
        <div className="space-y-6">
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle>Cost Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Selling Price per Material ($)</Label>
                <Input
                  className="mt-1"
                  type="number"
                  step="0.01"
                  value={quoteData.sellingPrice}
                  onChange={(e) => setQuoteData({...quoteData, sellingPrice: e.target.value})}
                  placeholder="32.81"
                />
              </div>
              <div>
                <Label>Buying Cost of Material ($)</Label>
                <Input
                  className="mt-1"
                  type="number"
                  step="0.01"
                  value={quoteData.buyingCost}
                  onChange={(e) => setQuoteData({...quoteData, buyingCost: e.target.value})}
                  placeholder="30.38"
                />
              </div>
              <div>
                <Label>Markup (%)</Label>
                <Input
                  className="mt-1 bg-orange-50 font-medium"
                  value={quoteData.markup}
                  onChange={(e) => setQuoteData({...quoteData, markup: e.target.value})}
                  placeholder="Auto"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Material Cost</span>
                  <span className="font-medium">${quoteData.buyingCost || '0.00'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Process Costs</span>
                  <span className="font-medium">
                    ${processes.reduce((sum, p) => {
                      if (p.isOutsource) return sum + (parseFloat(p.sellPrice) || 0);
                      return sum + (parseFloat(p.cuttingCostPerPart) || 0);
                    }, 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-3 border-t border-slate-200">
                  <span className="text-sm font-semibold">Total Job Cost</span>
                  <span className="text-lg font-bold">
                    ${(parseFloat(quoteData.buyingCost || 0) + processes.reduce((sum, p) => {
                      if (p.isOutsource) return sum + (parseFloat(p.sellPrice) || 0);
                      return sum + (parseFloat(p.cuttingCostPerPart) || 0);
                    }, 0)).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Net Profit</span>
                  <span className="font-medium text-green-600">
                    ${(parseFloat(quoteData.sellingPrice || 0) - parseFloat(quoteData.buyingCost || 0) - processes.reduce((sum, p) => {
                      if (p.isOutsource) return sum + (parseFloat(p.sellPrice) || 0);
                      return sum + (parseFloat(p.cuttingCostPerPart) || 0);
                    }, 0)).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-3 border-t border-slate-200">
                  <span className="font-semibold">Quote Total</span>
                  <span className="text-2xl font-bold text-slate-900">
                    ${quoteData.sellingPrice || '0.00'}
                  </span>
                </div>
              </div>

              <div className="pt-4">
                <Label>Date of Price Update</Label>
                <Input
                  className="mt-1"
                  type="date"
                  defaultValue={new Date().toISOString().split('T')[0]}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quote Status</CardTitle>
            </CardHeader>
            <CardContent>
              <Select defaultValue="active">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="declined">Declined</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default QuoteDetail;
