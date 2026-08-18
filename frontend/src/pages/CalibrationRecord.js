import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Save } from 'lucide-react';
import { getControlledDocumentByModule } from '../utils/documentControl';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

const CalibrationRecord = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const instrument = location.state?.instrument;

  const [formData, setFormData] = useState({
    calibration_date: new Date().toISOString().slice(0, 10),
    ref_instrument_name: 'Caliper Check Plate',
    ref_instrument_serial: 'ULT001',
    ref_valid_until: '',
    ref_accuracy: '+/- 0.04',
    result: 'Pass',
    performed_by: '',
    temperature: '',
    humidity: '',
    comments: ''
  });

  const [measurements, setMeasurements] = useState([
    { ref_size: 25.00, measured_size: null, deviation: null },
    { ref_size: 50.00, measured_size: null, deviation: null },
    { ref_size: 100.00, measured_size: null, deviation: null },
    { ref_size: 150.00, measured_size: null, deviation: null },
    { ref_size: 10.00, measured_size: null, deviation: null, label: 'Diameter 10mm' }
  ]);
  const [docInfo, setDocInfo] = useState(null);

  useEffect(() => {
    getControlledDocumentByModule('Calibration Records', {
      fallback: 'Calibration Records', docType: 'Form',
    }).then(setDocInfo);
  }, []);

  useEffect(() => {
    if (!instrument) {
      alert('No instrument selected. Redirecting to schedule...');
      navigate('/quality/calibration');
    }
  }, [instrument, navigate]);

  // Auto-calculate ref_valid_until based on calibration_date + 12 months
  useEffect(() => {
    if (formData.calibration_date) {
      const calDate = new Date(formData.calibration_date);
      const validUntil = new Date(calDate);
      validUntil.setMonth(validUntil.getMonth() + (instrument?.calibration_frequency || 12));
      const validUntilStr = validUntil.toISOString().slice(0, 10);
      
      // Only update if it's different to avoid infinite loop
      if (formData.ref_valid_until !== validUntilStr) {
        setFormData(prev => ({...prev, ref_valid_until: validUntilStr}));
      }
    }
  }, [formData.calibration_date, instrument?.calibration_frequency]);

  const handleMeasurementChange = (index, field, value) => {
    const newMeasurements = [...measurements];
    newMeasurements[index][field] = parseFloat(value) || null;
    
    // Auto-calculate deviation
    if (field === 'measured_size' && newMeasurements[index].measured_size !== null) {
      newMeasurements[index].deviation = 
        parseFloat((newMeasurements[index].measured_size - newMeasurements[index].ref_size).toFixed(3));
    }
    
    setMeasurements(newMeasurements);
  };

  const addMeasurement = () => {
    setMeasurements([...measurements, { ref_size: 0, measured_size: null, deviation: null }]);
  };

  const removeMeasurement = (index) => {
    setMeasurements(measurements.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    try {
      const currentUserStr = localStorage.getItem('currentUser');
      const currentUser = JSON.parse(currentUserStr);
      const token = currentUser.token;

      // Calculate next calibration due date (add calibration_frequency months to calibration_date)
      const calDate = new Date(formData.calibration_date);
      const nextDueDate = new Date(calDate);
      nextDueDate.setMonth(nextDueDate.getMonth() + (instrument.calibration_frequency || 12));

      const payload = {
        instrument_id: instrument.id,
        calibration_date: formData.calibration_date,
        next_calibration_due: nextDueDate.toISOString().slice(0, 10),
        ref_instrument_name: formData.ref_instrument_name,
        ref_instrument_serial: formData.ref_instrument_serial,
        ref_valid_until: formData.ref_valid_until || null,
        ref_accuracy: formData.ref_accuracy,
        measurements: measurements.filter(m => m.measured_size !== null),
        result: formData.result,
        performed_by: formData.performed_by,
        temperature: formData.temperature || null,
        humidity: formData.humidity || null,
        comments: formData.comments
      };

      const response = await fetch(`${BACKEND_URL}/api/calibration/records`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const result = await response.json();
        alert(`Calibration record ${result.record_number} created successfully!`);
        navigate('/quality/calibration');
      } else {
        const error = await response.json();
        alert('Error: ' + (error.detail || 'Failed to save'));
      }
    } catch (error) {
      console.error('Error saving calibration record:', error);
      alert('Error saving calibration record');
    }
  };

  if (!instrument) {
    return null;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={() => navigate('/quality/calibration')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Schedule
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Calibration Record ({docInfo?.form_no || '—'})</h1>
          <p className="text-gray-600 mt-1">{instrument.instrument_name} - {instrument.ident_no}</p>
        </div>
      </div>

      {/* Instrument Details (Pre-filled) */}
      <Card>
        <CardHeader>
          <CardTitle>Instrument Requiring Calibration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="font-bold">Instrument Name</Label>
              <p className="text-lg">{instrument.instrument_name}</p>
            </div>
            <div>
              <Label className="font-bold">Instrument No. / Serial No.</Label>
              <p className="text-lg">{instrument.ident_no}</p>
            </div>
            <div>
              <Label className="font-bold">Operator</Label>
              <p className="text-lg">{instrument.operator_name || '-'}</p>
            </div>
            <div>
              <Label className="font-bold">Required Accuracy</Label>
              <p className="text-lg">{instrument.required_accuracy || '-'}</p>
            </div>
            <div>
              <Label className="font-bold">Calibration Frequency</Label>
              <p className="text-lg">{instrument.calibration_frequency} months</p>
            </div>
            <div>
              <Label className="font-bold">Last Calibration</Label>
              <p className="text-lg">
                {instrument.last_calibration_date 
                  ? new Date(instrument.last_calibration_date).toLocaleDateString('en-AU')
                  : 'Never'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Calibration Details */}
      <Card>
        <CardHeader>
          <CardTitle>Calibration Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Date of Calibration Check *</Label>
              <Input
                type="date"
                value={formData.calibration_date}
                onChange={(e) => setFormData({...formData, calibration_date: e.target.value})}
              />
            </div>
            <div>
              <Label>Performed By</Label>
              <Input
                value={formData.performed_by}
                onChange={(e) => setFormData({...formData, performed_by: e.target.value})}
                placeholder="Technician name"
              />
            </div>
            <div>
              <Label>Temperature (°C)</Label>
              <Input
                type="number"
                step="0.1"
                value={formData.temperature}
                onChange={(e) => setFormData({...formData, temperature: e.target.value})}
                placeholder="e.g. 21.5"
              />
            </div>
            <div>
              <Label>Humidity (%)</Label>
              <Input
                type="number"
                step="0.1"
                value={formData.humidity}
                onChange={(e) => setFormData({...formData, humidity: e.target.value})}
                placeholder="e.g. 45.0"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reference Instrument */}
      <Card>
        <CardHeader>
          <CardTitle>Reference Instrument Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Reference Instrument Name</Label>
              <Input
                value={formData.ref_instrument_name}
                onChange={(e) => setFormData({...formData, ref_instrument_name: e.target.value})}
              />
            </div>
            <div>
              <Label>Instrument No. / Serial No.</Label>
              <Input
                value={formData.ref_instrument_serial}
                onChange={(e) => setFormData({...formData, ref_instrument_serial: e.target.value})}
              />
            </div>
            <div>
              <Label>Calibration Valid Until <span className="text-xs text-green-600">(Auto-calculated)</span></Label>
              <Input
                type="date"
                value={formData.ref_valid_until}
                readOnly
                className="bg-green-50"
              />
              <p className="text-xs text-gray-500 mt-1">
                Automatically set to {instrument?.calibration_frequency || 12} months from calibration date
              </p>
            </div>
            <div>
              <Label>Accuracy</Label>
              <Input
                value={formData.ref_accuracy}
                onChange={(e) => setFormData({...formData, ref_accuracy: e.target.value})}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Measurements */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Calibration Measurements</CardTitle>
          <Button size="sm" onClick={addMeasurement}>
            <Plus className="w-4 h-4 mr-2" />
            Add Row
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3">Ref. Instrument Size (mm)</th>
                  <th className="text-left p-3">Instrument for Calibration Size (mm)</th>
                  <th className="text-left p-3">Deviation</th>
                  <th className="text-center p-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {measurements.map((measurement, index) => (
                  <tr key={index} className="border-b">
                    <td className="p-3">
                      {measurement.label ? (
                        <div>
                          <span className="font-semibold">{measurement.label}</span>
                          <Input
                            type="number"
                            step="0.01"
                            value={measurement.ref_size}
                            onChange={(e) => handleMeasurementChange(index, 'ref_size', e.target.value)}
                            className="w-32 mt-1"
                          />
                        </div>
                      ) : (
                        <Input
                          type="number"
                          step="0.01"
                          value={measurement.ref_size}
                          onChange={(e) => handleMeasurementChange(index, 'ref_size', e.target.value)}
                          className="w-32"
                        />
                      )}
                    </td>
                    <td className="p-3">
                      <Input
                        type="number"
                        step="0.01"
                        value={measurement.measured_size || ''}
                        onChange={(e) => handleMeasurementChange(index, 'measured_size', e.target.value)}
                        placeholder="Enter measurement"
                        className="w-32"
                      />
                    </td>
                    <td className="p-3">
                      <span className={`font-bold ${
                        measurement.deviation === null ? 'text-gray-400' :
                        Math.abs(measurement.deviation) <= 0.05 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {measurement.deviation !== null ? measurement.deviation.toFixed(3) : '-'}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => removeMeasurement(index)}
                        disabled={measurements.length <= 5}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Result & Comments */}
      <Card>
        <CardHeader>
          <CardTitle>Result & Comments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Result *</Label>
            <div className="flex gap-4 mt-2">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="result"
                  value="Pass"
                  checked={formData.result === 'Pass'}
                  onChange={(e) => setFormData({...formData, result: e.target.value})}
                />
                <span className="text-green-600 font-bold">PASS</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="result"
                  value="Fail"
                  checked={formData.result === 'Fail'}
                  onChange={(e) => setFormData({...formData, result: e.target.value})}
                />
                <span className="text-red-600 font-bold">FAIL</span>
              </label>
            </div>
          </div>
          <div>
            <Label>Comments / Notes</Label>
            <Textarea
              value={formData.comments}
              onChange={(e) => setFormData({...formData, comments: e.target.value})}
              rows={4}
              placeholder="Additional observations or notes..."
            />
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-4">
        <Button onClick={handleSave} className="flex-1">
          <Save className="w-4 h-4 mr-2" />
          Save Calibration Record
        </Button>
        <Button variant="outline" onClick={() => navigate('/quality/calibration')} className="flex-1">
          Cancel
        </Button>
      </div>
    </div>
  );
};

export default CalibrationRecord;
