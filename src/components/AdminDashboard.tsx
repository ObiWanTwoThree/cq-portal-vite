import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

const STATUSES = ['Open', 'Completed'] as const;
type TaskStatus = (typeof STATUSES)[number] | 'Unknown';

type TaskRow = {
  id: string
  title?: string | null
  location?: string | null
  category?: string | null
  due_date?: string | null
  status?: string | null
  assigned_to?: string | null
  created_at?: string | null
}

type ProfileRow = {
  id: string
  full_name?: string | null
}

function normalizeStatus(status: unknown): TaskStatus {
  if (typeof status !== 'string') return 'Unknown';
  return (STATUSES as readonly string[]).includes(status) ? (status as TaskStatus) : 'Unknown';
}

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userRole, setUserRole] = useState('operative');
  const [statusFilter, setStatusFilter] = useState<TaskStatus>('Open');
  const [assigneeById, setAssigneeById] = useState<Record<string, string>>({});

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const fetchTasks = async () => {
      setLoading(true);
      setError('');
      timeoutId = setTimeout(() => {
        setError('Still loading... please check your connection or console for errors.');
      }, 5000);
      try {
        const { data, error } = await supabase
          .from('tasks')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) {
          setError(error.message);
          setTasks([]);
        } else {
          setTasks((data || []) as TaskRow[]);

          // Best-effort: hydrate assignee display names for the table (if profiles has full_name).
          const ids = Array.from(
            new Set(((data || []) as TaskRow[]).map((t) => t.assigned_to).filter(Boolean)),
          ) as string[];
          if (ids.length > 0) {
            const { data: profiles } = await supabase
              .from('profiles')
              .select('*')
              .in('id', ids);
            const map: Record<string, string> = {};
            for (const p of (profiles || []) as ProfileRow[]) {
              const name = p.full_name;
              map[p.id] = name?.trim() || p.id;
            }
            setAssigneeById(map);
          } else {
            setAssigneeById({});
          }
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred.');
        setTasks([]);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
        setLoading(false);
      }
    };
    const fetchUserRole = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();
        setUserRole(profile?.role || 'operative');
      }
    };
    fetchTasks();
    fetchUserRole();
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  const filteredTasks = tasks.filter((t) => {
    if (statusFilter === 'Unknown') return normalizeStatus(t.status) === 'Unknown';
    return normalizeStatus(t.status) === statusFilter;
  });

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div className="flex items-center justify-between gap-4">
          <h2 className="page-title">Dashboard</h2>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-end">
          <div className="flex items-center gap-3">
            <div className="text-sm font-medium text-slate-700">Status</div>
            <select
              className="input w-auto px-3 py-2.5"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as TaskStatus)}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
              <option value="Unknown">Unknown</option>
            </select>
          </div>
          {userRole === 'admin' && (
            <button
              className="btn-primary w-full sm:w-auto"
              onClick={() => navigate('/dashboard/new-task')}
            >
              Create New Task
            </button>
          )}
        </div>
      </div>
      <div className="card overflow-x-auto">
        {error && (
          <div className="p-6 text-red-700 text-sm bg-red-50 border-b border-red-200">Database Error: {error}</div>
        )}
        {!error && loading && (
          <div className="py-12 flex justify-center items-center">
            <svg className="animate-spin h-6 w-6 text-purple-600 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
            </svg>
            <span className="text-slate-500 text-base">Loading tasks...</span>
          </div>
        )}
        {!error && !loading && filteredTasks.length === 0 && (
          <div className="p-6 text-slate-500">No tasks found for this status.</div>
        )}
        {!error && !loading && filteredTasks.length > 0 && (
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Title</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Location</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Category</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Due Date</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Assigned</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {filteredTasks.map((task) => (
                <tr
                  key={task.id}
                  className="cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => navigate('/task/' + task.id)}
                >
                  <td className="px-6 py-4 whitespace-nowrap text-slate-800 font-medium">{task.title}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-slate-500">{task.location}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-slate-500">{task.category}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-slate-500">{task.due_date ? new Date(task.due_date).toLocaleDateString() : '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {normalizeStatus(task.status) === 'Open' ? (
                      <span className="badge-status-open">Open</span>
                    ) : normalizeStatus(task.status) === 'Completed' ? (
                      <span className="badge-status-completed">Completed</span>
                    ) : (
                      <span className="badge-status-unknown">{task.status ?? 'Unknown'}</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-slate-500">
                    {task.assigned_to ? (assigneeById[task.assigned_to] || task.assigned_to) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default AdminDashboard;
