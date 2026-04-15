import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Settings,
  LogOut,
  Bell,
  FileText
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import type { NotificationRow } from '../lib/notifications';

interface MainLayoutProps {
  /**
   * Optional override. If omitted, we fetch `profiles.full_name` (fallback: email).
   */
  userName?: string;
  children: React.ReactNode;
}

const navLinks = [
  { label: 'Dashboard', icon: <LayoutDashboard size={22} />, path: '/dashboard' },
  { label: 'Sites', icon: <FileText size={22} />, path: '/sites' },
  { label: 'Users', icon: <Users size={22} />, path: '/users' },
  { label: 'Settings', icon: <Settings size={22} />, path: '/settings' },
];

export default function MainLayout({ userName = 'User', children }: MainLayoutProps) {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(userName);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const unreadCount = notifications.filter((n) => !n.read_at).length;

  useEffect(() => {
    let cancelled = false;

    // If caller provides a real name, use it as-is.
    if (userName && userName !== 'User') {
      setDisplayName(userName);
      return;
    }

    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      const fullName = (profile as any)?.full_name as string | undefined;
      const next = fullName?.trim() || user.email || 'User';
      if (!cancelled) setDisplayName(next);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [userName]);

  useEffect(() => {
    let cancelled = false;
    if (!currentUserId) return;

    const loadNotifs = async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', currentUserId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) return;
      if (!cancelled) setNotifications((data ?? []) as NotificationRow[]);
    };

    loadNotifs();
    const interval = window.setInterval(loadNotifs, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [currentUserId]);

  const markAllRead = async () => {
    if (!currentUserId) return;
    const unreadIds = notifications.filter((n) => !n.read_at).map((n) => n.id);
    if (unreadIds.length === 0) return;
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .in('id', unreadIds);
    setNotifications((prev) => prev.map((n) => (unreadIds.includes(n.id) ? { ...n, read_at: new Date().toISOString() } : n)));
  };

  const openNotification = async (n: NotificationRow) => {
    setNotifOpen(false);
    if (!n.read_at) {
      await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id);
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
    }
    if (n.link) navigate(n.link);
  };

  // Responsive: show sidebar on desktop, bottom nav on mobile
  return (
    <div className="flex min-h-screen bg-slate-50 overflow-x-hidden">
      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex flex-col w-64 h-screen fixed left-0 top-0 z-30 bg-slate-900 text-white border-r border-slate-800">
        <div className="flex items-center h-20 px-6 gap-3">
          <img src="/cq-logo.png" alt="CQ Logo" className="h-10 w-10 object-contain rounded-full" />
          <span className="font-bold text-xl tracking-tight">CQ Portal</span>
        </div>
        <nav className="flex-1 px-2 mt-8 space-y-2">
          {navLinks.map(link => (
            <button
              key={link.label}
              className="flex items-center w-full px-4 py-3 rounded-lg hover:bg-slate-800 transition text-left gap-3"
              onClick={() => navigate(link.path)}
            >
              {link.icon}
              <span>{link.label}</span>
            </button>
          ))}
        </nav>
        <button
          className="flex items-center gap-3 px-4 py-3 m-4 rounded-lg hover:bg-slate-800 transition"
          onClick={() => navigate('/login')}
        >
          <LogOut size={22} />
          <span>Log Out</span>
        </button>
      </aside>

      {/* Bottom nav (mobile) */}
      <nav className="fixed md:hidden bottom-0 left-0 right-0 z-40 bg-slate-900 flex justify-around items-center h-16 text-white border-t border-slate-800">
        {navLinks.slice(0, 4).map(link => (
          <button
            key={link.label}
            className="flex flex-col items-center justify-center px-2 py-1 hover:text-purple-300 transition"
            onClick={() => navigate(link.path)}
          >
            {link.icon}
            <span className="text-xs mt-1">{link.label}</span>
          </button>
        ))}
        <button onClick={() => navigate('/login')} className="flex flex-col items-center justify-center px-2 py-1 hover:text-purple-300 transition">
          <LogOut size={22} />
          <span className="text-xs mt-1">Log Out</span>
        </button>
      </nav>

      {/* Main content area */}
      <div className="flex-1 w-full min-w-0 min-h-screen md:ml-64 pb-16 md:pb-0 overflow-x-hidden">
        {/* Header */}
        <header className="sticky top-0 z-20 flex items-center justify-between px-4 sm:px-8 py-4 bg-white border-b border-slate-200">
          <div className="text-base font-semibold text-slate-900">Welcome, {displayName}!</div>
          <button
            className="relative p-2 rounded-full hover:bg-slate-100 transition"
            onClick={() => setNotifOpen((v) => !v)}
            type="button"
          >
            <Bell size={22} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 bg-purple-600 text-white text-xs font-bold rounded-full flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          {notifOpen && (
            <div className="absolute right-4 sm:right-8 top-[64px] w-[320px] max-w-[90vw] card overflow-hidden z-50">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <div className="font-bold text-slate-800">Notifications</div>
                <button
                  type="button"
                  className="text-sm font-semibold text-purple-700 hover:text-purple-800 disabled:opacity-50"
                  onClick={markAllRead}
                  disabled={unreadCount === 0}
                >
                  Mark all read
                </button>
              </div>
              <div className="max-h-[360px] overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-4 py-6 text-slate-500 text-sm">No notifications yet.</div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {notifications.map((n) => (
                      <li key={n.id}>
                        <button
                          type="button"
                          className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition ${n.read_at ? '' : 'bg-purple-50/40'}`}
                          onClick={() => openNotification(n)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-800 truncate">{n.title}</div>
                              {n.body && <div className="text-sm text-slate-600 mt-0.5 line-clamp-2">{n.body}</div>}
                            </div>
                            {!n.read_at && <div className="mt-1 w-2 h-2 bg-purple-600 rounded-full flex-none" />}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </header>
        <main className="px-4 py-6 sm:p-6 w-full min-w-0 box-border">
          <div className="max-w-5xl mx-auto w-full min-w-0">
            <div className="card p-4 sm:p-8 w-full min-w-0">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
