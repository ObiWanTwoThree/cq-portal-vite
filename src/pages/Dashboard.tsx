import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import AdminDashboard from '../components/AdminDashboard';
import OperativeDashboard from '../components/OperativeDashboard';

type UserRole = 'admin' | 'operative' | null;

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
      // Fetch role from users table
      const { data: roleData, error: dbError } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();
      if (dbError || !roleData?.role) {
        setError('Unable to fetch user role.');
        setLoading(false);
        return;
      }
      setRole(roleData.role);
      // Fetch full_name from profiles table
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();
      if (profileData?.full_name) {
        setUserName(profileData.full_name);
      } else {
        setUserName(user.email || 'User');
      }
      setLoading(false);
    };
    fetchUserAndRole();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="flex items-center justify-between px-8 py-4 bg-white shadow-sm border-b border-slate-100">
        <div>
          <div className="text-2xl font-bold text-slate-800 tracking-tight">CQ Services Portal</div>
          <div className="text-slate-600 text-base mt-1">Welcome, {userName || userEmail || 'User'}!</div>
        </div>
        <button
          onClick={handleLogout}
          className="border border-slate-300 text-slate-600 px-4 py-2 rounded-lg font-medium hover:bg-slate-50 transition"
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
