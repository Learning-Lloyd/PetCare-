import type { User } from '@/types';
import { supabase } from '@/lib/supabaseClient';
import { fetchProfileRow, insertPublicUserProfileFromAuth, toAppUser } from '@/lib/supabaseHelpers';
import type { AuthError } from '@supabase/supabase-js';

function authErrorMessage(err: AuthError | null): string {
  return err?.message || 'Authentication failed';
}

export async function attemptLogin(
  email: string,
  password: string,
): Promise<
  | { ok: true; user: User }
  | { ok: false; error: string; deactivated?: boolean }
> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: authErrorMessage(error) };
    if (!data.user) return { ok: false, error: 'Sign-in failed' };
    const profile = await fetchProfileRow(data.user.id).catch(() => null);
    const u = toAppUser(data.user, profile);
    if (!u.isActive) {
      await supabase.auth.signOut();
      return {
        ok: false,
        error: 'This account has been deactivated. Contact an administrator.',
        deactivated: true,
      };
    }
    return { ok: true, user: u };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export type RegisterResult = {
  ok: boolean;
  message?: string;
};

export async function attemptAdminRegistration(
  name: string,
  email: string,
  password: string,
): Promise<RegisterResult> {
  try {
    const { data, error } = await supabase.functions.invoke('create-admin-user', {
      body: {
        email,
        password,
        full_name: name,
      },
    });
    if (error) {
      const message = error.message || 'Registration failed';
      return { ok: false, message };
    }
    const createdUser = (data as { user?: { id?: string; email?: string } } | null)?.user;
    if (!createdUser?.id) {
      return { ok: false, message: 'User creation returned no id.' };
    }
    const insertErr = await insertPublicUserProfileFromAuth({
      id: String(createdUser.id),
      email: String(createdUser.email ?? email),
      name,
    });
    if (insertErr) {
      return { ok: false, message: insertErr.message };
    }
    return { ok: true, message: 'User created successfully.' };
  } catch (e) {
    return { ok: false, message: String(e) };
  }
}
