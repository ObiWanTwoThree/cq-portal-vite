

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { MapPin } from 'lucide-react';
import { notifyUsers } from '../lib/notifications';

const STATUSES = ['Open', 'Completed'] as const;
type TaskStatus = (typeof STATUSES)[number] | 'Unknown';
type StatusFilter = TaskStatus | 'All';

type TaskRow = {
  id: string
  title?: string | null
  location?: string | null
  site?: string | null
  due_date?: string | null
  status?: string | null
  assigned_to?: string | null
}

function normalizeStatus(status: unknown): TaskStatus {
  if (typeof status !== 'string') return 'Unknown';
  return (STATUSES as readonly string[]).includes(status) ? (status as TaskStatus) : 'Unknown';
}

const OperativeDashboard = () => {
  const [activeTab, setActiveTab] = useState<'available' | 'my'>('available');
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [userId, setUserId] = useState<string | null>(null);

  const handleCardClick = (taskId: string) => {
    navigate('/task/' + taskId);
  };

  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [unassigningId, setUnassigningId] = useState<string | null>(null);

  const fetchTasks = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('tasks').select('*');
    if (!error && data) setTasks(data as TaskRow[]);
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

      // Sanity check: FK expects assigned_to to reference an existing profiles row.
      const { data: profileRow, error: profileErr } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();
      if (profileErr) {
        alert(`Assignment failed (profile lookup error): ${profileErr.message}`);
        return;
      }
      if (!profileRow?.id) {
        alert(`Assignment failed: no profile row exists for your user id (${user.id}).`);
        return;
      }

      // Set assigned_to. Guard with `is('assigned_to', null)` so we don't steal already-assigned jobs.
      const nextStatus = task?.status ? task.status : 'Open';
      const { data, error } = await supabase
        .from('tasks')
        .update({ assigned_to: user.id, status: nextStatus })
        .eq('id', taskId)
        .is('assigned_to', null)
        .select('id');
      if (error) {
        // Include details to make DB errors actionable (FK/RLS, etc).
        alert(`Assignment failed: ${error.message}${error.details ? `\n\n${error.details}` : ''}`);
        return;
      }
      if (!data || data.length === 0) {
        alert('Could not assign this job (it may have just been assigned by someone else).');
        await fetchTasks();
        return;
      }
      if (!error) {
        alert('Job Assigned!');
        notifyUsers({
          userIds: [user.id],
          title: 'Job assigned to you',
          body: `You claimed: ${task?.title ?? 'a job'}`,
          link: `/task/${taskId}`,
          type: 'task_assigned',
        });
        await fetchTasks();
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

  if (loading) return <div className="text-slate-500">Loading...</div>;

  const visibleTasks = tasks
    .filter(task => {
      if (activeTab === 'available') return !task.assigned_to;
      return !!userId && task.assigned_to === userId;
    })
    .filter(task => statusFilter === 'All' ? true : normalizeStatus(task.status) === statusFilter);

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <h2 className="page-title">Jobs</h2>
        <div className="flex items-center gap-3">
          <div className="text-sm font-medium text-slate-700">Status</div>
          <select
            className="input w-auto px-3 py-2.5"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="All">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
            <option value="Unknown">Unknown</option>
          </select>
        </div>
      </div>
      <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 mb-6">
        <button
          type="button"
          className={`px-4 py-2.5 rounded-lg text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
            activeTab === 'available'
              ? 'bg-slate-900 text-white'
              : 'bg-white text-slate-700 hover:bg-slate-50'
          }`}
          onClick={() => setActiveTab('available')}
        >
          Available Jobs
        </button>
        <button
          type="button"
          className={`px-4 py-2.5 rounded-lg text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
            activeTab === 'my'
              ? 'bg-slate-900 text-white'
              : 'bg-white text-slate-700 hover:bg-slate-50'
          }`}
          onClick={() => setActiveTab('my')}
        >
          My Assigned Jobs
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
        {visibleTasks.map(task => (
            <div
              key={task.id}
              className="relative card p-6 flex flex-col min-h-[220px] cursor-pointer hover:bg-slate-50 transition-colors"
              onClick={() => handleCardClick(task.id)}
            >
              {/* Status Pill */}
              <div className="absolute top-6 right-6">
                <span className="bg-slate-100 text-slate-700 text-xs font-semibold px-2.5 py-1 rounded-full border border-slate-200">
                  {task.status || 'Unassigned'}
                </span>
              </div>
              <div className="flex flex-col gap-4 flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <div className="text-lg font-semibold text-slate-900 flex-1">{task.title}</div>
                </div>
                <div className="flex items-center gap-2 text-slate-500">
                  <MapPin size={18} className="text-purple-600" />
                  <span className="font-medium text-slate-900">{task.location || task.site || '-'}</span>
                </div>
                <div className="text-sm text-slate-500">
                  Due date:{' '}
                  <span className="font-medium text-slate-900">
                    {task.due_date ? new Date(task.due_date).toLocaleDateString() : '-'}
                  </span>
                </div>
              </div>
              {activeTab === 'available' ? (
                <button
                  type="button"
                  className="btn-primary w-full mt-6"
                  onClick={e => { e.preventDefault(); e.stopPropagation(); handleAssign(task.id); }}
                  disabled={assigningId === task.id || !userId}
                >
                  {assigningId === task.id ? 'Assigning...' : 'Assign to Me'}
                </button>
              ) : (
                <div className="mt-8 flex gap-3 w-full">
                  <button
                    type="button"
                    className="btn-secondary flex-1"
                    onClick={e => { e.stopPropagation(); handleCardClick(task.id); }}
                  >
                    View Details
                  </button>
                  <button
                    type="button"
                    className="btn-danger flex-1"
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
