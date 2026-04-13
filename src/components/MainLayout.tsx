import React, { useState } from 'react';
import {
  LayoutDashboard,
  Briefcase,
  Users,
  Settings,
  LogOut,
  Bell
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface MainLayoutProps {
  userName?: string;
  children: React.ReactNode;
}

const navLinks = [
  { label: 'Dashboard', icon: <LayoutDashboard size={22} />, path: '/dashboard' },
  { label: 'Jobs', icon: <Briefcase size={22} />, path: '/dashboard' },
  { label: 'Users', icon: <Users size={22} />, path: '/users' },
  { label: 'Settings', icon: <Settings size={22} />, path: '/settings' },
];

export default function MainLayout({ userName = 'User', children }: MainLayoutProps) {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Responsive: show sidebar on desktop, bottom nav on mobile
  return (
    <div className="flex min-h-screen bg-slate-50 overflow-x-hidden">
      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex flex-col w-64 h-screen fixed left-0 top-0 z-30 bg-gradient-to-b from-slate-900 to-slate-800 text-white shadow-xl">
        <div className="flex items-center h-20 px-6 font-bold text-2xl tracking-tight">CQ Portal</div>
        <nav className="flex-1 px-2 mt-8 space-y-2">
          {navLinks.map(link => (
            <button
              key={link.label}
              className="flex items-center w-full px-4 py-3 rounded-lg hover:bg-slate-700 transition text-left gap-3"
              onClick={() => navigate(link.path)}
            >
              {link.icon}
              <span>{link.label}</span>
            </button>
          ))}
        </nav>
        <button
          className="flex items-center gap-3 px-4 py-3 m-4 rounded-lg hover:bg-slate-700 transition"
          onClick={() => navigate('/login')}
        >
          <LogOut size={22} />
          <span>Log Out</span>
        </button>
      </aside>

      {/* Bottom nav (mobile) */}
      <nav className="fixed md:hidden bottom-0 left-0 right-0 z-40 bg-gradient-to-t from-slate-900 to-slate-800 flex justify-around items-center h-16 text-white shadow-2xl">
        {navLinks.slice(0, 4).map(link => (
          <button
            key={link.label}
            className="flex flex-col items-center justify-center px-2 py-1 hover:text-fuchsia-400 transition"
            onClick={() => navigate(link.path)}
          >
            {link.icon}
            <span className="text-xs mt-1">{link.label}</span>
          </button>
        ))}
        <button onClick={() => navigate('/login')} className="flex flex-col items-center justify-center px-2 py-1 hover:text-fuchsia-400 transition">
          <LogOut size={22} />
          <span className="text-xs mt-1">Log Out</span>
        </button>
      </nav>

      {/* Main content area */}
      <div className="flex-1 w-full min-w-0 min-h-screen md:ml-64 pb-16 md:pb-0 overflow-x-hidden">
        {/* Header */}
        <header className="sticky top-0 z-20 flex items-center justify-between px-4 sm:px-8 py-5 bg-white/80 backdrop-blur-md border-b border-white/20 shadow-xl">
          <div className="text-lg font-semibold text-slate-800">Welcome, {userName}!</div>
          <button className="relative p-2 rounded-full hover:bg-slate-100 transition">
            <Bell size={22} />
            <span className="absolute top-1 right-1 w-2 h-2 bg-fuchsia-500 rounded-full animate-pulse" />
          </button>
        </header>
        <main className="px-4 py-6 sm:p-6 w-full min-w-0 box-border">
          <div className="max-w-5xl mx-auto w-full min-w-0">
            <div className="bg-white/80 backdrop-blur-md border border-white/20 shadow-xl rounded-2xl p-4 sm:p-8 w-full min-w-0">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
