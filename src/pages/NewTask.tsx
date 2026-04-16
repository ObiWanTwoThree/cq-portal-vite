
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

function getToday() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export default function NewTask() {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Snagging');
  const [location, setLocation] = useState('');
  const [domesticClientName, setDomesticClientName] = useState('');
  const [domesticContactNumber, setDomesticContactNumber] = useState('');
  const [domesticFullAddress, setDomesticFullAddress] = useState('');
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
    const image_urls: string[] = [];
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
        location: location.trim(),
        domestic_client_name: category === 'Domestic' ? domesticClientName.trim() || null : null,
        domestic_contact_number: category === 'Domestic' ? domesticContactNumber.trim() || null : null,
        domestic_full_address: category === 'Domestic' ? domesticFullAddress.trim() || null : null,
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
    <div className="page p-6">
      <div className="max-w-2xl mx-auto">
        <button
          type="button"
          className="btn-secondary mb-6"
          onClick={() => navigate('/dashboard')}
          disabled={loading}
        >
          ← Back to Dashboard
        </button>
        <div className="card card-pad">
        <h2 className="page-title mb-6">Create New Task</h2>
        {error && <div className="mb-4 text-red-700 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="label">Title</label>
              <input
                type="text"
                className="input"
                value={title}
                onChange={e => setTitle(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div>
              <label className="label">Category</label>
              <select
                className="input"
                value={category}
                onChange={(e) => {
                  const next = e.target.value
                  setCategory(next)
                  if (next !== 'Domestic') {
                    setDomesticClientName('')
                    setDomesticContactNumber('')
                    setDomesticFullAddress('')
                  }
                }}
                required
                disabled={loading}
              >
                <option value="Snagging">Snagging</option>
                <option value="Remedials">Remedials</option>
                <option value="Domestic">Domestic</option>
                <option value="Commercial">Commercial</option>
                <option value="Additional Works">Additional Works</option>
                <option value="Warranty / Defects">Warranty / Defects</option>
                <option value="Inspection">Inspection</option>
                <option value="Emergency / Callout">Emergency / Callout</option>
              </select>
            </div>
            {category === 'Domestic' && (
              <div className="md:col-span-2 transition-all duration-200">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="label">Client Name</label>
                    <input
                      type="text"
                      className="input"
                      value={domesticClientName}
                      onChange={(e) => setDomesticClientName(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                  <div>
                    <label className="label">Contact Number</label>
                    <input
                      type="tel"
                      className="input"
                      value={domesticContactNumber}
                      onChange={(e) => setDomesticContactNumber(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="label">Full Address</label>
                    <input
                      type="text"
                      className="input"
                      value={domesticFullAddress}
                      onChange={(e) => setDomesticFullAddress(e.target.value)}
                      disabled={loading}
                      placeholder="House number, street, town/city, postcode"
                    />
                  </div>
                </div>
              </div>
            )}
            <div className="md:col-span-2">
              <label className="label inline-flex items-center gap-2">
                <MapPin size={16} className="text-purple-700" />
                Address or Postcode
              </label>
              <input
                type="text"
                className="input"
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="e.g. G40 3RE or 31 Maidenhill Grove"
                required
                disabled={loading}
              />
            </div>
            <div className="flex flex-col md:flex-row md:space-x-4">
              <div className="flex-1 mb-2 md:mb-0">
                <label className="label">Date Added</label>
                <input
                  type="text"
                  className="input bg-slate-100 text-slate-500 cursor-not-allowed"
                  value={today}
                  readOnly
                  tabIndex={-1}
                />
              </div>
              <div className="flex-1">
                <label className="label">Due Date</label>
                <input
                  type="date"
                  className="input"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea
              className="input min-h-[120px]"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              disabled={loading}
            />
          </div>
          <div>
            <label className="label">Upload Files/Images</label>
            <input
              type="file"
              multiple
              className="block w-full text-slate-700 file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-700"
              onChange={handleFileChange}
              disabled={loading}
            />
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2">
            <button
              type="submit"
              className="btn-primary w-full sm:w-auto"
              disabled={loading}
            >
              {loading ? 'Saving Job...' : 'Submit Job'}
            </button>
            <button
              type="button"
              className="btn-secondary w-full sm:w-auto"
              onClick={() => navigate('/dashboard')}
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
      </div>
    </div>
  );
}
