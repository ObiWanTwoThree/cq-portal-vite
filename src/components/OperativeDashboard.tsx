

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { MapPin } from 'lucide-react';

const STATUSES = ['Open', 'In Progress', 'Completed', 'Archived'] as const;
type TaskStatus = (typeof STATUSES)[number] | 'Unknown';

function normalizeStatus(status: unknown): TaskStatus {
  if (typeof status !== 'string') return 'Unknown';
  return (STATUSES as readonly string[]).includes(status) ? (status as TaskStatus) : 'Unknown';
}

const OperativeDashboard = () => {
  const [activeTab, setActiveTab] = useState<'available' | 'my'>('available');
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<TaskStatus>('Open');
  const [userId, setUserId] = useState<string | null>(null);

  const handleCardClick = (taskId: string) => {
    navigate('/task/' + taskId);
  };

  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [unassigningId, setUnassigningId] = useState<string | null>(null);

  const fetchTasks = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('tasks').select('*');
    if (!error && data) setTasks(data);
    else setTasks([]);
    setLoading(false);
  };

  // Improved handleUnassign with loading state
  const handleUnassign = async (taskId: string) => {
    if (!window.confirm("Are you sure you want to unassign this job?")) return;
    setUnassigningId(taskId);
    const { error } = await supabase
      .from('tasks')
      .update({ assigned_to: null })
      .eq('id', taskId);
    setUnassigningId(null);
    if (error) {
      console.error("Unassign error:", error);
      alert("Failed to unassign.");
    } else {
      fetchTasks(); // This refreshes the list
    }
  };

  const handleAssign = async (taskId: string) => {
    setAssigningId(taskId);
    try {
      const task = tasks.find((t) => t.id === taskId);
      if (task?.assigned_to) {
        alert('This job is already assigned.');
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) {
        alert('User not found.');
        setAssigningId(null);
        return;
      }
      // Set assigned_to and (if missing) move to In Progress.
      // Guard with `is('assigned_to', null)` so we don't steal already-assigned jobs.
      const nextStatus = task?.status ? task.status : 'In Progress';
      const { data, error } = await supabase
        .from('tasks')
        .update({ assigned_to: user.id, status: nextStatus })
        .eq('id', taskId)
        .is('assigned_to', null)
        .select('id');
      if (error) {
        alert(`Assignment failed: ${error.message}`);
        return;
      }
      if (!data || data.length === 0) {
        alert('Could not assign this job (it may have just been assigned by someone else).');
        await fetchTasks();
        return;
      }
      if (!error) {
        alert('Job Assigned!');
        await fetchTasks();
      } else {
        alert(`Assignment failed: ${error.message}`);
      }
    } finally {
      setAssigningId(null);
    }
  };

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);
      await fetchTasks();
    };
    init();
  }, []);

  if (loading) return <div>Loading...</div>;

  const visibleTasks = tasks
    .filter(task => {
      if (activeTab === 'available') return !task.assigned_to;
      return !!userId && task.assigned_to === userId;
    })
    .filter(task => normalizeStatus(task.status) === statusFilter);

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <h2 className="text-3xl font-bold text-slate-800 tracking-tight">Jobs</h2>
        <div className="flex items-center gap-3">
          <div className="text-sm font-semibold text-slate-600">Status</div>
          <select
            className="border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-800 font-medium"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as TaskStatus)}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
            <option value="Unknown">Unknown</option>
          </select>
        </div>
      </div>
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mt-6">
        {visibleTasks.map(task => (
            <div
              key={task.id}
              className="relative bg-white border border-purple-100 rounded-2xl shadow-md hover:shadow-2xl transition-all duration-300 p-8 flex flex-col min-h-[220px] cursor-pointer group"
              onClick={() => handleCardClick(task.id)}
            >
              {/* Status Pill */}
              <div className="absolute top-6 right-6">
                <span className="bg-purple-100 text-purple-700 text-xs font-bold px-3 py-1 rounded-full shadow-sm drop-shadow glow-pulse">
                  {task.status || 'Unassigned'}
                </span>
              </div>
              <div className="flex flex-col gap-4 flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <div className="text-2xl font-bold text-slate-800 flex-1">{task.title}</div>
                </div>
                <div className="flex items-center gap-2 text-slate-600 font-semibold mb-1">
                  <MapPin size={18} className="text-purple-400" />
                  <span className="font-medium text-slate-800">{task.location || task.site || '-'}</span>
                </div>
                <div className="text-slate-600 font-semibold mb-1">Due Date: <span className="font-medium text-slate-800">{task.due_date ? new Date(task.due_date).toLocaleDateString() : '-'}</span></div>
              </div>
              {activeTab === 'available' ? (
                <button
                  type="button"
                  className="mt-8 w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold py-3 rounded-lg shadow-md transition-all duration-300"
                  onClick={e => { e.preventDefault(); e.stopPropagation(); handleAssign(task.id); }}
                  disabled={assigningId === task.id || !userId}
                >
                  {assigningId === task.id ? 'Assigning...' : 'Assign to Me'}
                </button>
              ) : (
                <div className="mt-8 flex gap-3 w-full">
                  <button
                    className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold py-3 rounded-lg shadow-md transition-all duration-300"
                    onClick={e => { e.stopPropagation(); handleCardClick(task.id); }}
                  >
                    View Details
                  </button>
                  <button
                    className="flex-1 border border-red-200 text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg font-semibold transition-all duration-200 disabled:opacity-60"
                    onClick={e => { e.stopPropagation(); handleUnassign(task.id); }}
                    disabled={unassigningId === task.id}
                  >
                    {unassigningId === task.id ? 'Unassigning...' : 'Unassign'}
                  </button>
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}; // closes the OperativeDashboard function

export default OperativeDashboard;
