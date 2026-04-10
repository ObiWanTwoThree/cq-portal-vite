import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
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
          setTasks(data || []);
        }
      } catch (err: any) {
        setError(err.message || 'An unknown error occurred.');
        setTasks([]);
      } finally {
        clearTimeout(timeoutId);
        setLoading(false);
      }
    };
    fetchTasks();
    return () => clearTimeout(timeoutId);
  }, []);

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-3xl font-bold text-slate-800 tracking-tight">Admin Dashboard</h2>
        <button
          className="bg-gradient-to-r from-purple-800 to-fuchsia-600 hover:opacity-90 rounded-lg px-6 py-3 font-semibold shadow-md text-white transition"
          onClick={() => navigate('/dashboard/new-task')}
        >
          Create New Task
        </button>
      </div>
      <div className="bg-white rounded-xl shadow-md border border-slate-100 overflow-x-auto mt-6">
        {error && (
          <div className="p-10 text-red-500">Database Error: {error}</div>
        )}
        {!error && loading && (
          <div className="py-12 flex justify-center items-center">
            <svg className="animate-spin h-6 w-6 text-fuchsia-600 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
            </svg>
            <span className="text-slate-500 text-lg">Loading tasks...</span>
          </div>
        )}
        {!error && !loading && tasks.length === 0 && (
          <div className="p-10">No tasks found. Create one!</div>
        )}
        {!error && !loading && tasks.length > 0 && (
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Title</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Location</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Category</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Due Date</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {tasks.map((task) => (
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
                    {task.status === 'Open' ? (
                      <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-semibold">Open</span>
                    ) : (
                      <span className="bg-slate-100 text-slate-500 px-2 py-1 rounded-full text-xs font-semibold">{task.status}</span>
                    )}
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
