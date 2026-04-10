
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

function getToday() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export default function NewTask() {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Snagging');
  const [location, setLocation] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const today = getToday();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFiles(e.target.files);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      setError('You must be logged in to create a task.');
      setLoading(false);
      return;
    }
    let image_urls: string[] = [];
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = `${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage.from('task-files').upload(filePath, file);
        if (uploadError) {
          setError(`File upload failed: ${uploadError.message}`);
          setLoading(false);
          return;
        }
        const { data: publicUrlData } = supabase.storage.from('task-files').getPublicUrl(filePath);
        if (publicUrlData?.publicUrl) {
          image_urls.push(publicUrlData.publicUrl);
        }
      }
    }
    const { error: insertError } = await supabase.from('tasks').insert([
      {
        title,
        category,
        location,
        notes,
        due_date: dueDate,
        image_urls,
        status: 'Open',
        created_by: user.id,
      },
    ]);
    setLoading(false);
    if (insertError) {
      setError(insertError.message);
    } else {
      navigate('/dashboard');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-md p-8">
        <h2 className="text-3xl font-bold text-slate-800 mb-8">Create New Task</h2>
        {error && <div className="mb-4 text-red-600 font-medium">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-slate-700 font-semibold mb-2">Title</label>
              <input
                type="text"
                className="w-full border border-slate-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-fuchsia-400 text-slate-800"
                value={title}
                onChange={e => setTitle(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-slate-700 font-semibold mb-2">Category</label>
              <select
                className="w-full border border-slate-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-fuchsia-400 text-slate-800"
                value={category}
                onChange={e => setCategory(e.target.value)}
                required
                disabled={loading}
              >
                <option value="Snagging">Snagging</option>
                <option value="Domestic">Domestic</option>
                <option value="Additional Works">Additional Works</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-700 font-semibold mb-2">Site / Location</label>
              <input
                type="text"
                className="w-full border border-slate-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-fuchsia-400 text-slate-800"
                value={location}
                onChange={e => setLocation(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="flex flex-col md:flex-row md:space-x-4">
              <div className="flex-1 mb-2 md:mb-0">
                <label className="block text-slate-700 font-semibold mb-2">Date Added</label>
                <input
                  type="text"
                  className="w-full border border-slate-200 rounded-lg px-4 py-2 bg-slate-100 text-slate-500 cursor-not-allowed"
                  value={today}
                  readOnly
                  tabIndex={-1}
                />
              </div>
              <div className="flex-1">
                <label className="block text-slate-700 font-semibold mb-2">Due Date</label>
                <input
                  type="date"
                  className="w-full border border-slate-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-fuchsia-400 text-slate-800"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-slate-700 font-semibold mb-2">Notes</label>
            <textarea
              className="w-full border border-slate-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-fuchsia-400 text-slate-800 min-h-[100px]"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-slate-700 font-semibold mb-2">Upload Files/Images</label>
            <input
              type="file"
              multiple
              className="block w-full text-slate-700 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gradient-to-r file:from-purple-800 file:to-fuchsia-600 file:text-white hover:file:opacity-90"
              onChange={handleFileChange}
              disabled={loading}
            />
          </div>
          <div className="flex items-center space-x-4 mt-8">
            <button
              type="submit"
              className="bg-gradient-to-r from-purple-800 to-fuchsia-600 text-white font-bold py-2 px-6 rounded-lg hover:opacity-90 shadow-md disabled:opacity-60"
              disabled={loading}
            >
              {loading ? 'Saving Job...' : 'Submit Job'}
            </button>
            <button
              type="button"
              className="border border-slate-300 text-slate-600 font-semibold py-2 px-6 rounded-lg hover:bg-slate-50 transition"
              onClick={() => navigate('/dashboard')}
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
