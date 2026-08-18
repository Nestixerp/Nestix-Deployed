import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Calendar, Settings, Cpu, ArrowRight } from 'lucide-react';

const Scheduling = () => {
  const navigate = useNavigate();

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-6 h-6 text-blue-600" />
            Job Scheduling Module
          </CardTitle>
          <CardDescription>
            Manage machines, working hours, and schedule jobs on a visual timeline
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Coming Soon Message */}
          <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-8 text-center">
            <Calendar className="w-16 h-16 text-blue-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Job Scheduling Module</h2>
            <p className="text-slate-600 mb-6">
              Professional drag-and-drop job scheduling with machine management is being built
            </p>
            
            {/* Feature List */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
              <div 
                className="bg-white p-4 rounded-lg border border-blue-100 cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => navigate('/machines')}
              >
                <Cpu className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                <h3 className="font-semibold text-slate-800 mb-1">Machine Management</h3>
                <p className="text-sm text-slate-600 mb-3">Add and manage your production machines</p>
                <Button size="sm" className="w-full">
                  <ArrowRight className="w-4 h-4 mr-1" />
                  Manage Machines
                </Button>
              </div>
              
              <div 
                className="bg-white p-4 rounded-lg border border-blue-100 cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => navigate('/working-hours')}
              >
                <Settings className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                <h3 className="font-semibold text-slate-800 mb-1">Working Hours</h3>
                <p className="text-sm text-slate-600 mb-3">Configure shifts, breaks, and schedules</p>
                <Button size="sm" className="w-full">
                  <ArrowRight className="w-4 h-4 mr-1" />
                  Configure Hours
                </Button>
              </div>
              
              <div 
                className="bg-white p-4 rounded-lg border border-blue-100 cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => navigate('/gantt-scheduler')}
              >
                <Calendar className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                <h3 className="font-semibold text-slate-800 mb-1">Visual Gantt Chart</h3>
                <p className="text-sm text-slate-600 mb-3">Drag-and-drop job scheduling interface</p>
                <Button size="sm" className="w-full">
                  <ArrowRight className="w-4 h-4 mr-1" />
                  Open Scheduler
                </Button>
              </div>
            </div>

            <div className="mt-8 bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-green-800 font-semibold">✅ Backend APIs Ready</p>
              <p className="text-sm text-green-700 mt-1">Machine and Working Hours APIs are functional and tested</p>
            </div>
          </div>

          {/* Backend API Status */}
          <div className="bg-slate-50 p-4 rounded-lg">
            <h3 className="font-semibold text-slate-800 mb-3">Available Backend APIs:</h3>
            <ul className="space-y-2 text-sm text-slate-600">
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                GET /api/machines - List all machines
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                POST /api/machines - Create new machine
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                PUT /api/machines/:id - Update machine
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                DELETE /api/machines/:id - Delete machine
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                GET /api/working-hours - List schedules
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                POST /api/working-hours - Create schedule
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Scheduling;
