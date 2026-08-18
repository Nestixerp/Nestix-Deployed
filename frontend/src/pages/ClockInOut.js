import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Clock, LogIn, LogOut, Calendar, Users, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const ClockInOut = () => {
  const { currentUser } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [todayEntries, setTodayEntries] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [breakDuration, setBreakDuration] = useState(30);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchEmployees();
    fetchTodayEntries();
    // Refresh every 60 seconds
    const interval = setInterval(fetchTodayEntries, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchEmployees = async () => {
    try {
      const response = await api.get('/employees');
      const activeEmployees = response.data.filter(emp => emp.status === 'Active');
      setEmployees(activeEmployees);
    } catch (error) {
      console.error('Error fetching employees:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTodayEntries = async () => {
    try {
      const response = await api.get('/employees/clock-entries/today');
      setTodayEntries(response.data);
    } catch (error) {
      console.error('Error fetching today entries:', error);
    }
  };

  const handleClockIn = async () => {
    if (!selectedEmployee) {
      alert('Please select an employee');
      return;
    }

    try {
      await api.post('/employees/clock-in', {
        employee_id: selectedEmployee
      });
      
      alert('Clocked in successfully!');
      setSelectedEmployee('');
      fetchTodayEntries();
    } catch (error) {
      console.error('Error clocking in:', error);
      alert('Failed to clock in: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleClockOut = async (employeeId) => {
    try {
      const response = await api.post('/employees/clock-out', {
        employee_id: employeeId,
        break_duration: breakDuration
      });
      
      alert(`Clocked out successfully! Total hours: ${response.data.total_hours}`);
      setBreakDuration(30);
      fetchTodayEntries();
    } catch (error) {
      console.error('Error clocking out:', error);
      alert('Failed to clock out: ' + (error.response?.data?.detail || error.message));
    }
  };

  const formatTime = (isoString) => {
    if (!isoString) return 'N/A';
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
  };

  const getStatusColor = (entry) => {
    if (entry.clock_out_time) {
      return 'bg-green-100 text-green-800 border-green-300';
    }
    return 'bg-blue-100 text-blue-800 border-blue-300';
  };

  const getStatusText = (entry) => {
    if (entry.clock_out_time) {
      return 'Completed';
    }
    return 'Clocked In';
  };

  const calculateCurrentHours = (clockInTime) => {
    if (!clockInTime) return 0;
    const now = new Date();
    const clockIn = new Date(clockInTime);
    const diffMs = now - clockIn;
    const diffHrs = diffMs / (1000 * 60 * 60);
    return diffHrs.toFixed(1);
  };

  const filteredEmployees = employees.filter(emp => {
    const searchLower = searchTerm.toLowerCase();
    return (
      emp.first_name.toLowerCase().includes(searchLower) ||
      emp.last_name.toLowerCase().includes(searchLower) ||
      emp.employee_number.toLowerCase().includes(searchLower)
    );
  });

  const activeClockIns = todayEntries.filter(entry => !entry.clock_out_time);
  const completedToday = todayEntries.filter(entry => entry.clock_out_time);

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-32 bg-slate-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
          <Clock className="w-8 h-8 text-blue-600" />
          Clock In/Out System
        </h1>
        <p className="text-slate-600 mt-1">Track employee work hours and attendance</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Currently Clocked In</p>
                <h3 className="text-3xl font-bold text-blue-600 mt-1">{activeClockIns.length}</h3>
              </div>
              <div className="bg-blue-500 p-3 rounded-lg">
                <Users className="w-6 h-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Completed Today</p>
                <h3 className="text-3xl font-bold text-green-600 mt-1">{completedToday.length}</h3>
              </div>
              <div className="bg-green-500 p-3 rounded-lg">
                <LogOut className="w-6 h-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Total Hours Today</p>
                <h3 className="text-3xl font-bold text-slate-900 mt-1">
                  {todayEntries.reduce((sum, entry) => sum + (entry.total_hours || 0), 0).toFixed(1)}h
                </h3>
              </div>
              <div className="bg-slate-500 p-3 rounded-lg">
                <Clock className="w-6 h-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Clock In Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LogIn className="w-5 h-5 text-blue-600" />
            Clock In
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <Label>Select Employee</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input
                  placeholder="Search employee..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 mb-2"
                />
              </div>
              <select
                className="w-full border rounded-md p-2"
                value={selectedEmployee}
                onChange={(e) => setSelectedEmployee(e.target.value)}
                size="5"
              >
                <option value="">-- Select Employee --</option>
                {filteredEmployees.map(emp => {
                  const alreadyClockedIn = activeClockIns.some(entry => entry.employee_id === emp.id);
                  return (
                    <option 
                      key={emp.id} 
                      value={emp.id}
                      disabled={alreadyClockedIn}
                    >
                      {emp.employee_number} - {emp.first_name} {emp.last_name} {emp.role ? `(${emp.role})` : ''} {alreadyClockedIn ? '✓ Already Clocked In' : ''}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="flex items-end">
              <Button 
                onClick={handleClockIn}
                className="w-full bg-blue-600 hover:bg-blue-700"
                size="lg"
              >
                <LogIn className="w-5 h-5 mr-2" />
                Clock In
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Active Clock Ins */}
      {activeClockIns.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              Currently Clocked In ({activeClockIns.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Clock In Time</TableHead>
                  <TableHead>Current Hours</TableHead>
                  <TableHead>Break (mins)</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeClockIns.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <div className="font-medium">{entry.employee_name}</div>
                    </TableCell>
                    <TableCell>{formatTime(entry.clock_in_time)}</TableCell>
                    <TableCell>
                      <span className="text-blue-600 font-semibold">
                        {calculateCurrentHours(entry.clock_in_time)}h
                      </span>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        value={breakDuration}
                        onChange={(e) => setBreakDuration(parseInt(e.target.value) || 0)}
                        className="w-20"
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleClockOut(entry.employee_id)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <LogOut className="w-4 h-4 mr-1" />
                        Clock Out
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Today's Completed Entries */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-green-600" />
            Today's Completed Shifts ({completedToday.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {completedToday.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              No completed shifts yet today
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Clock In</TableHead>
                  <TableHead>Clock Out</TableHead>
                  <TableHead>Break</TableHead>
                  <TableHead>Total Hours</TableHead>
                  <TableHead>Overtime</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {completedToday.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <div className="font-medium">{entry.employee_name}</div>
                    </TableCell>
                    <TableCell>{formatTime(entry.clock_in_time)}</TableCell>
                    <TableCell>{formatTime(entry.clock_out_time)}</TableCell>
                    <TableCell>{entry.break_duration || 0} mins</TableCell>
                    <TableCell>
                      <span className="font-semibold">
                        {entry.total_hours?.toFixed(2) || 0}h
                      </span>
                    </TableCell>
                    <TableCell>
                      {entry.overtime_hours > 0 ? (
                        <span className="text-orange-600 font-semibold">
                          {entry.overtime_hours?.toFixed(2)}h
                        </span>
                      ) : (
                        <span className="text-slate-400">--</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(entry)}`}>
                        {getStatusText(entry)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ClockInOut;
