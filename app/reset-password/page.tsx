"use client";
import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'next/navigation';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.updateUser({
      password: password
    });

    if (error) {
      alert(error.message);
    } else {
      setMessage("Password updated successfully! Redirecting...");
      setTimeout(() => router.push('/'), 2000);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <div className="bg-white p-8 rounded-[2rem] shadow-xl max-w-md w-full border-2 border-blue-600">
        <h2 className="text-2xl font-black uppercase italic tracking-tighter mb-6">Create New Password</h2>
        
        {message ? (
          <p className="text-green-600 font-bold text-center">{message}</p>
        ) : (
          <form onSubmit={handleReset} className="space-y-4">
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 ml-2">New Password</label>
              <input 
                type="password" 
                placeholder="••••••••" 
                className="w-full p-4 bg-slate-50 border rounded-2xl outline-none focus:border-blue-600 transition"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black shadow-lg hover:bg-blue-700 transition-all uppercase"
            >
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}