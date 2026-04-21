import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import AdminDashboard from '../components/AdminDashboard';
import OperativeDashboard from '../components/OperativeDashboard';
import JobSubmittedToast from '../components/JobSubmittedToast';

type UserRole = 'admin' | 'operative' | null;

type ProfileRow = {
  id: string
  role?: unknown
  full_name?: unknown
}

function normalizeRole(role: unknown): UserRole {
  if (typeof role !== 'string') return null;
  const r = role.trim().toLowerCase();
  if (r === 'admin') return 'admin';
  if (r === 'operative') return 'operative';
  return null;
}

type DashboardLocationState = { jobSubmitted?: boolean };

export default function Dashboard() {
  const [role, setRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [jobSubmittedToast, setJobSubmittedToast] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const state = location.state as DashboardLocationState | null;
    if (state?.jobSubmitted) {
      setJobSubmittedToast(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.pathname, location.state, navigate]);

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
      // Fetch profile (role + optional full_name) from profiles table.
      // Use select('*') so the UI doesn't break if columns differ between environments.
      const { data: profileData, error: dbError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      const profile = (profileData ?? null) as ProfileRow | null;
      const normalized = normalizeRole(profile?.role);
      if (dbError || !normalized) {
        setError(`Unable to fetch user role. ${dbError?.message ?? 'No role found.'}`);
        setLoading(false);
        return;
      }
      setRole(normalized);
      setLoading(false);
    };
    fetchUserAndRole();
  }, [navigate]);

  return (
    <div>
      <JobSubmittedToast open={jobSubmittedToast} onClose={() => setJobSubmittedToast(false)} />
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-3xl font-bold text-slate-950 tracking-tight mt-2">Dashboard</div>
        </div>
      </div>

      <div className="mt-6">
        {loading && <div className="text-center text-lg text-slate-500">Loading dashboard...</div>}
        {error && <div className="text-center text-red-600 font-medium mt-8">{error}</div>}
        {!loading && !error && role === 'admin' && <AdminDashboard />}
        {!loading && !error && role === 'operative' && <OperativeDashboard />}
        {!loading && !error && !role && (
          <div className="text-center text-red-600 font-medium mt-8">Role not found.</div>
        )}
      </div>
    </div>
  );
}
