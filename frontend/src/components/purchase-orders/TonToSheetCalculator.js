import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Calculator } from 'lucide-react';

const TonToSheetCalculator = ({ onCalculate, thickness, width, length }) => {
  const [pricePerTon, setPricePerTon] = useState('');
  const [calculatedPrice, setCalculatedPrice] = useState(null);

  const calculatePricePerSheet = () => {
    if (!pricePerTon || !thickness || !width || !length) {
      return;
    }

    // Steel density: 7850 kg/m³ = 7.85 kg/dm³
    const density = 7.85; // g/cm³
    
    // Convert dimensions to cm
    const thicknessCm = parseFloat(thickness.replace('mm', '')) / 10;
    const widthCm = parseFloat(width) / 10;
    const lengthCm = parseFloat(length) / 10;
    
    // Calculate volume in cm³
    const volumeCm3 = thicknessCm * widthCm * lengthCm;
    
    // Calculate weight in kg
    const weightKg = (volumeCm3 * density) / 1000;
    
    // Calculate weight in tons
    const weightTons = weightKg / 1000;
    
    // Calculate price per sheet
    const pricePerSheet = parseFloat(pricePerTon) * weightTons;
    
    setCalculatedPrice({
      weightKg: weightKg.toFixed(2),
      weightTons: weightTons.toFixed(4),
      pricePerSheet: pricePerSheet.toFixed(2)
    });
    
    if (onCalculate) {
      onCalculate(pricePerSheet.toFixed(2));
    }
  };

  return (
    <Card className="bg-blue-50 border-blue-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center">
          <Calculator className="h-4 w-4 mr-2" />
          Ton to Sheet Price Calculator
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Price per Ton ($)</Label>
            <Input
              type="number"
              step="0.01"
              value={pricePerTon}
              onChange={(e) => setPricePerTon(e.target.value)}
              placeholder="Enter price per ton"
            />
          </div>
          
          <Button 
            size="sm" 
            onClick={calculatePricePerSheet}
            className="w-full"
            disabled={!pricePerTon || !thickness || !width || !length}
          >
            Calculate Price Per Sheet
          </Button>
          
          {calculatedPrice && (
            <div className="bg-white p-3 rounded border space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Weight:</span>
                <span className="font-medium">{calculatedPrice.weightKg} kg ({calculatedPrice.weightTons} tons)</span>
              </div>
              <div className="flex justify-between border-t pt-1">
                <span className="text-slate-600">Price per Sheet:</span>
                <span className="font-bold text-green-600">${calculatedPrice.pricePerSheet}</span>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default TonToSheetCalculator;
