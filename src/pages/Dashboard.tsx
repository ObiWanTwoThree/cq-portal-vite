import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import AdminDashboard from '../components/AdminDashboard';
import OperativeDashboard from '../components/OperativeDashboard';

type UserRole = 'admin' | 'operative' | null;

function normalizeRole(role: unknown): UserRole {
  if (typeof role !== 'string') return null;
  const r = role.trim().toLowerCase();
  if (r === 'admin') return 'admin';
  if (r === 'operative') return 'operative';
  return null;
}

export default function Dashboard() {
  const [role, setRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUserAndRole = async () => {
      setLoading(true);
      setError('');
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        setError('Not authenticated.');
        setLoading(false);
        navigate('/login');
        return;
      }
      setUserEmail(user.email || '');
      // Fetch profile (role + optional full_name) from profiles table.
      // Use select('*') so the UI doesn't break if columns differ between environments.
      const { data: profileData, error: dbError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      const normalized = normalizeRole((profileData as any)?.role);
      if (dbError || !normalized) {
        setError(`Unable to fetch user role. ${dbError?.message ?? 'No role found.'}`);
        setLoading(false);
        return;
      }
      setRole(normalized);
      const fullName = (profileData as any)?.full_name as string | undefined;
      setUserName(fullName?.trim() || user.email || 'User');
      setLoading(false);
    };
    fetchUserAndRole();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <div className="page">
      <nav className="flex items-center justify-between px-6 sm:px-8 py-4 bg-white border-b border-slate-200">
        <div className="flex items-center gap-3">
          <img src="/cq-logo.png" alt="CQ Logo" className="h-10 w-10 object-contain" />
          <div>
            <div className="text-2xl font-bold tracking-tight text-slate-900">CQ Services Portal</div>
            <div className="helper-text mt-1">Welcome, {userName || userEmail || 'User'}!</div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="btn-secondary"
        >
          Log Out
        </button>
      </nav>
      <main className="py-10">
        {loading && <div className="text-center text-lg text-slate-500">Loading dashboard...</div>}
        {error && <div className="text-center text-red-600 font-medium mt-8">{error}</div>}
        {!loading && !error && role === 'admin' && <AdminDashboard />}
        {!loading && !error && role === 'operative' && <OperativeDashboard />}
        {!loading && !error && !role && (
          <div className="text-center text-red-600 font-medium mt-8">Role not found.</div>
        )}
      </main>
    </div>
  );
}
