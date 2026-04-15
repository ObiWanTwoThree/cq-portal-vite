import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

const Register = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, role: 'operative' }
        }
      });
      if (signUpError) throw signUpError;
      if (data.user) {
        await supabase.from('profiles').insert([
          { id: data.user.id, full_name: fullName, role: 'operative' }
        ]);
        navigate('/login');
      }
    } catch (err: any) {
      setError(err?.message || 'Registration failed');
    }
    setLoading(false);
  };

  return (
    <div className="page flex items-center justify-center px-4">
      <div className="card card-pad w-full max-w-md">
        <h2 className="page-title mb-6 text-center">Welcome to CQ Sealants</h2>
        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="label">Full name</label>
            <input
              type="text"
              className="input"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <div className="text-red-600 text-center font-medium">{error}</div>}
          <button
            type="submit"
            className="btn-primary w-full"
            disabled={loading}
          >
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Register;
