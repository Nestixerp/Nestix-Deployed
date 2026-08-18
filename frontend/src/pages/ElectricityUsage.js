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

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

const ElectricityUsage = () => {
  const [availableYears, setAvailableYears] = useState([]);
  const [selectedYear1, setSelectedYear1] = useState(2024);
  const [selectedYear2, setSelectedYear2] = useState(2025);
  const [comparisonData, setComparisonData] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editingYear, setEditingYear] = useState(null);
  const [editingMetric, setEditingMetric] = useState('dollars');
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
    if (availableYears.length >= 2) {
      setSelectedYear1(availableYears[1] || 2024);
      setSelectedYear2(availableYears[0] || 2025);
    }
  }, [availableYears]);

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

      const response = await fetch(`${BACKEND_URL}/api/environmental/years/electricity`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setAvailableYears(data.years || [2024, 2025]);
    } catch (error) {
      console.error('Error fetching years:', error);
      setAvailableYears([2024, 2025]);
    }
  };

  const fetchComparisonData = async () => {
    try {
      const currentUserStr = localStorage.getItem('currentUser');
      const currentUser = JSON.parse(currentUserStr);
      const token = currentUser.token;

      const response = await fetch(
        `${BACKEND_URL}/api/environmental/comparison-multi/electricity/${selectedYear1}/${selectedYear2}`,
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
    if (year && year >= 2020 && year <= 2100 && !availableYears.includes(year)) {
      setAvailableYears([...availableYears, year].sort((a, b) => b - a));
      setShowAddYear(false);
      setNewYear('');
      // Start editing the new year for dollars metric
      handleEditYear(year, 'dollars', null);
    } else {
      alert('Invalid year or year already exists');
    }
  };

  const handleEditYear = (year, metric, data) => {
    setEditingYear(year);
    setEditingMetric(metric);
    setFormData({
      january: data?.january || 0,
      february: data?.february || 0,
      march: data?.march || 0,
      april: data?.april || 0,
      may: data?.may || 0,
      june: data?.june || 0,
      july: data?.july || 0,
      august: data?.august || 0,
      september: data?.september || 0,
      october: data?.october || 0,
      november: data?.november || 0,
      december: data?.december || 0
    });
    setEditMode(true);
  };

  const handleSave = async () => {
    try {
      const currentUserStr = localStorage.getItem('currentUser');
      const currentUser = JSON.parse(currentUserStr);
      const token = currentUser.token;

      const payload = {
        data_type: 'electricity',
        metric_type: editingMetric,
        year: editingYear,
        ...formData
      };

      const metricData = comparisonData?.metrics?.[editingMetric];
      const existingData = metricData?.data_year1?.year === editingYear 
        ? metricData.data_year1 
        : metricData?.data_year2?.year === editingYear 
          ? metricData.data_year2 
          : null;

      let response;
      if (existingData && existingData.id) {
        response = await fetch(`${BACKEND_URL}/api/environmental/data/${existingData.id}`, {
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
      const dc = await getControlledDocumentByModule('Electricity Usage', {
        fallback: 'Electricity Usage', docType: 'Form',
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
      const fTit = dc?.title || 'Electricity Usage';
      // Create PDF in landscape orientation
      const pdf = new jsPDF('l', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      // Get the PDF content container
      const container = document.getElementById('electricity-pdf-content');
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
      
      pdf.save(`Electricity_Usage_${selectedYear1}_vs_${selectedYear2}.pdf`);
      
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
          backgroundColor: 'rgba(59, 130, 246, 0.8)',
          borderColor: 'rgb(59, 130, 246)',
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
          backgroundColor: 'rgba(251, 146, 60, 0.8)',
          borderColor: 'rgb(251, 146, 60)',
          borderWidth: 1
        }
      ]
    };
  };

  // Helper function to get chart options for a metric
  const getChartOptions = (title, yAxisLabel) => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: false, // Disable animation for better print compatibility
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

  const dollarsChartData = createChartData('dollars');
  const emissionsChartData = createChartData('emissions');
  const kwhChartData = createChartData('kwh');

  // Helper function to safely calculate annual total from monthly data
  const calculateAnnualTotal = (data) => {
    if (!data) return 0;
    const months = ['january', 'february', 'march', 'april', 'may', 'june', 
                    'july', 'august', 'september', 'october', 'november', 'december'];
    const total = months.reduce((sum, month) => sum + (parseFloat(data[month]) || 0), 0);
    return total;
  };

  // Helper function to count months with data across all metrics
  const countMonthsWithData = (year) => {
    if (!comparisonData) return 0;
    const months = ['january', 'february', 'march', 'april', 'may', 'june', 
                    'july', 'august', 'september', 'october', 'november', 'december'];
    const metrics = ['dollars', 'emissions', 'kwh'];
    
    const monthsWithData = new Set();
    
    months.forEach(month => {
      // Check if any metric has data for this month
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
    dollars: calculateAnnualTotal(comparisonData.metrics.dollars.data_year1),
    emissions: calculateAnnualTotal(comparisonData.metrics.emissions.data_year1),
    kwh: calculateAnnualTotal(comparisonData.metrics.kwh.data_year1)
  } : { dollars: 0, emissions: 0, kwh: 0 };

  const year2Totals = comparisonData ? {
    dollars: calculateAnnualTotal(comparisonData.metrics.dollars.data_year2),
    emissions: calculateAnnualTotal(comparisonData.metrics.emissions.data_year2),
    kwh: calculateAnnualTotal(comparisonData.metrics.kwh.data_year2)
  } : { dollars: 0, emissions: 0, kwh: 0 };

  // Count actual months with data
  const year1MonthCount = countMonthsWithData(1);
  const year2MonthCount = countMonthsWithData(2);
  
  // Calculate averages based on actual months with data
  const year1AvgDollars = year1MonthCount > 0 ? year1Totals.dollars / year1MonthCount : 0;
  const year2AvgDollars = year2MonthCount > 0 ? year2Totals.dollars / year2MonthCount : 0;
  const year1AvgEmissions = year1MonthCount > 0 ? year1Totals.emissions / year1MonthCount : 0;
  const year2AvgEmissions = year2MonthCount > 0 ? year2Totals.emissions / year2MonthCount : 0;
  const year1AvgKwh = year1MonthCount > 0 ? year1Totals.kwh / year1MonthCount : 0;
  const year2AvgKwh = year2MonthCount > 0 ? year2Totals.kwh / year2MonthCount : 0;

  // Calculate percentage changes
  const dollarsChange = year1Totals.dollars > 0 ? ((year2Totals.dollars - year1Totals.dollars) / year1Totals.dollars * 100) : 0;
  const emissionsChange = year1Totals.emissions > 0 ? ((year2Totals.emissions - year1Totals.emissions) / year1Totals.emissions * 100) : 0;
  const kwhChange = year1Totals.kwh > 0 ? ((year2Totals.kwh - year1Totals.kwh) / year1Totals.kwh * 100) : 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Electricity Usage (ISO/IMS)</h1>
          <p className="text-gray-600 mt-1">Track monthly electricity consumption - 3 metrics</p>
        </div>
        <Button onClick={handlePrintAllCharts} variant="default">
          <FileDown className="w-4 h-4 mr-2" />
          Save as PDF
        </Button>
      </div>
      
      {/* PDF Content Container - This will be captured */}
      <div id="electricity-pdf-content">

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
        <Card className="bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-purple-200">
          <CardHeader>
            <CardTitle className="text-center text-2xl">
              ⚡ ELECTRICITY USAGE SUMMARY
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-6">
              {/* Year 1 Summary */}
              <div className="bg-white p-6 rounded-lg shadow-md">
                <h3 className="text-xl font-bold text-center text-orange-600 mb-4">{selectedYear1}</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">💰 Total Cost:</span>
                    <span className="font-semibold">${year1Totals.dollars.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">☁️ Emissions:</span>
                    <span className="font-semibold">{year1Totals.emissions.toFixed(1)} tonnes</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">⚡ Usage:</span>
                    <span className="font-semibold">{year1Totals.kwh.toLocaleString()} kWh</span>
                  </div>
                  <div className="border-t-2 pt-3 mt-3">
                    <div className="text-center text-xs text-gray-500 mb-2">
                      Monthly Averages (Based on {year1MonthCount} month{year1MonthCount !== 1 ? 's' : ''})
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Cost/Month:</span>
                        <span className="font-semibold">${year1AvgDollars.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Emissions/Month:</span>
                        <span className="font-semibold">{year1AvgEmissions.toFixed(1)} t</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Usage/Month:</span>
                        <span className="font-semibold">{year1AvgKwh.toLocaleString(undefined, {maximumFractionDigits: 0})} kWh</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Year 2 Summary */}
              <div className="bg-white p-6 rounded-lg shadow-md">
                <h3 className="text-xl font-bold text-center text-blue-600 mb-4">{selectedYear2}</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">💰 Total Cost:</span>
                    <span className="font-semibold">${year2Totals.dollars.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">☁️ Emissions:</span>
                    <span className="font-semibold">{year2Totals.emissions.toFixed(1)} tonnes</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">⚡ Usage:</span>
                    <span className="font-semibold">{year2Totals.kwh.toLocaleString()} kWh</span>
                  </div>
                  <div className="border-t-2 pt-3 mt-3">
                    <div className="text-center text-xs text-gray-500 mb-2">
                      Monthly Averages (Based on {year2MonthCount} month{year2MonthCount !== 1 ? 's' : ''})
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Cost/Month:</span>
                        <span className="font-semibold">${year2AvgDollars.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Emissions/Month:</span>
                        <span className="font-semibold">{year2AvgEmissions.toFixed(1)} t</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Usage/Month:</span>
                        <span className="font-semibold">{year2AvgKwh.toLocaleString(undefined, {maximumFractionDigits: 0})} kWh</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Year-over-Year Comparison */}
            <div className="mt-6 bg-white p-6 rounded-lg shadow-md">
              <h4 className="text-lg font-bold text-center mb-4">📊 Year-over-Year Changes</h4>
              <div className="grid grid-cols-3 gap-4">
                {/* Cost Change */}
                <div className="text-center p-4 rounded-lg bg-gray-50">
                  <div className="text-sm text-gray-600 mb-2">💰 Cost</div>
                  <div className={`text-2xl font-bold ${dollarsChange < 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {dollarsChange < 0 ? '↓' : '↑'} {Math.abs(dollarsChange).toFixed(1)}%
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {dollarsChange < 0 ? (
                      <span className="text-green-600">✅ Reduced ${Math.abs(year2Totals.dollars - year1Totals.dollars).toLocaleString()}</span>
                    ) : (
                      <span className="text-red-600">↑ Increased ${Math.abs(year2Totals.dollars - year1Totals.dollars).toLocaleString()}</span>
                    )}
                  </div>
                </div>

                {/* Emissions Change */}
                <div className="text-center p-4 rounded-lg bg-gray-50">
                  <div className="text-sm text-gray-600 mb-2">☁️ Emissions</div>
                  <div className={`text-2xl font-bold ${emissionsChange < 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {emissionsChange < 0 ? '↓' : '↑'} {Math.abs(emissionsChange).toFixed(1)}%
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {emissionsChange < 0 ? (
                      <span className="text-green-600">✅ Reduced {Math.abs(year2Totals.emissions - year1Totals.emissions).toFixed(1)} tonnes</span>
                    ) : (
                      <span className="text-red-600">↑ Increased {Math.abs(year2Totals.emissions - year1Totals.emissions).toFixed(1)} tonnes</span>
                    )}
                  </div>
                </div>

                {/* Usage Change */}
                <div className="text-center p-4 rounded-lg bg-gray-50">
                  <div className="text-sm text-gray-600 mb-2">⚡ Usage</div>
                  <div className={`text-2xl font-bold ${kwhChange < 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {kwhChange < 0 ? '↓' : '↑'} {Math.abs(kwhChange).toFixed(1)}%
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {kwhChange < 0 ? (
                      <span className="text-green-600">✅ Reduced {Math.abs(year2Totals.kwh - year1Totals.kwh).toLocaleString()} kWh</span>
                    ) : (
                      <span className="text-red-600">↑ Increased {Math.abs(year2Totals.kwh - year1Totals.kwh).toLocaleString()} kWh</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Overall Assessment */}
              <div className="mt-4 text-center p-4 bg-gradient-to-r from-blue-50 to-green-50 rounded-lg">
                {(dollarsChange < 0 && emissionsChange < 0 && kwhChange < 0) ? (
                  <div>
                    <span className="text-2xl">🎉</span>
                    <p className="text-lg font-bold text-green-600 mt-2">Excellent Progress!</p>
                    <p className="text-sm text-gray-600">All metrics show improvement from {selectedYear1} to {selectedYear2}</p>
                  </div>
                ) : (dollarsChange < 0 || emissionsChange < 0 || kwhChange < 0) ? (
                  <div>
                    <span className="text-2xl">📈</span>
                    <p className="text-lg font-bold text-blue-600 mt-2">Mixed Performance</p>
                    <p className="text-sm text-gray-600">Some metrics improved, continue monitoring for optimization opportunities</p>
                  </div>
                ) : (
                  <div>
                    <span className="text-2xl">⚠️</span>
                    <p className="text-lg font-bold text-orange-600 mt-2">Attention Needed</p>
                    <p className="text-sm text-gray-600">All metrics increased - review energy efficiency measures</p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Chart 1: Total Dollars */}
      {dollarsChartData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              <span>ELECTRICITY USAGE {selectedYear1} / {selectedYear2}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => handleEditYear(selectedYear1, 'dollars', comparisonData.metrics.dollars.data_year1)}>
                  <Edit className="w-4 h-4 mr-1" /> Edit {selectedYear1}
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleEditYear(selectedYear2, 'dollars', comparisonData.metrics.dollars.data_year2)}>
                  <Edit className="w-4 h-4 mr-1" /> Edit {selectedYear2}
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ height: '400px' }}>
              <Bar data={dollarsChartData} options={getChartOptions('TOTAL - DOLLARS', 'Dollars ($)')} />
            </div>
            {comparisonData.metrics.dollars.comparable_months > 0 && (
              <div className="mt-6 p-4 bg-gray-50 rounded-lg border">
                <div className="text-center">
                  <p className={`text-2xl font-bold ${comparisonData.metrics.dollars.is_reduction ? 'text-green-600' : (comparisonData.metrics.dollars.total_change_percent === 0 ? 'text-slate-600' : 'text-red-600')}`}>
                    {comparisonData.metrics.dollars.total_change_percent === 0
                      ? '➖ No Change: '
                      : (comparisonData.metrics.dollars.is_reduction ? '✅ Cost Reduction: ' : '❌ Cost Increase: ')}
                    {Math.abs(comparisonData.metrics.dollars.total_change_percent)}%
                  </p>
                  <p className="text-sm text-gray-600 mt-2">
                    Comparable Total {selectedYear1}: ${comparisonData.metrics.dollars.total1_comparable?.toLocaleString() || 0} | 
                    Comparable Total {selectedYear2}: ${comparisonData.metrics.dollars.total2_comparable?.toLocaleString() || 0}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    (Based on {comparisonData.metrics.dollars.comparable_months} months with data in both years)
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    {comparisonData.metrics.dollars.is_reduction ? 'Savings' : 'Additional Cost'}: 
                    ${Math.abs((comparisonData.metrics.dollars.total2_comparable || 0) - (comparisonData.metrics.dollars.total1_comparable || 0)).toLocaleString()}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Chart 2: Emissions - Screen Version */}
      {emissionsChartData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              <span>ELECTRICITY USAGE {selectedYear1} / {selectedYear2}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => handleEditYear(selectedYear1, 'emissions', comparisonData.metrics.emissions.data_year1)}>
                  <Edit className="w-4 h-4 mr-1" /> Edit {selectedYear1}
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleEditYear(selectedYear2, 'emissions', comparisonData.metrics.emissions.data_year2)}>
                  <Edit className="w-4 h-4 mr-1" /> Edit {selectedYear2}
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ height: '400px' }}>
              <Bar data={emissionsChartData} options={getChartOptions('GREENHOUSE GAS EMISSIONS (TONNES)', 'Tonnes')} />
            </div>
            <div className="mt-4 text-center font-semibold text-gray-700">
              TARGET - REDUCTION IN GREENHOUSE GASES
            </div>
            {comparisonData.metrics.emissions.comparable_months > 0 && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg border">
                <div className="text-center">
                  <p className={`text-2xl font-bold ${comparisonData.metrics.emissions.is_reduction ? 'text-green-600' : (comparisonData.metrics.emissions.total_change_percent === 0 ? 'text-slate-600' : 'text-red-600')}`}>
                    {comparisonData.metrics.emissions.total_change_percent === 0
                      ? '➖ No Change: '
                      : (comparisonData.metrics.emissions.is_reduction ? '✅ Emissions Reduction: ' : '❌ Emissions Increase: ')}
                    {Math.abs(comparisonData.metrics.emissions.total_change_percent)}%
                  </p>
                  <p className="text-sm text-gray-600 mt-2">
                    Comparable Total {selectedYear1}: {comparisonData.metrics.emissions.total1_comparable?.toLocaleString() || 0} Tonnes | 
                    Comparable Total {selectedYear2}: {comparisonData.metrics.emissions.total2_comparable?.toLocaleString() || 0} Tonnes
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    (Based on {comparisonData.metrics.emissions.comparable_months} months with data in both years)
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    {comparisonData.metrics.emissions.is_reduction ? 'Reduction' : 'Additional Emissions'}: 
                    {Math.abs((comparisonData.metrics.emissions.total2_comparable || 0) - (comparisonData.metrics.emissions.total1_comparable || 0)).toLocaleString()} Tonnes
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Chart 3: KWH - Screen Version */}
      {kwhChartData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              <span>ELECTRICITY USAGE {selectedYear1} / {selectedYear2}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => handleEditYear(selectedYear1, 'kwh', comparisonData.metrics.kwh.data_year1)}>
                  <Edit className="w-4 h-4 mr-1" /> Edit {selectedYear1}
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleEditYear(selectedYear2, 'kwh', comparisonData.metrics.kwh.data_year2)}>
                  <Edit className="w-4 h-4 mr-1" /> Edit {selectedYear2}
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ height: '400px' }}>
              <Bar data={kwhChartData} options={getChartOptions('HOURS - KWH', 'KWH')} />
            </div>
            {comparisonData.metrics.kwh.comparable_months > 0 && (
              <div className="mt-6 p-4 bg-gray-50 rounded-lg border">
                <div className="text-center">
                  <p className={`text-2xl font-bold ${comparisonData.metrics.kwh.is_reduction ? 'text-green-600' : (comparisonData.metrics.kwh.total_change_percent === 0 ? 'text-slate-600' : 'text-red-600')}`}>
                    {comparisonData.metrics.kwh.total_change_percent === 0
                      ? '➖ No Change: '
                      : (comparisonData.metrics.kwh.is_reduction ? '✅ Usage Reduction: ' : '❌ Usage Increase: ')}
                    {Math.abs(comparisonData.metrics.kwh.total_change_percent)}%
                  </p>
                  <p className="text-sm text-gray-600 mt-2">
                    Comparable Total {selectedYear1}: {comparisonData.metrics.kwh.total1_comparable?.toLocaleString() || 0} KWH | 
                    Comparable Total {selectedYear2}: {comparisonData.metrics.kwh.total2_comparable?.toLocaleString() || 0} KWH
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    (Based on {comparisonData.metrics.kwh.comparable_months} months with data in both years)
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    {comparisonData.metrics.kwh.is_reduction ? 'Reduction' : 'Additional Usage'}: 
                    {Math.abs((comparisonData.metrics.kwh.total2_comparable || 0) - (comparisonData.metrics.kwh.total1_comparable || 0)).toLocaleString()} KWH
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      </div> {/* End PDF Content Container */}

      {/* Add Year Dialog */}
      {showAddYear && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Add New Year</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Enter Year (e.g., 2026)</Label>
                <Input
                  type="number"
                  value={newYear}
                  onChange={(e) => setNewYear(e.target.value)}
                  placeholder="2026"
                  min="2020"
                  max="2100"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleAddYear} className="flex-1">
                  <Save className="w-4 h-4 mr-2" />
                  Add Year
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAddYear(false);
                    setNewYear('');
                  }}
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
                Edit {editingMetric === 'dollars' ? 'Dollars' : editingMetric === 'emissions' ? 'Emissions (Tonnes)' : 'KWH'} Data - {editingYear}
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
                      placeholder={editingMetric === 'dollars' ? '$' : editingMetric === 'emissions' ? 'Tonnes' : 'KWH'}
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-4">
                <Button onClick={handleSave} className="flex-1">
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

export default ElectricityUsage;
