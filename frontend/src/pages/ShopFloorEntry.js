import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Textarea } from '../components/ui/textarea';
import { 
  Play, Pause, Square, Clock, Search, QrCode, Monitor, Tablet,
  AlertCircle, CheckCircle, Plus, Timer, User
} from 'lucide-react';
import api from '../services/api';

const ShopFloorEntry = () => {
  const [mode, setMode] = useState('desktop'); // 'desktop' or 'tablet'
  const [currentUser, setCurrentUser] = useState(null);
  const [activeJobs, setActiveJobs] = useState([]);
  const [activeEntries, setActiveEntries] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [currentEntry, setCurrentEntry] = useState(null);
  const [noteCategory, setNoteCategory] = useState('general');
  const [noteText, setNoteText] = useState('');
  const [elapsedTimes, setElapsedTimes] = useState({});

  useEffect(() => {
    const userData = localStorage.getItem('currentUser');
    if (userData) {
      try {
        setCurrentUser(JSON.parse(userData));
      } catch (e) {
        console.error('Error parsing user data:', e);
      }
    }
    fetchActiveJobs();
    fetchActiveEntries();
  }, []);

  // Calculate pause duration from pauses array (real-time)
  const calculatePauseSeconds = (pauses) => {
    if (!pauses || pauses.length === 0) return 0;
    
    let totalPauseSeconds = 0;
    for (const pause of pauses) {
      const pauseStart = new Date(pause.pause_start);
      let pauseEnd;
      
      if (pause.pause_end) {
        // Completed pause
        pauseEnd = new Date(pause.pause_end);
      } else {
        // Still paused - calculate up to now
        pauseEnd = new Date();
      }
      
      totalPauseSeconds += Math.floor((pauseEnd - pauseStart) / 1000);
    }
    return totalPauseSeconds;
  };

  // Timer update every second
  useEffect(() => {
    // Initial calculation immediately
    const calculateElapsed = () => {
      const newElapsed = {};
      activeEntries.forEach(entry => {
        if (!entry.start_time) {
          console.error('Entry missing start_time:', entry);
          newElapsed[entry.id] = 0;
          return;
        }
        
        const startTime = new Date(entry.start_time);
        const now = new Date();
        
        // Debug log
        if (Object.keys(elapsedTimes).length === 0) {
          console.log('Timer debug:', {
            jobNumber: entry.job_sheet_number,
            startTime: entry.start_time,
            parsedStart: startTime.toISOString(),
            now: now.toISOString(),
            status: entry.status
          });
        }
        
        const totalSeconds = Math.floor((now - startTime) / 1000);
        
        // Calculate actual pause time from pauses array (real-time)
        const pauseSeconds = calculatePauseSeconds(entry.pauses);
        
        // Active time = total time - pause time
        const activeSeconds = Math.max(0, totalSeconds - pauseSeconds);
        newElapsed[entry.id] = activeSeconds;
      });
      setElapsedTimes(newElapsed);
    };

    // Calculate immediately
    calculateElapsed();
    
    // Then update every second
    const interval = setInterval(calculateElapsed, 1000);

    return () => clearInterval(interval);
  }, [activeEntries]);

  const fetchActiveJobs = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.get('/shop-floor/active-jobs');
      console.log('Active jobs loaded:', response.data.length);
      setActiveJobs(response.data);
    } catch (error) {
      console.error('Error fetching active jobs:', error);
      setError('Failed to load jobs. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchActiveEntries = async () => {
    try {
      const userData = JSON.parse(localStorage.getItem('currentUser') || '{}');
      const response = await api.get('/shop-floor/time-entries/active', {
        params: { operator_id: userData.id }
      });
      setActiveEntries(response.data);
    } catch (error) {
      console.error('Error fetching active entries:', error);
      // Silently fail - don't show error to user
    }
  };

  const startJob = async (job) => {
    try {
      const userData = JSON.parse(localStorage.getItem('currentUser') || '{}');
      
      // Validate user data exists
      if (!userData.id || !userData.name) {
        alert('Error: User session data is missing. Please log out and log in again.');
        return;
      }
      
      const processName = job.process_name || 'General';
      
      console.log('Starting job:', job.job_sheet_number, 'Process:', processName, 'Operator:', userData.name);
      
      const response = await api.post('/shop-floor/time-entries', {
        job_sheet_id: job.id,
        job_sheet_number: job.job_sheet_number,
        process_id: job.process_id || null,
        process_name: processName,
        operator_id: userData.id,
        operator_name: userData.name
      });
      
      console.log('Job started successfully:', response.data);
      
      // Show success feedback
      alert(`✓ Job ${job.job_sheet_number} started successfully!`);
      
      fetchActiveEntries();
      setSelectedJob(null);
    } catch (error) {
      console.error('Error starting job:', error);
      const errorMsg = error.response?.data?.detail || error.message || 'Failed to start job';
      alert(`Failed to start job: ${errorMsg}`);
    }
  };

  const pauseEntry = async (entryId) => {
    try {
      await api.post(`/shop-floor/time-entries/${entryId}/pause`, {
        reason: 'Break/Pause'
      });
      fetchActiveEntries();
    } catch (error) {
      console.error('Error pausing entry:', error);
      const errorMsg = error.response?.data?.detail || error.message || 'Failed to pause timer';
      alert(errorMsg);
    }
  };

  const resumeEntry = async (entryId) => {
    try {
      await api.post(`/shop-floor/time-entries/${entryId}/resume`);
      fetchActiveEntries();
    } catch (error) {
      console.error('Error resuming entry:', error);
      const errorMsg = error.response?.data?.detail || error.message || 'Failed to resume timer';
      alert(errorMsg);
    }
  };

  const stopEntry = async (entryId) => {
    try {
      const response = await api.post(`/shop-floor/time-entries/${entryId}/stop`);
      
      console.log('Stop entry response:', response.data);
      
      const actualMinutes = response.data.actual_duration_minutes || 0;
      let message = `Job completed! Actual time: ${Math.round(actualMinutes)} minutes`;
      
      if (response.data.efficiency) {
        const eff = response.data.efficiency;
        console.log('Efficiency data:', eff);
        
        // Safely extract efficiency values with type checking
        const effPercent = typeof eff.efficiency_percent === 'number' ? eff.efficiency_percent.toFixed(1) : 'N/A';
        const estHours = typeof eff.estimated_hours === 'number' ? eff.estimated_hours.toFixed(2) : 'N/A';
        const actHours = typeof eff.actual_hours === 'number' ? eff.actual_hours.toFixed(2) : 'N/A';
        const hoursSaved = typeof eff.hours_saved === 'number' ? Math.abs(eff.hours_saved).toFixed(2) : 0;
        const moneyImpact = typeof eff.money_impact === 'number' ? Math.abs(eff.money_impact).toFixed(2) : '0.00';
        
        message += `\n\nEfficiency: ${effPercent}%`;
        message += `\nEstimated: ${estHours} hrs | Actual: ${actHours} hrs`;
        
        if (eff.status === 'ahead') {
          message += `\n✅ ${hoursSaved} hours saved! ($${moneyImpact})`;
        } else if (eff.status === 'behind') {
          message += `\n⚠️ ${hoursSaved} hours over estimate ($${moneyImpact})`;
        }
      }
      
      alert(message);
      fetchActiveEntries();
    } catch (error) {
      console.error('Error stopping timer:', error);
      const errorMsg = error.response?.data?.detail || error.message || 'Failed to stop timer';
      alert(errorMsg);
    }
  };

  const addNote = async () => {
    if (!noteText.trim()) {
      alert('Please enter a note');
      return;
    }

    try {
      await api.post(`/shop-floor/time-entries/${currentEntry.id}/notes`, {
        category: noteCategory,
        note: noteText
      });
      
      setNoteText('');
      setShowNoteDialog(false);
      alert('Note added successfully');
    } catch (error) {
      console.error('Error adding note:', error);
      const errorMsg = error.response?.data?.detail || error.message || 'Failed to add note';
      alert(errorMsg);
    }
  };

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const filteredJobs = activeJobs.filter(job => 
    job.job_sheet_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    job.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    job.part_description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const noteCategories = [
    { value: 'tooling', label: 'Tooling Used' },
    { value: 'quality_issues', label: 'Quality Issues' },
    { value: 'material_issues', label: 'Material Issues' },
    { value: 'machine_problems', label: 'Machine Problems' },
    { value: 'setup_notes', label: 'Setup/Changeover' },
    { value: 'general', label: 'General Notes' }
  ];

  const cardClass = mode === 'tablet' ? 'text-lg' : '';
  const buttonSize = mode === 'tablet' ? 'lg' : 'default';

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className={`font-bold ${mode === 'tablet' ? 'text-4xl' : 'text-3xl'}`}>
            Shop Floor Entry
          </h1>
          <p className="text-slate-600">
            Operator: <span className="font-semibold">{currentUser?.name || 'Unknown'}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={mode === 'desktop' ? 'default' : 'outline'}
            size={buttonSize}
            onClick={() => setMode('desktop')}
          >
            <Monitor className="w-4 h-4 mr-2" />
            Desktop
          </Button>
          <Button
            variant={mode === 'tablet' ? 'default' : 'outline'}
            size={buttonSize}
            onClick={() => setMode('tablet')}
          >
            <Tablet className="w-4 h-4 mr-2" />
            Tablet
          </Button>
        </div>
      </div>

      {/* Active Timers */}
      {activeEntries.length > 0 && (
        <Card className="border-2 border-blue-500 bg-blue-50">
          <CardHeader>
            <CardTitle className={cardClass}>
              <Timer className="inline w-6 h-6 mr-2" />
              Active Timers
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {activeEntries.map((entry) => (
              <div 
                key={entry.id} 
                className={`p-4 bg-white rounded-lg border-2 ${
                  entry.status === 'paused' ? 'border-yellow-500' : 'border-green-500'
                }`}
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className={`font-bold ${mode === 'tablet' ? 'text-2xl' : 'text-xl'}`}>
                      {entry.job_sheet_number}
                    </h3>
                    <p className="text-slate-600">{entry.process_name}</p>
                    <Badge variant={entry.status === 'paused' ? 'warning' : 'success'}>
                      {entry.status.toUpperCase()}
                    </Badge>
                  </div>
                  <div className={`text-right ${mode === 'tablet' ? 'text-3xl' : 'text-2xl'} font-mono font-bold`}>
                    {formatTime(elapsedTimes[entry.id] || 0)}
                  </div>
                </div>
                
                <div className="flex gap-2 flex-wrap">
                  {entry.status === 'active' && (
                    <Button
                      size={buttonSize}
                      variant="outline"
                      onClick={() => pauseEntry(entry.id)}
                      className={mode === 'tablet' ? 'text-lg px-6 py-6' : ''}
                    >
                      <Pause className="w-4 h-4 mr-2" />
                      Pause
                    </Button>
                  )}
                  
                  {entry.status === 'paused' && (
                    <Button
                      size={buttonSize}
                      variant="outline"
                      onClick={() => resumeEntry(entry.id)}
                      className={mode === 'tablet' ? 'text-lg px-6 py-6' : ''}
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Resume
                    </Button>
                  )}
                  
                  <Button
                    size={buttonSize}
                    variant="destructive"
                    onClick={() => stopEntry(entry.id)}
                    className={mode === 'tablet' ? 'text-lg px-6 py-6' : ''}
                  >
                    <Square className="w-4 h-4 mr-2" />
                    Complete
                  </Button>
                  
                  <Button
                    size={buttonSize}
                    variant="outline"
                    onClick={() => {
                      setCurrentEntry(entry);
                      setShowNoteDialog(true);
                    }}
                    className={mode === 'tablet' ? 'text-lg px-6 py-6' : ''}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Note
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Job Selection */}
      <Card>
        <CardHeader>
          <CardTitle className={cardClass}>Start New Job</CardTitle>
          <CardDescription>Select a job to begin time tracking</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                placeholder="Search by job number, customer, or part..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={mode === 'tablet' ? 'text-lg p-6' : ''}
              />
            </div>
            <Button 
              size={buttonSize} 
              variant="outline"
              onClick={fetchActiveJobs}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Refresh'}
            </Button>
            <Button size={buttonSize} variant="outline">
              <QrCode className="w-4 h-4 mr-2" />
              Scan QR
            </Button>
          </div>

          {/* Error Message */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Loading State */}
          {loading && (
            <div className="text-center py-8 text-slate-500">
              Loading active jobs...
            </div>
          )}

          {/* Job List */}
          {!loading && (
            <div className={`space-y-2 ${mode === 'tablet' ? 'max-h-[500px]' : 'max-h-96'} overflow-y-auto`}>
              {filteredJobs.map((job) => (
              <div
                key={job.id}
                className="p-4 border rounded-lg hover:bg-slate-50 cursor-pointer"
                onClick={() => startJob(job)}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className={`font-bold ${mode === 'tablet' ? 'text-xl' : 'text-lg'}`}>
                      {job.job_sheet_number}
                    </h4>
                    <p className="text-slate-600">{job.customer_name}</p>
                    <p className="text-sm text-slate-500">{job.part_description}</p>
                    <Badge variant="outline">{job.process_name || 'General'}</Badge>
                  </div>
                  <Button size={buttonSize}>
                    <Play className="w-4 h-4 mr-2" />
                    Start
                  </Button>
                </div>
              </div>
            ))}
            
              {filteredJobs.length === 0 && (
                <div className="text-center py-8 text-slate-500">
                  {searchTerm ? 'No jobs match your search' : 'No active jobs found'}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Note Dialog */}
      {showNoteDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className={`w-full ${mode === 'tablet' ? 'max-w-3xl' : 'max-w-lg'}`}>
            <CardHeader>
              <CardTitle className={cardClass}>Add Note</CardTitle>
              <CardDescription>
                Job: {currentEntry?.job_sheet_number}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className={mode === 'tablet' ? 'text-lg' : ''}>Category</Label>
                <select
                  className={`w-full border rounded-md ${mode === 'tablet' ? 'text-lg p-4' : 'p-2'}`}
                  value={noteCategory}
                  onChange={(e) => setNoteCategory(e.target.value)}
                >
                  {noteCategories.map(cat => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <Label className={mode === 'tablet' ? 'text-lg' : ''}>Note</Label>
                <Textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  rows={4}
                  placeholder="Enter your note here..."
                  className={mode === 'tablet' ? 'text-lg p-4' : ''}
                />
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  size={buttonSize}
                  onClick={() => {
                    setShowNoteDialog(false);
                    setNoteText('');
                  }}
                >
                  Cancel
                </Button>
                <Button size={buttonSize} onClick={addNote}>
                  Save Note
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default ShopFloorEntry;
