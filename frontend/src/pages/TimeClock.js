import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Clock, LogIn, LogOut, User, AlertCircle } from 'lucide-react';
import api from '../services/api';

const TimeClock = () => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [employeeId, setEmployeeId] = useState('');
  const [currentEmployee, setCurrentEmployee] = useState(null);
  const [lastAction, setLastAction] = useState(null);
  const [todayHours, setTodayHours] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState(''); // 'success', 'error'

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Clear message after 5 seconds
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => {
        setMessage('');
        setMessageType('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const showMessage = (text, type = 'success') => {
    setMessage(text);
    setMessageType(type);
  };

  const fetchEmployeeStatus = async (empId) => {
    try {
      // Get employee details
      const employeesResponse = await api.get('/employees');
      const employee = employeesResponse.data.find(emp => 
        emp.employee_number === empId || emp.id === empId
      );

      if (!employee) {
        throw new Error('Employee not found');
      }

      // Get today's entries for this employee
      const entriesResponse = await api.get('/employees/clock-entries/today');
      const todayEntries = entriesResponse.data.filter(entry => 
        entry.employee_id === employee.id
      );

      // Find the most recent entry (active clock-in takes priority)
      const activeEntry = todayEntries.find(entry => !entry.clock_out_time);
      const todayEntry = activeEntry || todayEntries[todayEntries.length - 1]; // Most recent if no active

      setCurrentEmployee({
        ...employee,
        isActive: employee.status === 'Active',
        isClockedIn: todayEntry && !todayEntry.clock_out_time,
        lastClockIn: todayEntry?.clock_in_time,
        lastClockOut: todayEntry?.clock_out_time,
        todayHours: todayEntries.reduce((sum, entry) => sum + (entry.total_hours || 0), 0)
      });

      setTodayHours(todayEntries.reduce((sum, entry) => sum + (entry.total_hours || 0), 0));
      setLastAction(todayEntry);

    } catch (error) {
      console.error('Error fetching employee status:', error);
      throw error;
    }
  };

  const handleClockIn = async () => {
    if (!employeeId.trim()) {
      showMessage('Please enter your Employee ID', 'error');
      return;
    }

    try {
      setLoading(true);
      
      // First get employee details
      await fetchEmployeeStatus(employeeId);
      
      if (currentEmployee && !currentEmployee.isActive) {
        showMessage('Employee account is not active', 'error');
        return;
      }

      if (currentEmployee && currentEmployee.isClockedIn) {
        showMessage('You are already clocked in', 'error');
        return;
      }

      // Clock in
      const response = await api.post('/employees/clock-in', {
        employee_id: currentEmployee.id
      });

      showMessage(`Welcome ${currentEmployee.first_name}! You are now clocked in.`, 'success');
      
      // Refresh status
      await fetchEmployeeStatus(employeeId);
      
    } catch (error) {
      console.error('Error clocking in:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to clock in';
      showMessage(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleClockOut = async () => {
    if (!currentEmployee) {
      showMessage('Please enter your Employee ID first', 'error');
      return;
    }

    try {
      setLoading(true);
      
      const response = await api.post('/employees/clock-out', {
        employee_id: currentEmployee.id,
        break_duration: 30 // Default 30 min break
      });

      const totalHours = response.data.total_hours || 0;
      showMessage(`Good work ${currentEmployee.first_name}! Clocked out. Total hours: ${totalHours.toFixed(2)}h`, 'success');
      
      // Refresh status
      await fetchEmployeeStatus(employeeId);
      
    } catch (error) {
      console.error('Error clocking out:', error);
      showMessage(error.message || 'Failed to clock out', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleEmployeeIdSubmit = async () => {
    if (!employeeId.trim()) {
      showMessage('Please enter your Employee ID', 'error');
      return;
    }

    try {
      setLoading(true);
      await fetchEmployeeStatus(employeeId);
      showMessage(`Hello ${currentEmployee?.first_name}!`, 'success');
    } catch (error) {
      console.error('Error finding employee:', error);
      showMessage('Employee ID not found', 'error');
      setCurrentEmployee(null);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      if (!currentEmployee) {
        handleEmployeeIdSubmit();
      } else if (currentEmployee.isClockedIn) {
        handleClockOut();
      } else {
        handleClockIn();
      }
    }
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString('en-AU', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('en-AU', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const calculateCurrentHours = () => {
    if (!currentEmployee?.lastClockIn || !currentEmployee?.isClockedIn) return 0;
    const clockIn = new Date(currentEmployee.lastClockIn);
    const now = new Date();
    const diffMs = now - clockIn;
    const diffHrs = diffMs / (1000 * 60 * 60);
    return diffHrs.toFixed(1);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header with Clock */}
        <Card className="mb-6 bg-white shadow-lg">
          <CardContent className="p-8 text-center">
            <Clock className="w-16 h-16 text-blue-600 mx-auto mb-4" />
            <h1 className="text-4xl font-bold text-slate-900 mb-2">Time Clock</h1>
            <div className="text-6xl font-mono font-bold text-blue-600 mb-2">
              {formatTime(currentTime)}
            </div>
            <div className="text-lg text-slate-600">
              {formatDate(currentTime)}
            </div>
          </CardContent>
        </Card>

        {/* Message Display */}
        {message && (
          <Card className={`mb-6 border-2 ${
            messageType === 'error' ? 'border-red-300 bg-red-50' : 'border-green-300 bg-green-50'
          }`}>
            <CardContent className="p-4">
              <div className={`flex items-center gap-3 ${
                messageType === 'error' ? 'text-red-800' : 'text-green-800'
              }`}>
                {messageType === 'error' ? (
                  <AlertCircle className="w-5 h-5" />
                ) : (
                  <Clock className="w-5 h-5" />
                )}
                <span className="text-lg font-medium">{message}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Employee ID Input */}
        <Card className="mb-6 bg-white shadow-lg">
          <CardHeader>
            <CardTitle className="text-center text-2xl">
              <User className="w-8 h-8 mx-auto mb-2 text-blue-600" />
              Enter Employee ID
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <Input
                type="text"
                placeholder="Employee ID or Number"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                onKeyPress={handleKeyPress}
                className="text-xl p-6 text-center font-mono"
                autoFocus
              />
              <Button
                onClick={handleEmployeeIdSubmit}
                disabled={loading}
                className="px-8 py-6 text-lg"
              >
                {loading ? 'Loading...' : 'Find'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Employee Status & Actions */}
        {currentEmployee && (
          <Card className="mb-6 bg-white shadow-lg">
            <CardHeader>
              <CardTitle className="text-center text-2xl text-slate-900">
                Welcome, {currentEmployee.first_name} {currentEmployee.last_name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Status Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="text-center p-4 bg-slate-50 rounded-lg">
                  <div className="text-sm text-slate-600">Current Status</div>
                  <div className={`text-2xl font-bold ${
                    currentEmployee.isClockedIn ? 'text-green-600' : 'text-slate-600'
                  }`}>
                    {currentEmployee.isClockedIn ? 'CLOCKED IN' : 'CLOCKED OUT'}
                  </div>
                </div>

                <div className="text-center p-4 bg-slate-50 rounded-lg">
                  <div className="text-sm text-slate-600">Current Hours</div>
                  <div className="text-2xl font-bold text-blue-600">
                    {currentEmployee.isClockedIn ? calculateCurrentHours() : currentEmployee.todayHours.toFixed(1)}h
                  </div>
                </div>

                <div className="text-center p-4 bg-slate-50 rounded-lg">
                  <div className="text-sm text-slate-600">Last Action</div>
                  <div className="text-lg font-medium text-slate-800">
                    {currentEmployee.isClockedIn 
                      ? `In: ${new Date(currentEmployee.lastClockIn).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}`
                      : currentEmployee.lastClockOut 
                        ? `Out: ${new Date(currentEmployee.lastClockOut).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}`
                        : 'No activity today'
                    }
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4 justify-center">
                <Button
                  onClick={handleClockIn}
                  disabled={loading || currentEmployee.isClockedIn || !currentEmployee.isActive}
                  className="px-8 py-4 text-xl bg-green-600 hover:bg-green-700 disabled:bg-slate-300"
                  size="lg"
                >
                  <LogIn className="w-6 h-6 mr-3" />
                  Clock In
                </Button>

                <Button
                  onClick={handleClockOut}
                  disabled={loading || !currentEmployee.isClockedIn}
                  className="px-8 py-4 text-xl bg-red-600 hover:bg-red-700 disabled:bg-slate-300"
                  size="lg"
                >
                  <LogOut className="w-6 h-6 mr-3" />
                  Clock Out
                </Button>
              </div>

              <div className="text-center mt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setEmployeeId('');
                    setCurrentEmployee(null);
                    setMessage('');
                  }}
                  className="text-slate-600"
                >
                  Switch Employee
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Instructions */}
        <Card className="bg-slate-50 border-slate-200">
          <CardContent className="p-6 text-center text-slate-600">
            <h3 className="font-semibold mb-2">Instructions</h3>
            <div className="text-sm space-y-1">
              <p>1. Enter your Employee ID number</p>
              <p>2. Click 'Find' or press Enter</p>
              <p>3. Use Clock In/Clock Out buttons</p>
              <p>4. Press Enter as shortcut for quick actions</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TimeClock;