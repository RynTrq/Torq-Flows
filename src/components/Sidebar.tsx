'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AppLogo from './ui/AppLogo';
import LogoutButton from './LogoutButton';
import { GitBranch, ChevronLeft, ChevronRight, Activity, Zap } from 'lucide-react';
import type { AppShellCounts, AuthUser } from '@/lib/types';
import { getUserInitials } from '@/lib/types';

interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: number;
  group: string;
}

interface SidebarProps {
  user: AuthUser;
  counts: AppShellCounts;
}

export default function Sidebar({ user, counts }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const navItems: NavItem[] = [
    {
      id: 'nav-builder',
      label: 'Workflow Builder',
      href: '/workflow-builder',
      icon: GitBranch,
      group: 'Build',
    },
    {
      id: 'nav-management',
      label: 'Workflows',
      href: '/workflow-management',
      icon: Zap,
      badge: counts.workflowCount,
      group: 'Build',
    },
    {
      id: 'nav-execution',
      label: 'Execution Dashboard',
      href: '/execution-dashboard',
      icon: Activity,
      badge: counts.activeRunCount,
      group: 'Monitor',
    },
  ];
  const initials = getUserInitials(user.name);

  return (
    <aside
      className="relative flex flex-col bg-zinc-900 border-r border-zinc-800 transition-all duration-300 ease-in-out flex-shrink-0"
      style={{ width: collapsed ? 64 : 240 }}
    >
      {/* Logo */}
      <div
        className={`flex items-center h-14 px-3 border-b border-zinc-800 ${collapsed ? 'justify-center' : 'gap-2'}`}
      >
        <AppLogo size={60} />
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-16 z-10 flex items-center justify-center w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 transition-all duration-150"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
        {['Build', 'Monitor'].map((group) => (
          <div key={`group-${group}`} className="mb-4">
            {!collapsed && (
              <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
                {group}
              </p>
            )}
            {navItems
              .filter((item) => item.group === group)
              .map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={`relative flex items-center gap-3 px-2 py-2 rounded-lg text-sm font-medium transition-all duration-150 group ${
                      isActive
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
                    } ${collapsed ? 'justify-center' : ''}`}
                  >
                    <Icon size={18} className="flex-shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                    {!collapsed && item.badge && (
                      <span className="ml-auto flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-semibold bg-zinc-800 text-zinc-400">
                        {item.badge}
                      </span>
                    )}
                    {collapsed && item.badge && (
                      <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-emerald-400" />
                    )}
                    {collapsed && (
                      <div className="absolute left-full ml-2 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-100 whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150 z-50">
                        {item.label}
                      </div>
                    )}
                  </Link>
                );
              })}
          </div>
        ))}
      </nav>

      <div className="border-t border-zinc-800 py-3 px-2 space-y-1">
        <LogoutButton collapsed={collapsed} />

        <div
          className={`flex items-center gap-2 px-2 py-2 mt-1 ${collapsed ? 'justify-center' : ''}`}
        >
          <div className="w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
            <span className="text-[10px] font-semibold text-emerald-400">{initials}</span>
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-xs font-medium text-zinc-300 truncate">{user.name}</p>
              <p className="text-[10px] text-zinc-600 truncate">{user.email}</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
