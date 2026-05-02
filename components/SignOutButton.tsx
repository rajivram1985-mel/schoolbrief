'use client';

import { signOut } from '@/app/actions';

export default function SignOutButton() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
      >
        Sign out
      </button>
    </form>
  );
}
