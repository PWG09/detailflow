'use client';

import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
export default function LogoutButton() { const router = useRouter(); async function logout() { await createSupabaseBrowserClient().auth.signOut(); router.replace('/login'); } return <button className="auth-switch" type="button" onClick={() => void logout()}>Sign out</button>; }
