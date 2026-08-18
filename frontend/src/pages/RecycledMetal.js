import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { FileDown, Edit, Save, X, Plus } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { getControlledDocumentByModule } from '../utils/documentControl';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

import API_BACKEND from '../lib/backendUrl';
const BACKEND_URL = API_BACKEND;

const RecycledMetal = () => {
  const [availableYears, setAvailableYears] = useState([]);
  const [selectedYear1, setSelectedYear1] = useState(2024);
  const [selectedYear2, setSelectedYear2] = useState(2025);
  const [comparisonData, setComparisonData] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editingYear, setEditingYear] = useState(null);
  const [editingMetric, setEditingMetric] = useState('mild_steel');
  const [showAddYear, setShowAddYear] = useState(false);
  const [newYear, setNewYear] = useState('');
  const [formData, setFormData] = useState({
    january: 0, february: 0, march: 0, april: 0,
    may: 0, june: 0, july: 0, august: 0,
    september: 0, october: 0, november: 0, december: 0
  });

  useEffect(() => {
    fetchAvailableYears();
  }, []);

  useEffect(() => {
    if (selectedYear1 && selectedYear2) {
      fetchComparisonData();
    }
  }, [selectedYear1, selectedYear2]);

  const fetchAvailableYears = async () => {
    try {
      const currentUserStr = localStorage.getItem('currentUser');
      const currentUser = JSON.parse(currentUserStr);
      const token = currentUser.token;

      const response = await fetch(`${BACKEND_URL}/api/environmental/years/recycled_metal`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setAvailableYears(data.years);
      
      if (data.years.length >= 2) {
        setSelectedYear1(data.years[1]);
        setSelectedYear2(data.years[0]);
      }
    } catch (error) {
      console.error('Error fetching years:', error);
    }
  };

  const fetchComparisonData = async () => {
    try {
      const currentUserStr = localStorage.getItem('currentUser');
      const currentUser = JSON.parse(currentUserStr);
      const token = currentUser.token;

      const response = await fetch(
        `${BACKEND_URL}/api/environmental/comparison-multi/recycled_metal/${selectedYear1}/${selectedYear2}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      const data = await response.json();
      setComparisonData(data);
    } catch (error) {
      console.error('Error fetching comparison data:', error);
    }
  };

  const handleAddYear = () => {
    const year = parseInt(newYear);
    if (!year || year < 2000 || year > 2100) {
      alert('Please enter a valid year');
      return;
    }
    setEditingYear(year);
    setEditingMetric('mild_steel');
    setFormData({
      january: 0, february: 0, march: 0, april: 0,
      may: 0, june: 0, july: 0, august: 0,
      september: 0, october: 0, november: 0, december: 0
    });
    setEditMode(true);
    setShowAddYear(false);
  };

  const handleEditYear = (year, metric, existingData) => {
    setEditingYear(year);
    setEditingMetric(metric);
    
    if (existingData) {
      setFormData({
        january: existingData.january || 0,
        february: existingData.february || 0,
        march: existingData.march || 0,
        april: existingData.april || 0,
        may: existingData.may || 0,
        june: existingData.june || 0,
        july: existingData.july || 0,
        august: existingData.august || 0,
        september: existingData.september || 0,
        october: existingData.october || 0,
        november: existingData.november || 0,
        december: existingData.december || 0
      });
    } else {
      setFormData({
        january: 0, february: 0, march: 0, april: 0,
        may: 0, june: 0, july: 0, august: 0,
        september: 0, october: 0, november: 0, december: 0
      });
    }
    
    setEditMode(true);
  };

  const handleSaveData = async () => {
    try {
      const currentUserStr = localStorage.getItem('currentUser');
      const currentUser = JSON.parse(currentUserStr);
      const token = currentUser.token;

      const payload = {
        data_type: 'recycled_metal',
        year: editingYear,
        metric_type: editingMetric,
        ...formData
      };

      let response;
      const isUpdate = comparisonData?.metrics?.[editingMetric]?.data_year1?.year === editingYear ||
                       comparisonData?.metrics?.[editingMetric]?.data_year2?.year === editingYear;

      if (isUpdate) {
        const dataId = editingYear === selectedYear1 
          ? comparisonData.metrics[editingMetric].data_year1.id
          : comparisonData.metrics[editingMetric].data_year2.id;

        response = await fetch(`${BACKEND_URL}/api/environmental/data/${dataId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(formData)
        });
      } else {
        response = await fetch(`${BACKEND_URL}/api/environmental/data`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
      }

      if (response.ok) {
        alert('Data saved successfully!');
        setEditMode(false);
        fetchAvailableYears();
        fetchComparisonData();
      } else {
        const error = await response.json();
        alert('Error: ' + (error.detail || 'Failed to save'));
      }
    } catch (error) {
      console.error('Error saving data:', error);
      alert('Error saving data');
    }
  };

  const handlePrintAllCharts = async () => {
    try {
      // Pull footer info from Document Control register
      const dc = await getControlledDocumentByModule('Recycled Metal', {
        fallback: 'Recycled Metal', docType: 'Form',
      });
      const fmtRev = (iso) => {
        if (!iso) return '';
        if (iso.length >= 10 && iso[4] === '-' && iso[7] === '-') return `${iso.slice(8,10)}/${iso.slice(5,7)}/${iso.slice(0,4)}`;
        return iso;
      };
      const fNo = dc?.form_no || '—';
      const fIss = dc?.issue || '—';
      const fRev = dc?.revision_date ? fmtRev(dc.revision_date) : '—';
      const fOwn = dc?.owner || '—';
      const fTit = dc?.title || 'Recycled Metal';
      // Create PDF in landscape orientation
      const pdf = new jsPDF('l', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      // Get the PDF content container
      const container = document.getElementById('recycled-metal-pdf-content');
      if (!container) {
        alert('Unable to find content to export');
        return;
      }
      
      // Get all direct children (each is a Card component)
      const cards = Array.from(container.children);
      
      if (cards.length === 0) {
        alert('Unable to find charts to export');
        return;
      }
      
      // Skip the first card (Year Selector) - only process chart cards (indices 1, 2, 3)
      const chartCards = cards.slice(1);  // Skip index 0
      
      if (chartCards.length === 0) {
        alert('Unable to find charts to export');
        return;
      }
      
      let pageNumber = 1;
      const totalPages = chartCards.length;
      
      // Process each chart card
      for (let i = 0; i < chartCards.length; i++) {
        const card = chartCards[i];
        
        // Hide buttons in this card
        const buttons = card.querySelectorAll('button');
        buttons.forEach(b => b.style.display = 'none');
        
        // Wait a bit for render
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Capture this card as image
        const canvas = await html2canvas(card, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff'
        });
        
        // Restore buttons
        buttons.forEach(b => b.style.display = '');
        
        // Convert to image
        const imgData = canvas.toDataURL('image/png', 0.95);
        
        // Calculate dimensions to fit the page (leave space for footer)
        const footerHeight = 15;  // mm for footer space
        const availableHeight = pdfHeight - footerHeight;
        
        const imgWidth = canvas.width;
        const imgHeight = canvas.height;
        const ratio = Math.min(pdfWidth / imgWidth, availableHeight / imgHeight);
        
        const scaledWidth = imgWidth * ratio;
        const scaledHeight = imgHeight * ratio;
        
        // Center the image on the page
        const xOffset = (pdfWidth - scaledWidth) / 2;
        const yOffset = (availableHeight - scaledHeight) / 2;
        
        // Add new page if not first
        if (i > 0) {
          pdf.addPage();
        }
        
        // Add image to PDF
        pdf.addImage(imgData, 'PNG', xOffset, yOffset, scaledWidth, scaledHeight, undefined, 'FAST');
        
        // Add ISO-compliant Document Control footer pulled live from register
        const footerY = pdfHeight - 8;  // 8mm from bottom
        pdf.setFontSize(9);
        pdf.setTextColor(0, 0, 0);
        const dcLine = `Form No: ${fNo}   |   Issue: ${fIss}   |   Revision Date: ${fRev}   |   Owner: ${fOwn}   |   Title: ${fTit}`;
        pdf.text(dcLine, 10, footerY - 3);
        pdf.setTextColor(100, 100, 100);
        pdf.text(`Page ${pageNumber} of ${totalPages}`, pdfWidth - 40, footerY + 2);
        
        pageNumber++;
      }
      
      pdf.save(`Recycled_Metal_${selectedYear1}_vs_${selectedYear2}.pdf`);
      
    } catch (error) {
      console.error('PDF Error:', error);
      alert('Error creating PDF: ' + error.message);
    }
  };

  // Helper function to create chart data for a specific metric
  const createChartData = (metric) => {
    const metricData = comparisonData?.metrics?.[metric];
    if (!metricData) return null;

    return {
      labels: ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'],
      datasets: [
        {
          label: selectedYear1.toString(),
          data: metricData.data_year1 ? [
            metricData.data_year1.january,
            metricData.data_year1.february,
            metricData.data_year1.march,
            metricData.data_year1.april,
            metricData.data_year1.may,
            metricData.data_year1.june,
            metricData.data_year1.july,
            metricData.data_year1.august,
            metricData.data_year1.september,
            metricData.data_year1.october,
            metricData.data_year1.november,
            metricData.data_year1.december
          ] : [],
          backgroundColor: 'rgba(251, 146, 60, 0.8)',
          borderColor: 'rgb(251, 146, 60)',
          borderWidth: 1
        },
        {
          label: selectedYear2.toString(),
          data: metricData.data_year2 ? [
            metricData.data_year2.january,
            metricData.data_year2.february,
            metricData.data_year2.march,
            metricData.data_year2.april,
            metricData.data_year2.may,
            metricData.data_year2.june,
            metricData.data_year2.july,
            metricData.data_year2.august,
            metricData.data_year2.september,
            metricData.data_year2.october,
            metricData.data_year2.november,
            metricData.data_year2.december
          ] : [],
          backgroundColor: 'rgba(59, 130, 246, 0.8)',
          borderColor: 'rgb(59, 130, 246)',
          borderWidth: 1
        }
      ]
    };
  };

  const getChartOptions = (title, yAxisLabel) => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: title,
        font: {
          size: 16,
          weight: 'bold'
        },
        color: '#dc2626'
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: yAxisLabel
        }
      }
    }
  });

  const mildSteelChartData = createChartData('mild_steel');
  const stainlessSteelChartData = createChartData('stainless_steel');
  const aluminiumChartData = createChartData('aluminium');

  // Helper function to safely calculate annual total from monthly data
  const calculateAnnualTotal = (data) => {
    if (!data) return 0;
    const months = ['january', 'february', 'march', 'april', 'may', 'june', 
                    'july', 'august', 'september', 'october', 'november', 'december'];
    const total = months.reduce((sum, month) => sum + (parseFloat(data[month]) || 0), 0);
    return total;
  };

  // Helper function to count months with data across all materials
  const countMonthsWithData = (year) => {
    if (!comparisonData) return 0;
    const months = ['january', 'february', 'march', 'april', 'may', 'june', 
                    'july', 'august', 'september', 'october', 'november', 'december'];
    const metrics = ['mild_steel', 'stainless_steel', 'aluminium'];
    
    const monthsWithData = new Set();
    
    months.forEach(month => {
      // Check if any material has data for this month
      const hasData = metrics.some(metric => {
        const data = year === 1 
          ? comparisonData.metrics[metric].data_year1 
          : comparisonData.metrics[metric].data_year2;
        return data && parseFloat(data[month]) > 0;
      });
      
      if (hasData) {
        monthsWithData.add(month);
      }
    });
    
    return monthsWithData.size;
  };

  // Calculate totals for both years
  const year1Totals = comparisonData ? {
    mild_steel: calculateAnnualTotal(comparisonData.metrics.mild_steel.data_year1),
    stainless_steel: calculateAnnualTotal(comparisonData.metrics.stainless_steel.data_year1),
    aluminium: calculateAnnualTotal(comparisonData.metrics.aluminium.data_year1)
  } : { mild_steel: 0, stainless_steel: 0, aluminium: 0 };

  const year2Totals = comparisonData ? {
    mild_steel: calculateAnnualTotal(comparisonData.metrics.mild_steel.data_year2),
    stainless_steel: calculateAnnualTotal(comparisonData.metrics.stainless_steel.data_year2),
    aluminium: calculateAnnualTotal(comparisonData.metrics.aluminium.data_year2)
  } : { mild_steel: 0, stainless_steel: 0, aluminium: 0 };

  const year1Total = year1Totals.mild_steel + year1Totals.stainless_steel + year1Totals.aluminium;
  const year2Total = year2Totals.mild_steel + year2Totals.stainless_steel + year2Totals.aluminium;
  
  // Count actual months with data
  const year1MonthCount = countMonthsWithData(1);
  const year2MonthCount = countMonthsWithData(2);
  
  // Calculate averages based on actual months with data
  const year1Average = year1MonthCount > 0 ? year1Total / year1MonthCount : 0;
  const year2Average = year2MonthCount > 0 ? year2Total / year2MonthCount : 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Recycled Metal (ISO/IMS)</h1>
          <p className="text-gray-600 mt-1">Track monthly scrap metal recycling - 3 material types</p>
        </div>
        <Button onClick={handlePrintAllCharts} variant="default">
          <FileDown className="w-4 h-4 mr-2" />
          Save as PDF
        </Button>
      </div>
      
      {/* PDF Content Container - This will be captured */}
      <div id="recycled-metal-pdf-content">

      {/* Year Selector Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex justify-between items-center">
            <span>Compare Years</span>
            <Button size="sm" onClick={() => setShowAddYear(true)} variant="outline">
              <Plus className="w-4 h-4 mr-2" />
              Add New Year
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Year 1 (Previous)</Label>
              <select
                className="w-full border rounded p-2"
                value={selectedYear1}
                onChange={(e) => setSelectedYear1(parseInt(e.target.value))}
              >
                {availableYears.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Year 2 (Current)</Label>
              <select
                className="w-full border rounded p-2"
                value={selectedYear2}
                onChange={(e) => setSelectedYear2(parseInt(e.target.value))}
              >
                {availableYears.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Overall Summary Card */}
      {comparisonData && (
        <Card className="bg-gradient-to-r from-green-50 to-blue-50 border-2 border-green-200">
          <CardHeader>
            <CardTitle className="text-center text-2xl">
              📊 TOTAL RECYCLED METAL SUMMARY
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-6">
              {/* Year 1 Summary */}
              <div className="bg-white p-6 rounded-lg shadow-md">
                <h3 className="text-xl font-bold text-center text-orange-600 mb-4">{selectedYear1}</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Mild Steel:</span>
                    <span className="font-semibold">{year1Totals.mild_steel.toFixed(1)} tonnes</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Stainless Steel:</span>
                    <span className="font-semibold">{year1Totals.stainless_steel.toFixed(1)} tonnes</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Aluminium:</span>
                    <span className="font-semibold">{year1Totals.aluminium.toFixed(1)} tonnes</span>
                  </div>
                  <div className="border-t-2 pt-3 mt-3">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-bold">TOTAL ANNUAL:</span>
                      <span className="text-2xl font-bold text-orange-600">{year1Total.toFixed(1)} t</span>
                    </div>
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-sm font-medium">Average/Month:</span>
                      <span className={`text-xl font-bold ${year1Average >= 50 ? 'text-green-600' : 'text-red-600'}`}>
                        {year1Average.toFixed(1)} t/mo
                      </span>
                    </div>
                    <div className="text-center text-xs text-gray-500 mt-1">
                      (Based on {year1MonthCount} month{year1MonthCount !== 1 ? 's' : ''} of data)
                    </div>
                    <div className="mt-2 text-center">
                      {year1Average >= 50 ? (
                        <span className="text-green-600 font-semibold text-sm">
                          ✅ TARGET MET! (+{(year1Average - 50).toFixed(1)} t/mo)
                        </span>
                      ) : (
                        <span className="text-red-600 font-semibold text-sm">
                          ❌ Below Target (-{(50 - year1Average).toFixed(1)} t/mo)
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Year 2 Summary */}
              <div className="bg-white p-6 rounded-lg shadow-md">
                <h3 className="text-xl font-bold text-center text-blue-600 mb-4">{selectedYear2}</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Mild Steel:</span>
                    <span className="font-semibold">{year2Totals.mild_steel.toFixed(1)} tonnes</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Stainless Steel:</span>
                    <span className="font-semibold">{year2Totals.stainless_steel.toFixed(1)} tonnes</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Aluminium:</span>
                    <span className="font-semibold">{year2Totals.aluminium.toFixed(1)} tonnes</span>
                  </div>
                  <div className="border-t-2 pt-3 mt-3">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-bold">TOTAL ANNUAL:</span>
                      <span className="text-2xl font-bold text-blue-600">{year2Total.toFixed(1)} t</span>
                    </div>
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-sm font-medium">Average/Month:</span>
                      <span className={`text-xl font-bold ${year2Average >= 50 ? 'text-green-600' : 'text-red-600'}`}>
                        {year2Average.toFixed(1)} t/mo
                      </span>
                    </div>
                    <div className="text-center text-xs text-gray-500 mt-1">
                      (Based on {year2MonthCount} month{year2MonthCount !== 1 ? 's' : ''} of data)
                    </div>
                    <div className="mt-2 text-center">
                      {year2Average >= 50 ? (
                        <span className="text-green-600 font-semibold text-sm">
                          ✅ TARGET MET! (+{(year2Average - 50).toFixed(1)} t/mo)
                        </span>
                      ) : (
                        <span className="text-red-600 font-semibold text-sm">
                          ❌ Below Target (-{(50 - year2Average).toFixed(1)} t/mo)
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Target Reference */}
            <div className="mt-6 text-center bg-yellow-50 p-4 rounded-lg border border-yellow-200">
              <p className="text-lg font-bold text-gray-700">🎯 Monthly Target: <span className="text-yellow-600">50 Tonnes/Month</span></p>
              <p className="text-sm text-gray-600 mt-1">Annual Target: 600 Tonnes (50 tonnes × 12 months)</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Chart 1: Mild Steel */}
      {mildSteelChartData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              <span>MILD STEEL {selectedYear1} / {selectedYear2}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => handleEditYear(selectedYear1, 'mild_steel', comparisonData.metrics.mild_steel.data_year1)}>
                  <Edit className="w-4 h-4 mr-1" /> Edit {selectedYear1}
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleEditYear(selectedYear2, 'mild_steel', comparisonData.metrics.mild_steel.data_year2)}>
                  <Edit className="w-4 h-4 mr-1" /> Edit {selectedYear2}
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ height: '400px' }}>
              <Bar data={mildSteelChartData} options={getChartOptions('MILD STEEL - TONNES', 'Tonnes')} />
            </div>
            {comparisonData.metrics.mild_steel.total_change_percent !== 0 && (
              <div className="mt-6 p-4 bg-gray-50 rounded-lg border">
                <div className="text-center">
                  <p className={`text-2xl font-bold ${!comparisonData.metrics.mild_steel.is_reduction ? 'text-green-600' : 'text-red-600'}`}>
                    {!comparisonData.metrics.mild_steel.is_reduction ? '✅ Increase: ' : '❌ Decrease: '}
                    {Math.abs(comparisonData.metrics.mild_steel.total_change_percent)}%
                  </p>
                  <p className="text-sm text-gray-600 mt-2">
                    Comparable Total {selectedYear1}: {comparisonData.metrics.mild_steel.total1_comparable?.toLocaleString() || 0} tonnes | 
                    Comparable Total {selectedYear2}: {comparisonData.metrics.mild_steel.total2_comparable?.toLocaleString() || 0} tonnes
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    (Based on {comparisonData.metrics.mild_steel.comparable_months} months with data in both years)
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    {!comparisonData.metrics.mild_steel.is_reduction ? 'Additional Recycling' : 'Reduction'}: 
                    {Math.abs((comparisonData.metrics.mild_steel.total2_comparable || 0) - (comparisonData.metrics.mild_steel.total1_comparable || 0)).toLocaleString()} tonnes
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Chart 2: Stainless Steel */}
      {stainlessSteelChartData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              <span>STAINLESS STEEL {selectedYear1} / {selectedYear2}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => handleEditYear(selectedYear1, 'stainless_steel', comparisonData.metrics.stainless_steel.data_year1)}>
                  <Edit className="w-4 h-4 mr-1" /> Edit {selectedYear1}
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleEditYear(selectedYear2, 'stainless_steel', comparisonData.metrics.stainless_steel.data_year2)}>
                  <Edit className="w-4 h-4 mr-1" /> Edit {selectedYear2}
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ height: '400px' }}>
              <Bar data={stainlessSteelChartData} options={getChartOptions('STAINLESS STEEL - TONNES', 'Tonnes')} />
            </div>
            {comparisonData.metrics.stainless_steel.total_change_percent !== 0 && (
              <div className="mt-6 p-4 bg-gray-50 rounded-lg border">
                <div className="text-center">
                  <p className={`text-2xl font-bold ${!comparisonData.metrics.stainless_steel.is_reduction ? 'text-green-600' : 'text-red-600'}`}>
                    {!comparisonData.metrics.stainless_steel.is_reduction ? '✅ Increase: ' : '❌ Decrease: '}
                    {Math.abs(comparisonData.metrics.stainless_steel.total_change_percent)}%
                  </p>
                  <p className="text-sm text-gray-600 mt-2">
                    Comparable Total {selectedYear1}: {comparisonData.metrics.stainless_steel.total1_comparable?.toLocaleString() || 0} tonnes | 
                    Comparable Total {selectedYear2}: {comparisonData.metrics.stainless_steel.total2_comparable?.toLocaleString() || 0} tonnes
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    (Based on {comparisonData.metrics.stainless_steel.comparable_months} months with data in both years)
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    {!comparisonData.metrics.stainless_steel.is_reduction ? 'Additional Recycling' : 'Reduction'}: 
                    {Math.abs((comparisonData.metrics.stainless_steel.total2_comparable || 0) - (comparisonData.metrics.stainless_steel.total1_comparable || 0)).toLocaleString()} tonnes
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Chart 3: Aluminium */}
      {aluminiumChartData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              <span>ALUMINIUM {selectedYear1} / {selectedYear2}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => handleEditYear(selectedYear1, 'aluminium', comparisonData.metrics.aluminium.data_year1)}>
                  <Edit className="w-4 h-4 mr-1" /> Edit {selectedYear1}
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleEditYear(selectedYear2, 'aluminium', comparisonData.metrics.aluminium.data_year2)}>
                  <Edit className="w-4 h-4 mr-1" /> Edit {selectedYear2}
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ height: '400px' }}>
              <Bar data={aluminiumChartData} options={getChartOptions('ALUMINIUM - TONNES', 'Tonnes')} />
            </div>
            {comparisonData.metrics.aluminium.total_change_percent !== 0 && (
              <div className="mt-6 p-4 bg-gray-50 rounded-lg border">
                <div className="text-center">
                  <p className={`text-2xl font-bold ${!comparisonData.metrics.aluminium.is_reduction ? 'text-green-600' : 'text-red-600'}`}>
                    {!comparisonData.metrics.aluminium.is_reduction ? '✅ Increase: ' : '❌ Decrease: '}
                    {Math.abs(comparisonData.metrics.aluminium.total_change_percent)}%
                  </p>
                  <p className="text-sm text-gray-600 mt-2">
                    Comparable Total {selectedYear1}: {comparisonData.metrics.aluminium.total1_comparable?.toLocaleString() || 0} tonnes | 
                    Comparable Total {selectedYear2}: {comparisonData.metrics.aluminium.total2_comparable?.toLocaleString() || 0} tonnes
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    (Based on {comparisonData.metrics.aluminium.comparable_months} months with data in both years)
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    {!comparisonData.metrics.aluminium.is_reduction ? 'Additional Recycling' : 'Reduction'}: 
                    {Math.abs((comparisonData.metrics.aluminium.total2_comparable || 0) - (comparisonData.metrics.aluminium.total1_comparable || 0)).toLocaleString()} tonnes
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      </div> {/* End PDF Content Container */}

      {/* Add New Year Dialog */}
      {showAddYear && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Add New Year Data</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Year</Label>
                <Input
                  type="number"
                  value={newYear}
                  onChange={(e) => setNewYear(e.target.value)}
                  placeholder="e.g., 2026"
                  min="2000"
                  max="2100"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleAddYear}
                  className="flex-1"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Continue
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowAddYear(false)}
                  className="flex-1"
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Edit Dialog */}
      {editMode && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle>
                Edit {editingMetric === 'mild_steel' ? 'Mild Steel' : editingMetric === 'stainless_steel' ? 'Stainless Steel' : 'Aluminium'} Data - {editingYear}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-4 gap-4">
                {Object.keys(formData).map((month) => (
                  <div key={month}>
                    <Label className="capitalize">{month}</Label>
                    <Input
                      type="number"
                      value={formData[month]}
                      onChange={(e) => setFormData({...formData, [month]: parseFloat(e.target.value) || 0})}
                      placeholder="Tonnes"
                    />
                  </div>
                ))}
              </div>
              
              <div className="flex gap-2 pt-4">
                <Button
                  onClick={handleSaveData}
                  className="flex-1"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save Data
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setEditMode(false)}
                  className="flex-1"
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default RecycledMetal;
