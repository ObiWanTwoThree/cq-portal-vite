import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

const setPasswordSchema = z
  .object({
    fullName: z.string().min(2, 'Please enter your name'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string().min(6, 'Password must be at least 6 characters'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type SetPasswordValues = z.infer<typeof setPasswordSchema>;

const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const setUser = useAuthStore((state) => state.setUser);
  const [errorMsg, setErrorMsg] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SetPasswordValues>({
    resolver: zodResolver(setPasswordSchema),
    defaultValues: { fullName: '', password: '', confirmPassword: '' },
  });

  const onSubmit = async (values: SetPasswordValues) => {
    setErrorMsg('');
    try {
      // Set the user's password via the active invite/recovery session
      const { data, error: updateError } = await supabase.auth.updateUser({
        password: values.password,
      });
      if (updateError) throw updateError;

      setUser(data?.user ?? null);

      // Best-effort: store the user's display name on their profile (if the column exists).
      if (data?.user?.id) {
        const { error: profileErr } = await supabase.from('profiles').upsert(
          { id: data.user.id, full_name: values.fullName.trim() },
          { onConflict: 'id' },
        );
        if (profileErr) {
          // Ignore if the column isn't present yet; the password flow should still succeed.
          // eslint-disable-next-line no-console
          console.warn('Unable to save full name to profiles:', profileErr.message);
        }
      }

      // Mark invite as accepted in the invites table
      const email = data?.user?.email;
      if (email) {
        const { error: inviteError } = await supabase
          .from('invites')
          .update({ accepted: true })
          .eq('email', email);
        if (inviteError) throw inviteError;
      }

      navigate('/dashboard');
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Something went wrong. Please try again.');
    }
  };

  return (
    <div className="w-full min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 sm:px-6 box-border">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="bg-white p-6 sm:p-8 rounded-xl shadow-md w-full max-w-sm space-y-4"
      >
        <div className="flex justify-center mb-2">
          <img src="/cq-logo.png" alt="CQ Logo" className="h-20 w-20 object-contain" />
        </div>
        <h1 className="text-xl font-bold text-center text-slate-800 break-words">Set Your Password</h1>

        {errorMsg && (
          <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {errorMsg}
          </p>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Your name</label>
          <input type="text" {...register('fullName')} className="input" />
          {errors.fullName && (
            <p className="text-red-500 text-sm mt-1">{errors.fullName.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">New Password</label>
          <input type="password" {...register('password')} className="input" />
          {errors.password && (
            <p className="text-red-500 text-sm mt-1">{errors.password.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Confirm Password</label>
          <input type="password" {...register('confirmPassword')} className="input" />
          {errors.confirmPassword && (
            <p className="text-red-500 text-sm mt-1">{errors.confirmPassword.message}</p>
          )}
        </div>

        <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
          {isSubmitting ? 'Setting password…' : 'Set Password'}
        </button>
      </form>
    </div>
  );
};

export default RegisterPage;
