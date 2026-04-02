'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, LogOut } from 'lucide-react';

interface LogoutButtonProps {
  collapsed: boolean;
}

export default function LogoutButton({ collapsed }: LogoutButtonProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const handleLogout = async () => {
    setSubmitting(true);

    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
      });
      router.push('/login');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <button
      onClick={handleLogout}
      disabled={submitting}
      className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg text-sm font-medium text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 transition-all duration-150 ${collapsed ? 'justify-center' : ''}`}
      title={collapsed ? 'Log out' : undefined}
    >
      {submitting ? (
        <Loader2 size={16} className="animate-spin flex-shrink-0" />
      ) : (
        <LogOut size={16} className="flex-shrink-0" />
      )}
      {!collapsed && <span className="truncate">Log Out</span>}
    </button>
  );
}
