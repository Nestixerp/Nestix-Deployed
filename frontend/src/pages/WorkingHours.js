import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import { Clock, Plus, Edit, Trash2, CheckCircle2, Circle, X } from 'lucide-react';
import api from '../services/api';

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const WorkingHours = () => {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [formData, setFormData] = useState({
    schedule_name: '',
    is_active: false,
    schedule: DAYS_OF_WEEK.map(day => ({
      day_of_week: day,
      is_working_day: day !== 'Saturday' && day !== 'Sunday',
      shifts: day !== 'Saturday' && day !== 'Sunday' ? [{
        shift_name: 'Day Shift',
        start_time: '08:00',
        end_time: '16:30',
        break_times: [{ name: 'Lunch', start: '12:00', duration: 30 }]
      }] : []
    }))
  });

  useEffect(() => {
    fetchSchedules();
  }, []);

  const fetchSchedules = async () => {
    try {
      setLoading(true);
      const response = await api.get('/working-hours');
      setSchedules(response.data);
    } catch (error) {
      console.error('Error fetching schedules:', error);
      alert('Failed to fetch schedules: ' + (error.response?.data?.detail || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSchedule = async () => {
    if (!formData.schedule_name.trim()) {
      alert('Please enter a schedule name');
      return;
    }

    try {
      await api.post('/working-hours', formData);
      setDialogOpen(false);
      resetForm();
      fetchSchedules();
      alert('Schedule created successfully!');
    } catch (error) {
      console.error('Error creating schedule:', error);
      alert('Failed to create schedule: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleUpdateSchedule = async () => {
    if (!formData.schedule_name.trim()) {
      alert('Please enter a schedule name');
      return;
    }

    try {
      await api.put(`/working-hours/${selectedSchedule.id}`, formData);
      setDialogOpen(false);
      setEditMode(false);
      setSelectedSchedule(null);
      resetForm();
      fetchSchedules();
      alert('Schedule updated successfully!');
    } catch (error) {
      console.error('Error updating schedule:', error);
      alert('Failed to update schedule: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleDeleteSchedule = async (scheduleId) => {
    if (!window.confirm('Are you sure you want to delete this schedule?')) {
      return;
    }

    try {
      await api.delete(`/working-hours/${scheduleId}`);
      fetchSchedules();
      alert('Schedule deleted successfully!');
    } catch (error) {
      console.error('Error deleting schedule:', error);
      alert('Failed to delete schedule: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleSetActive = async (scheduleId) => {
    try {
      await api.put(`/working-hours/${scheduleId}`, { is_active: true });
      fetchSchedules();
      alert('Schedule set as active!');
    } catch (error) {
      console.error('Error setting active schedule:', error);
      alert('Failed to set active schedule: ' + (error.response?.data?.detail || error.message));
    }
  };

  const openEditDialog = (schedule) => {
    setSelectedSchedule(schedule);
    setFormData({
      schedule_name: schedule.schedule_name,
      is_active: schedule.is_active,
      schedule: schedule.schedule
    });
    setEditMode(true);
    setDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      schedule_name: '',
      is_active: false,
      schedule: DAYS_OF_WEEK.map(day => ({
        day_of_week: day,
        is_working_day: day !== 'Saturday' && day !== 'Sunday',
        shifts: day !== 'Saturday' && day !== 'Sunday' ? [{
          shift_name: 'Day Shift',
          start_time: '08:00',
          end_time: '16:30',
          break_times: [{ name: 'Lunch', start: '12:00', duration: 30 }]
        }] : []
      }))
    });
    setEditMode(false);
    setSelectedSchedule(null);
  };

  const toggleWorkingDay = (dayIndex) => {
    const newSchedule = [...formData.schedule];
    newSchedule[dayIndex].is_working_day = !newSchedule[dayIndex].is_working_day;
    
    if (newSchedule[dayIndex].is_working_day && newSchedule[dayIndex].shifts.length === 0) {
      newSchedule[dayIndex].shifts = [{
        shift_name: 'Day Shift',
        start_time: '08:00',
        end_time: '16:30',
        break_times: []
      }];
    }
    
    setFormData({ ...formData, schedule: newSchedule });
  };

  const updateShift = (dayIndex, field, value) => {
    const newSchedule = [...formData.schedule];
    if (newSchedule[dayIndex].shifts.length > 0) {
      newSchedule[dayIndex].shifts[0][field] = value;
      setFormData({ ...formData, schedule: newSchedule });
    }
  };

  const addBreak = (dayIndex) => {
    const newSchedule = [...formData.schedule];
    if (newSchedule[dayIndex].shifts.length > 0) {
      newSchedule[dayIndex].shifts[0].break_times.push({
        name: 'Break',
        start: '10:00',
        duration: 15
      });
      setFormData({ ...formData, schedule: newSchedule });
    }
  };

  const removeBreak = (dayIndex, breakIndex) => {
    const newSchedule = [...formData.schedule];
    if (newSchedule[dayIndex].shifts.length > 0) {
      newSchedule[dayIndex].shifts[0].break_times.splice(breakIndex, 1);
      setFormData({ ...formData, schedule: newSchedule });
    }
  };

  const updateBreak = (dayIndex, breakIndex, field, value) => {
    const newSchedule = [...formData.schedule];
    if (newSchedule[dayIndex].shifts.length > 0) {
      newSchedule[dayIndex].shifts[0].break_times[breakIndex][field] = value;
      setFormData({ ...formData, schedule: newSchedule });
    }
  };

  if (loading) {
    return <div className="p-8">Loading schedules...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Clock className="w-6 h-6 text-blue-600" />
              Working Hours Configuration
            </span>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Schedule
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {schedules.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 text-lg mb-4">No working hours schedules configured yet</p>
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Schedule
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {schedules.map((schedule) => (
                <Card key={schedule.id} className={schedule.is_active ? 'border-2 border-green-500' : ''}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-lg font-semibold">{schedule.schedule_name}</h3>
                          {schedule.is_active && (
                            <Badge className="bg-green-100 text-green-800 border-green-300 border">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Active
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-slate-600">
                          Working Days: {schedule.schedule.filter(d => d.is_working_day).length} / {schedule.schedule.length}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {!schedule.is_active && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSetActive(schedule.id)}
                            className="text-green-600 hover:text-green-700"
                          >
                            <CheckCircle2 className="w-4 h-4 mr-1" />
                            Set Active
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(schedule)}
                          className="text-blue-600 hover:text-blue-700"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteSchedule(schedule.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Day Schedule Summary */}
                    <div className="grid grid-cols-7 gap-2">
                      {schedule.schedule.map((day) => (
                        <div
                          key={day.day_of_week}
                          className={`text-center p-2 rounded text-xs ${
                            day.is_working_day
                              ? 'bg-green-50 border border-green-200'
                              : 'bg-slate-50 border border-slate-200'
                          }`}
                        >
                          <div className="font-semibold mb-1">{day.day_of_week.slice(0, 3)}</div>
                          {day.is_working_day && day.shifts.length > 0 ? (
                            <div className="text-slate-600">
                              {day.shifts[0].start_time} - {day.shifts[0].end_time}
                            </div>
                          ) : (
                            <div className="text-slate-400">Off</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Schedule Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editMode ? 'Edit Schedule' : 'Create Working Hours Schedule'}</DialogTitle>
            <DialogDescription>
              Configure shifts, breaks, and working days for your production schedule
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Schedule Name */}
            <div className="space-y-2">
              <Label htmlFor="schedule-name">Schedule Name *</Label>
              <Input
                id="schedule-name"
                placeholder="e.g., Standard Week, Summer Hours"
                value={formData.schedule_name}
                onChange={(e) => setFormData({ ...formData, schedule_name: e.target.value })}
              />
            </div>

            {/* Active Toggle */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is-active"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="w-4 h-4"
              />
              <Label htmlFor="is-active">Set as active schedule</Label>
            </div>

            {/* Day Configuration */}
            <div className="space-y-4">
              <h3 className="font-semibold">Weekly Schedule</h3>
              {formData.schedule.map((day, dayIndex) => (
                <Card key={day.day_of_week}>
                  <CardContent className="pt-4">
                    <div className="space-y-4">
                      {/* Day Header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => toggleWorkingDay(dayIndex)}
                            className="focus:outline-none"
                          >
                            {day.is_working_day ? (
                              <CheckCircle2 className="w-5 h-5 text-green-600" />
                            ) : (
                              <Circle className="w-5 h-5 text-slate-400" />
                            )}
                          </button>
                          <h4 className="font-semibold">{day.day_of_week}</h4>
                        </div>
                        {!day.is_working_day && (
                          <Badge className="bg-slate-100 text-slate-600 border-slate-300 border">
                            Non-Working Day
                          </Badge>
                        )}
                      </div>

                      {/* Shift Configuration (only if working day) */}
                      {day.is_working_day && day.shifts.length > 0 && (
                        <div className="ml-8 space-y-4 border-l-2 border-slate-200 pl-4">
                          {/* Shift Times */}
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Start Time</Label>
                              <Input
                                type="time"
                                value={day.shifts[0].start_time}
                                onChange={(e) => updateShift(dayIndex, 'start_time', e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>End Time</Label>
                              <Input
                                type="time"
                                value={day.shifts[0].end_time}
                                onChange={(e) => updateShift(dayIndex, 'end_time', e.target.value)}
                              />
                            </div>
                          </div>

                          {/* Breaks */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <Label>Breaks</Label>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => addBreak(dayIndex)}
                              >
                                <Plus className="w-3 h-3 mr-1" />
                                Add Break
                              </Button>
                            </div>

                            {day.shifts[0].break_times.map((breakTime, breakIndex) => (
                              <div key={breakIndex} className="flex gap-2 items-end">
                                <div className="flex-1 space-y-1">
                                  <Label className="text-xs">Name</Label>
                                  <Input
                                    size="sm"
                                    placeholder="Break name"
                                    value={breakTime.name}
                                    onChange={(e) => updateBreak(dayIndex, breakIndex, 'name', e.target.value)}
                                  />
                                </div>
                                <div className="flex-1 space-y-1">
                                  <Label className="text-xs">Start</Label>
                                  <Input
                                    type="time"
                                    size="sm"
                                    value={breakTime.start}
                                    onChange={(e) => updateBreak(dayIndex, breakIndex, 'start', e.target.value)}
                                  />
                                </div>
                                <div className="w-24 space-y-1">
                                  <Label className="text-xs">Minutes</Label>
                                  <Input
                                    type="number"
                                    size="sm"
                                    placeholder="30"
                                    value={breakTime.duration}
                                    onChange={(e) => updateBreak(dayIndex, breakIndex, 'duration', parseInt(e.target.value) || 0)}
                                  />
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeBreak(dayIndex, breakIndex)}
                                  className="text-red-600 hover:text-red-700"
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
              Cancel
            </Button>
            <Button onClick={editMode ? handleUpdateSchedule : handleCreateSchedule}>
              {editMode ? 'Save Changes' : 'Create Schedule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WorkingHours;
