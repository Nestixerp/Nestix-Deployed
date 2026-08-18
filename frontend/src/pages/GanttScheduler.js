import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Calendar, ChevronLeft, ChevronRight, RefreshCw, GripVertical, Package, X, Clock } from 'lucide-react';
import api from '../services/api';

const GanttScheduler = () => {
  const [schedules, setSchedules] = useState([]);
  const [machines, setMachines] = useState([]);
  const [jobSheets, setJobSheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewDays, setViewDays] = useState(7);
  const [draggedJob, setDraggedJob] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [selectedDayView, setSelectedDayView] = useState(null); // { machineId, date }
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    fetchData();
  }, [currentDate, viewDays]);

  // Auto-refresh every minute to update job statuses
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every 60 seconds

    return () => clearInterval(timer);
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Calculate date range
      const startDate = new Date(currentDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(currentDate);
      endDate.setDate(endDate.getDate() + viewDays);
      endDate.setHours(23, 59, 59, 999);
      
      // Fetch schedules, machines, and job sheets
      const [schedulesRes, machinesRes, jobSheetsRes] = await Promise.all([
        api.get(`/job-schedules?start_date=${startDate.toISOString()}&end_date=${endDate.toISOString()}`),
        api.get('/machines'),
        api.get('/job-sheets')
      ]);
      
      setSchedules(schedulesRes.data);
      setMachines(machinesRes.data.filter(m => m.status === 'Active'));
      
      // Filter unscheduled jobs (status Pending or In Progress and not already scheduled)
      const scheduledJobIds = new Set(schedulesRes.data.map(s => s.job_sheet_id));
      const unscheduledJobs = jobSheetsRes.data.filter(
        js => (js.status === 'Pending' || js.status === 'In Progress') && !scheduledJobIds.has(js.id)
      );
      setJobSheets(unscheduledJobs);
    } catch (error) {
      console.error('Error fetching data:', error);
      alert('Failed to fetch data: ' + (error.response?.data?.detail || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSchedule = async (jobSheet, machineId, date, time = '08:00') => {
    try {
      const scheduledStart = `${date}T${time}:00Z`;
      
      await api.post('/job-schedules', {
        job_sheet_id: jobSheet.id,
        machine_id: machineId,
        scheduled_start: scheduledStart
      });
      
      // Immediately refresh data and close/reopen modal
      await fetchData();
      setSelectedDayView(null);
      setTimeout(() => {
        setSelectedDayView({ machineId, date });
      }, 300);
      
    } catch (error) {
      console.error('Error creating schedule:', error);
      alert('Failed to create schedule: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleDeleteSchedule = async (scheduleId) => {
    if (!window.confirm('Remove this job from the schedule?')) {
      return;
    }

    try {
      await api.delete(`/job-schedules/${scheduleId}`);
      fetchData();
    } catch (error) {
      console.error('Error deleting schedule:', error);
      alert('Failed to delete schedule: ' + (error.response?.data?.detail || error.message));
    }
  };

  // Drag and Drop handlers
  const handleDragStart = (e, jobSheet) => {
    setDraggedJob(jobSheet);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, machineId, date, time = null) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget({ 
      machineId, 
      date: date.toISOString ? date.toISOString().split('T')[0] : date,
      time 
    });
  };

  const handleDragLeave = () => {
    setDropTarget(null);
  };

  const handleDrop = async (e, machineId, date, time = '08:00') => {
    e.preventDefault();
    setDropTarget(null);
    
    if (!draggedJob) return;
    
    const dateStr = date.toISOString ? date.toISOString().split('T')[0] : date;
    await handleCreateSchedule(draggedJob, machineId, dateStr, time);
    setDraggedJob(null);
  };

  const handleDayClick = (machineId, date) => {
    // Use local date string to avoid timezone issues
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    setSelectedDayView({ machineId, date: dateStr });
  };

  const closeDayView = () => {
    setSelectedDayView(null);
  };

  const getSchedulesForMachineAndDay = (machineId, dateStr) => {
    return schedules.filter(s => {
      if (s.machine_id !== machineId) return false;
      
      // Get the date part from the scheduled_start timestamp
      const scheduleDate = new Date(s.scheduled_start);
      const year = scheduleDate.getFullYear();
      const month = String(scheduleDate.getMonth() + 1).padStart(2, '0');
      const day = String(scheduleDate.getDate()).padStart(2, '0');
      const scheduleDateStr = `${year}-${month}-${day}`;
      
      return scheduleDateStr === dateStr;
    }).sort((a, b) => new Date(a.scheduled_start) - new Date(b.scheduled_start));
  };

  const generateTimeSlots = () => {
    const slots = [];
    for (let hour = 6; hour < 18; hour++) {
      slots.push(`${hour.toString().padStart(2, '0')}:00`);
      slots.push(`${hour.toString().padStart(2, '0')}:15`);
      slots.push(`${hour.toString().padStart(2, '0')}:30`);
      slots.push(`${hour.toString().padStart(2, '0')}:45`);
    }
    return slots;
  };

  const resetForm = () => {
    setDraggedJob(null);
    setDropTarget(null);
  };

  const goToPreviousWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() - viewDays);
    setCurrentDate(newDate);
  };

  const goToNextWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + viewDays);
    setCurrentDate(newDate);
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const groupJobsByProcess = () => {
    const grouped = {};
    jobSheets.forEach(job => {
      const process = job.process_name || 'Unassigned';
      if (!grouped[process]) {
        grouped[process] = [];
      }
      grouped[process].push(job);
    });
    return grouped;
  };

  const getDaysArray = () => {
    const days = [];
    for (let i = 0; i < viewDays; i++) {
      const day = new Date(currentDate);
      day.setDate(day.getDate() + i);
      days.push(day);
    }
    return days;
  };

  const getSchedulesForMachine = (machineId) => {
    return schedules.filter(s => s.machine_id === machineId);
  };

  const getPositionAndWidth = (schedule, dayStart, dayEnd) => {
    const scheduleStart = new Date(schedule.scheduled_start);
    const scheduleEnd = new Date(schedule.scheduled_end);
    
    // Check if schedule is in this day
    if (scheduleEnd < dayStart || scheduleStart > dayEnd) {
      return null;
    }
    
    // Calculate position and width as percentage
    const dayDuration = dayEnd - dayStart;
    const startOffset = Math.max(0, scheduleStart - dayStart);
    const endOffset = Math.min(dayEnd - dayStart, scheduleEnd - dayStart);
    
    const left = (startOffset / dayDuration) * 100;
    const width = ((endOffset - startOffset) / dayDuration) * 100;
    
    return { left, width };
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' });
  };

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const getJobStatus = (schedule) => {
    // First check actual job status from job_sheets table
    if (schedule.job_status === 'Completed') {
      return 'Completed';
    }
    
    if (schedule.job_status === 'Cancelled') {
      return 'Cancelled';
    }
    
    // Calculate status based on current date/time for non-completed jobs
    const now = new Date();
    const startTime = new Date(schedule.scheduled_start);
    const endTime = new Date(schedule.scheduled_end);
    
    // Check schedule status
    if (schedule.status === 'Cancelled') {
      return 'Cancelled';
    }
    
    if (schedule.status === 'Completed') {
      return 'Completed';
    }
    
    // Auto-calculate status based on time
    if (now < startTime) {
      return 'Scheduled'; // Future job
    } else if (now >= startTime && now <= endTime) {
      return 'In Progress'; // Currently running
    } else if (now > endTime) {
      // Job should have finished
      return schedule.status === 'Completed' ? 'Completed' : 'In Progress'; // Still in progress if not marked completed
    }
    
    return schedule.status || 'Scheduled';
  };

  const getStatusColor = (status) => {
    const colors = {
      'Scheduled': 'bg-blue-500',
      'In Progress': 'bg-green-500',
      'Completed': 'bg-gray-400',
      'Cancelled': 'bg-red-500'
    };
    return colors[status] || 'bg-blue-500';
  };

  if (loading) {
    return <div className="p-8">Loading scheduler...</div>;
  }

  const daysArray = getDaysArray();
  const groupedJobs = groupJobsByProcess();

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Calendar className="w-6 h-6 text-blue-600" />
              Job Scheduling - Gantt Chart
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={goToPreviousWeek}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={goToToday}>
                <RefreshCw className="w-4 h-4 mr-1" />
                Today
              </Button>
              <Button variant="outline" size="sm" onClick={goToNextWeek}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {machines.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 text-lg">No active machines found</p>
              <p className="text-sm text-slate-400 mt-2">Add machines in the Machines page to start scheduling</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              {/* Gantt Chart */}
              <div className="min-w-[1400px]">
                {/* Header Row */}
                <div className="flex border-b-2 border-slate-300 sticky top-0 bg-white z-10">
                  <div className="w-64 p-3 font-semibold bg-slate-100 border-r-2 border-slate-300">
                    Machine
                  </div>
                  <div className="flex-1 flex min-w-[1100px]">
                    {daysArray.map((day, idx) => (
                      <div
                        key={idx}
                        className={`flex-1 min-w-[150px] p-3 text-center font-semibold border-r border-slate-200 relative ${
                          day.toDateString() === new Date().toDateString() ? 'bg-blue-50' : 'bg-slate-50'
                        }`}
                      >
                        <div className="text-xs text-slate-600">{day.toLocaleDateString('en-AU', { weekday: 'short' })}</div>
                        <div className="text-sm">{formatDate(day)}</div>
                        
                        {/* Add Job Button - always visible */}
                        <button
                          onClick={() => handleDayClick(machines[0]?.id, day)}
                          className="absolute top-1 right-1 w-5 h-5 bg-blue-500 hover:bg-blue-600 text-white rounded-full flex items-center justify-center text-xs transition-colors"
                          title="Add jobs to this day"
                        >
                          +
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Machine Rows */}
                {machines.map((machine) => {
                  const machineSchedules = getSchedulesForMachine(machine.id);
                  
                  return (
                    <div key={machine.id} className="flex border-b border-slate-200 hover:bg-slate-50">
                      <div className="w-64 p-3 border-r border-slate-200 font-medium bg-white sticky left-0 z-5">
                        <div className="text-sm">{machine.machine_name}</div>
                        <div className="text-xs text-slate-500">{machine.machine_number}</div>
                      </div>
                      <div className="flex-1 flex relative min-w-[1100px]" style={{ minHeight: '60px' }}>
                        {daysArray.map((day, dayIdx) => {
                          const dayStart = new Date(day);
                          dayStart.setHours(0, 0, 0, 0);
                          const dayEnd = new Date(day);
                          dayEnd.setHours(23, 59, 59, 999);
                          const isDropTarget = dropTarget?.machineId === machine.id && 
                                               dropTarget?.date === day.toISOString().split('T')[0];
                          const daySchedules = getSchedulesForMachine(machine.id).filter(s => {
                            const scheduleDate = new Date(s.scheduled_start);
                            const year = scheduleDate.getFullYear();
                            const month = String(scheduleDate.getMonth() + 1).padStart(2, '0');
                            const dayNum = String(scheduleDate.getDate()).padStart(2, '0');
                            const scheduleDateStr = `${year}-${month}-${dayNum}`;
                            
                            const dayYear = day.getFullYear();
                            const dayMonth = String(day.getMonth() + 1).padStart(2, '0');
                            const dayDate = String(day.getDate()).padStart(2, '0');
                            const dayStr = `${dayYear}-${dayMonth}-${dayDate}`;
                            
                            return scheduleDateStr === dayStr;
                          });
                          
                          return (
                            <div
                              key={dayIdx}
                              className={`flex-1 min-w-[150px] border-r border-slate-200 relative cursor-pointer hover:bg-slate-100 ${
                                day.toDateString() === new Date().toDateString() ? 'bg-blue-50' : ''
                              } ${isDropTarget ? 'bg-green-100' : ''}`}
                              style={{ minHeight: '60px' }}
                              onClick={() => handleDayClick(machine.id, day)}
                              onDragOver={(e) => handleDragOver(e, machine.id, day)}
                              onDragLeave={handleDragLeave}
                              onDrop={(e) => handleDrop(e, machine.id, day)}
                            >
                              {/* Simple job bars for overview - constrain to day column */}
                              {daySchedules.map((schedule, idx) => {
                                const actualStatus = getJobStatus(schedule);
                                return (
                                <div
                                  key={schedule.id}
                                  className={`absolute ${getStatusColor(actualStatus)} text-white text-xs p-1 rounded shadow-sm hover:shadow-md`}
                                  style={{
                                    top: `${2 + (idx * 20)}px`,
                                    left: '2px',
                                    right: '2px', // This ensures it stays within the day column
                                    height: '18px',
                                    maxWidth: 'calc(100% - 4px)' // Prevent overflow into next column
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteSchedule(schedule.id);
                                  }}
                                  title={`${schedule.job_sheet_number}\nClick to remove\n${formatTime(schedule.scheduled_start)} - ${formatTime(schedule.scheduled_end)}\nStatus: ${actualStatus}`}
                                >
                                  <div className="font-semibold truncate">{schedule.job_sheet_number}</div>
                                </div>
                                );
                              })}
                              
                              {/* Click hint */}
                              {daySchedules.length === 0 && (
                                <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">
                                  Click to schedule
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex gap-4 mt-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-blue-500 rounded"></div>
                  <span>Scheduled</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-green-500 rounded"></div>
                  <span>In Progress</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-gray-400 rounded"></div>
                  <span>Completed</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Unscheduled Jobs List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-orange-600" />
            Unscheduled Jobs ({jobSheets.length})
            <span className="text-sm font-normal text-slate-500 ml-2">Drag jobs onto the schedule above</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {jobSheets.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <Package className="w-12 h-12 text-slate-300 mx-auto mb-2" />
              <p>All jobs are scheduled!</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedJobs).map(([process, jobs]) => (
                <div key={process}>
                  <div className="flex items-center gap-2 mb-3">
                    <Badge className="bg-slate-700 text-white">{process}</Badge>
                    <span className="text-sm text-slate-500">({jobs.length} jobs)</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {jobs
                      .sort((a, b) => {
                        // Sort by due date, earliest first
                        if (!a.due_date && !b.due_date) return 0;
                        if (!a.due_date) return 1; // Jobs without due dates go to bottom
                        if (!b.due_date) return -1;
                        return new Date(a.due_date) - new Date(b.due_date);
                      })
                      .map((job) => (
                      <div
                        key={job.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, job)}
                        className="p-3 bg-white border-2 border-slate-200 rounded-lg hover:border-blue-400 hover:shadow-md cursor-move transition-all"
                      >
                        <div className="flex items-start gap-2">
                          <GripVertical className="w-4 h-4 text-slate-400 mt-1 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm text-slate-800 truncate">
                              {job.job_sheet_number}
                            </div>
                            <div className="text-xs text-slate-600 truncate">
                              {job.part_description || job.customer_name}
                            </div>
                            <div className="flex gap-2 mt-1">
                              <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-300 border">
                                Qty: {job.quantity}
                              </Badge>
                              {job.due_date && (
                                <Badge className="text-xs bg-orange-100 text-orange-700 border-orange-300 border">
                                  Due: {new Date(job.due_date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detailed Day View Modal */}
      {selectedDayView && (
        <Dialog open={!!selectedDayView} onOpenChange={closeDayView}>
          <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-blue-600" />
                  {machines.find(m => m.id === selectedDayView.machineId)?.machine_name} - {new Date(selectedDayView.date + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'long', day: '2-digit', month: 'short' })}
                </span>
                <Button variant="ghost" size="sm" onClick={closeDayView}>
                  <X className="w-4 h-4" />
                </Button>
              </DialogTitle>
            </DialogHeader>
            
            <div className="grid grid-cols-3 gap-6 py-4">
              {/* Time Schedule (Left 2/3) */}
              <div className="col-span-2 space-y-2">
                <h3 className="font-semibold text-lg mb-4">Time Schedule</h3>
                
                {/* Time Grid */}
                <div className="relative border-2 border-slate-300 rounded-lg bg-white" style={{ minHeight: '600px' }}>
                  {/* Time Labels (Left Column) */}
                  <div className="absolute left-0 top-0 w-20 h-full border-r-2 border-slate-300 bg-slate-50">
                    {generateTimeSlots().map((timeSlot, idx) => (
                      <div
                        key={timeSlot}
                        className="h-3 flex items-center justify-center text-xs font-mono text-slate-600 border-b border-slate-200"
                        style={{ height: '12.5px' }}
                      >
                        {idx % 4 === 0 ? timeSlot : ''}
                      </div>
                    ))}
                  </div>
                  
                  {/* Schedule Area (Right) */}
                  <div className="ml-20 relative h-full">
                    {/* Time Slot Grid Lines */}
                    {generateTimeSlots().map((timeSlot, idx) => {
                      const isDropTarget = dropTarget?.time === timeSlot;
                      
                      return (
                        <div
                          key={timeSlot}
                          className={`h-3 border-b border-slate-200 transition-all ${
                            isDropTarget ? 'bg-green-100' : 'hover:bg-slate-50'
                          }`}
                          style={{ height: '12.5px' }}
                          onDragOver={(e) => handleDragOver(e, selectedDayView.machineId, selectedDayView.date, timeSlot)}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDrop(e, selectedDayView.machineId, selectedDayView.date, timeSlot)}
                        />
                      );
                    })}
                    
                    {/* Scheduled Job Bars */}
                    {getSchedulesForMachineAndDay(selectedDayView.machineId, selectedDayView.date).map((schedule) => {
                      const startTime = new Date(schedule.scheduled_start);
                      const startHour = startTime.getHours();
                      const startMinute = startTime.getMinutes();
                      const duration = schedule.estimated_duration_minutes || 60;
                      
                      // Calculate position and height (only show jobs within 6-18 time range)
                      if (startHour < 6 || startHour >= 18) return null;
                      
                      const startSlot = ((startHour - 6) * 4) + Math.floor(startMinute / 15);
                      const heightSlots = Math.ceil(duration / 15);
                      const topPosition = startSlot * 12.5; // 12.5px per 15-min slot
                      const height = Math.max(heightSlots * 12.5 - 2, 11); // Minimum height
                      const actualStatus = getJobStatus(schedule);
                      
                      return (
                        <div
                          key={schedule.id}
                          className={`absolute left-1 right-1 ${getStatusColor(actualStatus)} text-white text-sm p-2 rounded shadow-md cursor-pointer hover:shadow-lg z-10`}
                          style={{
                            top: `${topPosition}px`,
                            height: `${height}px`,
                            minHeight: '23px'
                          }}
                          onClick={() => handleDeleteSchedule(schedule.id)}
                          title={`${schedule.job_sheet_number}\nDuration: ${Math.round(schedule.estimated_duration_minutes)} minutes\nStatus: ${actualStatus}\nClick to remove`}
                        >
                          <div className="font-semibold truncate">{schedule.job_sheet_number}</div>
                          <div className="text-xs opacity-90 truncate">{Math.round(schedule.estimated_duration_minutes)} min</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              
              {/* Unscheduled Jobs (Right 1/3) */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Available Jobs</h3>
                <div className="text-sm text-slate-600 mb-4">
                  Drag jobs to the time schedule ←
                </div>
                
                {jobSheets.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm">All jobs scheduled!</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {jobSheets
                      .sort((a, b) => {
                        // Sort by due date, earliest first
                        if (!a.due_date && !b.due_date) return 0;
                        if (!a.due_date) return 1; // Jobs without due dates go to bottom
                        if (!b.due_date) return -1;
                        return new Date(a.due_date) - new Date(b.due_date);
                      })
                      .map((job) => (
                      <div
                        key={job.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, job)}
                        className="p-3 bg-white border-2 border-slate-200 rounded-lg hover:border-blue-400 hover:shadow-md cursor-move transition-all"
                      >
                        <div className="flex items-start gap-2">
                          <GripVertical className="w-4 h-4 text-slate-400 mt-1 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm text-slate-800">
                              {job.job_sheet_number}
                            </div>
                            <div className="text-xs text-slate-600 mb-2">
                              {job.part_description || job.customer_name}
                            </div>
                            <div className="flex flex-wrap gap-1">
                              <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-300 border">
                                Qty: {job.quantity}
                              </Badge>
                              {job.due_date && (
                                <Badge className="text-xs bg-orange-100 text-orange-700 border-orange-300 border">
                                  Due: {new Date(job.due_date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })}
                                </Badge>
                              )}
                              <Badge className="text-xs bg-green-100 text-green-700 border-green-300 border">
                                ~{(() => {
                                  const setupTimeMinutes = job.setup_time || 0;
                                  const numberOfBends = job.number_of_bends || 0;
                                  const secondsPerBend = job.time_per_bend || 30;
                                  const packingTime = job.packing_time || 0;
                                  const quantity = job.quantity || 1;
                                  
                                  const totalBendTimeMinutes = (numberOfBends * secondsPerBend * quantity) / 60;
                                  const totalPackingTimeMinutes = (packingTime * quantity) / 60;
                                  const totalJobTimeMinutes = setupTimeMinutes + totalBendTimeMinutes + totalPackingTimeMinutes;
                                  
                                  return Math.round(totalJobTimeMinutes);
                                })()} min
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default GanttScheduler;
