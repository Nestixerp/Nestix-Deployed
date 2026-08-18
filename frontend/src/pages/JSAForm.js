import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Plus, Trash2, Save, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { useNavigate, useParams } from 'react-router-dom';

const JSAForm = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  
  const [formData, setFormData] = useState({
    works_location: '',
    machine_process: '',
    activity_description: '',
    hazard_rows: [
      {
        activity: '',
        hazards: '',
        risk_control_measures: '',
        who_is_responsible: '',
        risk_consequence: 3,
        risk_likelihood: 'C'
      }
    ]
  });
  
  const [loading, setLoading] = useState(false);
  
  // Risk Matrix Data
  const consequences = [
    { value: 1, label: '1 - Negligible' },
    { value: 2, label: '2 - Minor' },
    { value: 3, label: '3 - Major' },
    { value: 4, label: '4 - Critical' },
    { value: 5, label: '5 - Catastrophic' }
  ];
  
  const likelihoods = [
    { value: 'A', label: 'A - Frequent' },
    { value: 'B', label: 'B - Probable' },
    { value: 'C', label: 'C - Occasional' },
    { value: 'D', label: 'D - Remote' },
    { value: 'E', label: 'E - Rare' }
  ];
  
  // Risk Matrix Calculation
  const RISK_MATRIX = {
    1: {'A': 4, 'B': 4, 'C': 3, 'D': 2, 'E': 1},
    2: {'A': 5, 'B': 4, 'C': 3, 'D': 2, 'E': 1},
    3: {'A': 6, 'B': 5, 'C': 4, 'D': 3, 'E': 2},
    4: {'A': 6, 'B': 6, 'C': 5, 'D': 4, 'E': 3},
    5: {'A': 6, 'B': 6, 'C': 6, 'D': 5, 'E': 3}
  };
  
  const calculateRiskLevel = (consequence, likelihood) => {
    const score = RISK_MATRIX[consequence]?.[likelihood] || 1;
    if (score === 6) return { label: 'High Risk', color: 'bg-red-100 text-red-800' };
    if (score >= 4) return { label: `Medium-${score}`, color: 'bg-yellow-100 text-yellow-800' };
    return { label: `Low-${score}`, color: 'bg-green-100 text-green-800' };
  };
  
  useEffect(() => {
    if (isEdit) {
      fetchJSA();
    }
  }, [id]);
  
  const fetchJSA = async () => {
    try {
      const response = await api.get(`/jsas/${id}`);
      setFormData({
        works_location: response.data.works_location,
        machine_process: response.data.machine_process,
        activity_description: response.data.activity_description,
        hazard_rows: response.data.hazard_rows
      });
    } catch (error) {
      console.error('Error fetching JSA:', error);
      alert('Failed to load JSA');
    }
  };
  
  const handleAddRow = () => {
    setFormData(prev => ({
      ...prev,
      hazard_rows: [
        ...prev.hazard_rows,
        {
          activity: '',
          hazards: '',
          risk_control_measures: '',
          who_is_responsible: '',
          risk_consequence: 3,
          risk_likelihood: 'C'
        }
      ]
    }));
  };
  
  const handleRemoveRow = (index) => {
    if (formData.hazard_rows.length === 1) {
      alert('At least one hazard row is required');
      return;
    }
    
    setFormData(prev => ({
      ...prev,
      hazard_rows: prev.hazard_rows.filter((_, i) => i !== index)
    }));
  };
  
  const handleRowChange = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      hazard_rows: prev.hazard_rows.map((row, i) => 
        i === index ? { ...row, [field]: value } : row
      )
    }));
  };
  
  const handleSubmit = async () => {
    // Validation
    if (!formData.works_location || !formData.machine_process || !formData.activity_description) {
      alert('Please fill in all required fields');
      return;
    }
    
    // Check if all hazard rows are filled
    const emptyRow = formData.hazard_rows.find(row => 
      !row.activity || !row.hazards || !row.risk_control_measures || !row.who_is_responsible
    );
    
    if (emptyRow) {
      alert('Please fill in all hazard analysis rows');
      return;
    }
    
    try {
      setLoading(true);
      
      if (isEdit) {
        await api.put(`/jsas/${id}`, formData);
        alert('JSA updated successfully!');
      } else {
        await api.post('/jsas', formData);
        alert('JSA created successfully!');
      }
      
      navigate('/quality/jsa');
    } catch (error) {
      console.error('Error saving JSA:', error);
      alert('Failed to save JSA: ' + (error.response?.data?.detail || error.message));
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-2xl">
                {isEdit ? 'Edit JSA' : 'Create New JSA'}
              </CardTitle>
              <p className="text-sm text-gray-600 mt-1">Job Safety Analysis Worksheet</p>
            </div>
            <Button variant="outline" onClick={() => navigate('/quality/jsa')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Register
            </Button>
          </div>
        </CardHeader>
        
        <CardContent>
          <div className="space-y-6">
            {/* Header Information */}
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="font-semibold mb-4 text-lg">General Information</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Works Location *</Label>
                  <Input
                    value={formData.works_location}
                    onChange={(e) => setFormData(prev => ({ ...prev, works_location: e.target.value }))}
                    placeholder="e.g., Maintenance, Production Floor"
                  />
                </div>
                
                <div>
                  <Label>Machine / Process *</Label>
                  <Input
                    value={formData.machine_process}
                    onChange={(e) => setFormData(prev => ({ ...prev, machine_process: e.target.value }))}
                    placeholder="e.g., Welding Materials (gas metal welder)"
                  />
                </div>
              </div>
              
              <div className="mt-4">
                <Label>Activity Description *</Label>
                <Textarea
                  value={formData.activity_description}
                  onChange={(e) => setFormData(prev => ({ ...prev, activity_description: e.target.value }))}
                  placeholder="Describe the task or activity being analyzed..."
                  rows="3"
                />
              </div>
            </div>
            
            {/* Hazard Analysis Table */}
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-lg">Hazard Analysis</h3>
                <Button onClick={handleAddRow} size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Row
                </Button>
              </div>
              
              <div className="space-y-4">
                {formData.hazard_rows.map((row, index) => {
                  const riskLevel = calculateRiskLevel(row.risk_consequence, row.risk_likelihood);
                  
                  return (
                    <Card key={index} className="border-2">
                      <CardContent className="pt-4">
                        <div className="flex justify-between items-start mb-3">
                          <h4 className="font-semibold text-sm text-gray-700">Hazard #{index + 1}</h4>
                          <div className="flex items-center gap-2">
                            <span className={`px-3 py-1 rounded text-xs font-semibold ${riskLevel.color}`}>
                              {riskLevel.label}
                            </span>
                            {formData.hazard_rows.length > 1 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoveRow(index)}
                                className="text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label className="text-xs">Activity / Task *</Label>
                            <Textarea
                              value={row.activity}
                              onChange={(e) => handleRowChange(index, 'activity', e.target.value)}
                              placeholder="What task is being performed?"
                              rows="2"
                              className="text-sm"
                            />
                          </div>
                          
                          <div>
                            <Label className="text-xs">Hazards *</Label>
                            <Textarea
                              value={row.hazards}
                              onChange={(e) => handleRowChange(index, 'hazards', e.target.value)}
                              placeholder="What could go wrong?"
                              rows="2"
                              className="text-sm"
                            />
                          </div>
                          
                          <div>
                            <Label className="text-xs">Risk Control Measures *</Label>
                            <Textarea
                              value={row.risk_control_measures}
                              onChange={(e) => handleRowChange(index, 'risk_control_measures', e.target.value)}
                              placeholder="How to eliminate/minimize the risk?"
                              rows="2"
                              className="text-sm"
                            />
                          </div>
                          
                          <div>
                            <Label className="text-xs">Who is Responsible? *</Label>
                            <Input
                              value={row.who_is_responsible}
                              onChange={(e) => handleRowChange(index, 'who_is_responsible', e.target.value)}
                              placeholder="Person or role"
                              className="text-sm"
                            />
                          </div>
                          
                          <div>
                            <Label className="text-xs">Consequence *</Label>
                            <select
                              value={row.risk_consequence}
                              onChange={(e) => handleRowChange(index, 'risk_consequence', parseInt(e.target.value))}
                              className="w-full px-3 py-2 border rounded-md text-sm"
                            >
                              {consequences.map(c => (
                                <option key={c.value} value={c.value}>{c.label}</option>
                              ))}
                            </select>
                          </div>
                          
                          <div>
                            <Label className="text-xs">Likelihood *</Label>
                            <select
                              value={row.risk_likelihood}
                              onChange={(e) => handleRowChange(index, 'risk_likelihood', e.target.value)}
                              className="w-full px-3 py-2 border rounded-md text-sm"
                            >
                              {likelihoods.map(l => (
                                <option key={l.value} value={l.value}>{l.label}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
            
            {/* Save Button */}
            <div className="flex justify-end gap-4 pt-6 border-t">
              <Button variant="outline" onClick={() => navigate('/quality/jsa')}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={loading} className="bg-green-600 hover:bg-green-700">
                <Save className="w-4 h-4 mr-2" />
                {loading ? 'Saving...' : isEdit ? 'Update JSA' : 'Create JSA'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default JSAForm;
