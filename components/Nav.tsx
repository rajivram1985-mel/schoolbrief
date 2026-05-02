'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import SignOutButton from '@/components/SignOutButton';

type NavProps = {
  email: string;
  isConnected: boolean;
};

export default function Nav({ email, isConnected }: NavProps) {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-40 bg-white border-b border-gray-100 shadow-sm">
      <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-bold text-lg" style={{ color: '#1a1a1a' }}>
            SchoolBrief
          </span>
          {isConnected && (
            <span
              className="text-xs px-2 py-0.5 rounded-full text-white font-medium"
              style={{ backgroundColor: '#4A7C59' }}
            >
              ● Connected
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400 hidden sm:block truncate max-w-[140px]">
            {email}
          </span>
          <SignOutButton />
        </div>
      </div>

      {/* Tab bar */}
      <div className="max-w-lg mx-auto flex px-2">
        <TabLink href="/upcoming" label="Upcoming" active={pathname.startsWith('/upcoming')} />
        <TabLink href="/notes" label="Notes" active={pathname.startsWith('/notes')} />
      </div>
    </nav>
  );
}

function TabLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
        active
          ? 'border-[#4A7C59] text-[#4A7C59]'
          : 'border-transparent text-gray-400 hover:text-gray-600'
      }`}
    >
      {label}
    </Link>
  );
}
