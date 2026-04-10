
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

const OperativeDashboard = () => {
  const [activeTab, setActiveTab] = useState<'available' | 'my'>('available');
  const [tasks, setTasks] = useState<any[]>([]);
  const navigate = useNavigate();

  const handleCardClick = (taskId: string) => {
    navigate('/task/' + taskId);
  };


  const [assigningId, setAssigningId] = useState<string | null>(null);

  const fetchTasks = async () => {
    const { data, error } = await supabase.from('tasks').select('*');
    if (!error && data) setTasks(data);
    else setTasks([]);
  };

  const handleAssign = async (taskId: string) => {
    setAssigningId(taskId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) {
        alert('User not found.');
        setAssigningId(null);
        return;
      }
      const { error } = await supabase
        .from('tasks')
        .update({ assigned_to: user.id })
        .eq('id', taskId);
      if (!error) {
        alert('Job Assigned!');
        await fetchTasks();
      } else {
        alert('Assignment failed.');
      }
    } finally {
      setAssigningId(null);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h2 className="text-3xl font-bold text-slate-800 mb-8 tracking-tight">Welcome, Operative!</h2>
      <div className="flex space-x-4 mb-6">
        <button
          className={`px-6 py-2 rounded-t-lg font-semibold transition border-b-4 focus:outline-none ${activeTab === 'available' ? 'bg-gradient-to-r from-purple-800 to-fuchsia-600 text-white border-fuchsia-600 shadow' : 'bg-white text-slate-500 border-transparent hover:text-fuchsia-600'}`}
          onClick={() => setActiveTab('available')}
        >
          Available Jobs
        </button>
        <button
          className={`px-6 py-2 rounded-t-lg font-semibold transition border-b-4 focus:outline-none ${activeTab === 'my' ? 'bg-gradient-to-r from-purple-800 to-fuchsia-600 text-white border-fuchsia-600 shadow' : 'bg-white text-slate-500 border-transparent hover:text-fuchsia-600'}`}
          onClick={() => setActiveTab('my')}
        >
          My Assigned Jobs
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
        {tasks
          .filter(task => activeTab === 'available' ? !task.assigned_to : task.assigned_to)
          .map(task => (
            <div
              key={task.id}
              className="bg-white rounded-xl shadow-md border border-slate-100 p-8 flex flex-col justify-between cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => handleCardClick(task.id)}
            >
              <div>
                <div className="text-2xl font-bold text-slate-800 mb-3">{task.title}</div>
                <div className="text-slate-600 font-semibold mb-1">Site/Location: <span className="font-medium text-slate-800">{task.site || '-'}</span></div>
                <div className="text-slate-600 font-semibold mb-1">Due Date: <span className="font-medium text-slate-800">{task.due_date ? new Date(task.due_date).toLocaleDateString() : '-'}</span></div>
              </div>
              {activeTab === 'available' ? (
                <button
                  className="mt-6 w-full bg-gradient-to-r from-purple-800 to-fuchsia-600 hover:opacity-90 text-white font-bold py-3 rounded-lg shadow-md transition"
                  onClick={e => { e.stopPropagation(); handleAssign(task.id); }}
                  disabled={assigningId === task.id}
                >
                  {assigningId === task.id ? 'Assigning...' : 'Assign to Me'}
                </button>
              ) : (
                <button
                  className="mt-6 w-full bg-gradient-to-r from-purple-800 to-fuchsia-600 hover:opacity-90 text-white font-bold py-3 rounded-lg shadow-md transition"
                  onClick={e => { e.stopPropagation(); handleCardClick(task.id); }}
                >
                  View Details
                </button>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}; // closes the OperativeDashboard function

export default OperativeDashboard;
