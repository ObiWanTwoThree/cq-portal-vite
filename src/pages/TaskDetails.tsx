


import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import jsPDF from 'jspdf';

const TaskDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch task
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError('');
    Promise.all([
      supabase.from('tasks').select('*').eq('id', id).single(),
      supabase.from('task_comments').select('*').eq('task_id', id).order('created_at', { ascending: true })
    ])
      .then(([taskRes, commentsRes]) => {
        if (taskRes.error) setError(taskRes.error.message);
        else setTask(taskRes.data);
        setComments(commentsRes.data || []);
      })
      .catch(err => setError(err?.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [id]);

  // Admin unassign handler
  const handleUnassign = async () => {
    if (!id) return;
    if (!window.confirm('Are you sure you want to unassign this operative?')) return;
    await supabase.from('tasks').update({ assigned_to: null }).eq('id', id);
    // Refresh task state
    setLoading(true);
    const { data: newTask } = await supabase.from('tasks').select('*').eq('id', id).single();
    setTask(newTask);
    setLoading(false);
  };

  // PDF
  const generatePDF = () => {
    const doc = new jsPDF();
    doc.text(task?.title || 'Task', 10, 20);
    doc.text(task?.location || task?.site || '', 10, 30);
    doc.save(`${task?.title || 'task'}.pdf`);
  };

  // Chat
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !id) return;
    setSending(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) throw new Error('Not logged in');
      await supabase.from('task_comments').insert([
        { task_id: id, user_id: user.id, user_name: user.email, content: newComment }
      ]);
      setNewComment('');
      // Refresh comments
      const { data: commentsData } = await supabase.from('task_comments').select('*').eq('task_id', id).order('created_at', { ascending: true });
      setComments(commentsData || []);
    } catch (err: any) {
      alert('Failed to send message: ' + (err?.message || err));
    }
    setSending(false);
  };

  // File upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    setUploading(true);
    try {
      const fileName = `${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from('task-files').upload(fileName, file);
      if (uploadError) throw uploadError;
      const { data: publicUrlData } = supabase.storage.from('task-files').getPublicUrl(fileName);
      const publicUrl = publicUrlData.publicUrl;
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) throw new Error('Not logged in');
      await supabase.from('task_comments').insert([
        { task_id: id, user_id: user.id, user_name: user.email, content: publicUrl }
      ]);
      const { data: commentsData } = await supabase.from('task_comments').select('*').eq('task_id', id).order('created_at', { ascending: true });
      setComments(commentsData || []);
    } catch (err: any) {
      alert('Upload failed: ' + (err?.message || err));
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-2xl mx-auto">
        <button
          className="mb-6 border border-slate-300 text-slate-600 font-semibold py-2 px-6 rounded-lg hover:bg-slate-100 transition"
          onClick={() => navigate('/dashboard')}
        >
          ← Back to Dashboard
        </button>
        <div className="bg-white rounded-xl shadow-md p-8">
          {loading ? (
            <div className="text-slate-500 text-lg text-center">Loading task details...</div>
          ) : error ? (
            <div className="text-red-600 font-medium text-center">{error}</div>
          ) : !task ? (
            <div className="text-slate-500 text-lg text-center">Task not found.</div>
          ) : (
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-slate-800 mb-4">{task.title}</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                  <div>
                    <div className="font-bold text-slate-700">Site/Location</div>
                    <div className="text-slate-800">{task.location || task.site || '-'}</div>
                  </div>
                  <div>
                    <div className="font-bold text-slate-700">Category</div>
                    <div className="text-slate-800">{task.category || '-'}</div>
                  </div>
                  <div>
                    <div className="font-bold text-slate-700">Due Date</div>
                    <div className="text-slate-800">{task.due_date ? new Date(task.due_date).toLocaleDateString() : '-'}</div>
                  </div>
                  <div>
                    <div className="font-bold text-slate-700">Status</div>
                    <div className="text-slate-800">{task.status || '-'}</div>
                  </div>
                </div>
                {/* Assignment section for admin */}
                {task.assigned_to && (
                  <div className="flex items-center gap-4 mb-4">
                    <div className="font-bold text-slate-700">Assigned Operative:</div>
                    <div className="text-slate-800">{task.assigned_to}</div>
                    <button
                      className="ml-4 border border-red-200 text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg font-semibold transition-all duration-200"
                      onClick={handleUnassign}
                    >
                      Unassign
                    </button>
                  </div>
                )}
                <h3 className="font-bold text-slate-700">Notes</h3>
                <p className="text-slate-600 bg-slate-50 p-4 rounded mt-2">{task.notes || <span className="italic text-slate-400">No notes provided.</span>}</p>
                <button
                  onClick={generatePDF}
                  className="mt-6 px-4 py-2 border-2 border-purple-600 text-purple-600 font-semibold rounded-lg hover:bg-purple-50 transition-all"
                >
                  Download PDF
                </button>
              </div>
              <div className="mt-12">
                <div className="text-xl font-bold text-slate-800 mb-4">Job Updates & Chat</div>
                <div className="bg-slate-50 rounded-lg p-4 mb-4 min-h-[120px] max-h-72 overflow-y-auto border border-slate-100">
                  {comments.length === 0 ? (
                    <div className="text-slate-400 text-center italic">No updates yet. Start the conversation below!</div>
                  ) : (
                    <ul className="space-y-4">
                      {comments.map((c) => (
                        <li key={c.id} className="">
                          <div className="flex items-center space-x-2 mb-1">
                            <span className="font-bold text-slate-700">{c.user_name}</span>
                            <span className="text-xs text-slate-400">{c.created_at ? new Date(c.created_at).toLocaleString() : ''}</span>
                          </div>
                          <div className="text-slate-700 whitespace-pre-line ml-1">
                            {c.content && (c.content.match(/\.(jpeg|jpg|gif|png|webp)$/i) || c.content.startsWith('https://') && c.content.includes('/task-files/')) ? (
                              <img src={c.content} alt="uploaded" className="max-h-48 rounded-lg border mt-2" />
                            ) : (
                              c.content
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <form onSubmit={handleSendMessage} className="flex items-end space-x-2">
                  <input
                    type="text"
                    className="flex-1 border border-slate-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-fuchsia-400 text-slate-800 bg-white"
                    placeholder="Type a message..."
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    disabled={sending || uploading}
                  />
                  <button
                    type="submit"
                    className="bg-gradient-to-r from-purple-800 to-fuchsia-600 text-white font-bold py-2 px-6 rounded-lg hover:opacity-90 shadow-md disabled:opacity-60"
                    disabled={sending || !newComment.trim() || uploading}
                  >
                    {sending ? 'Sending...' : 'Send Message'}
                  </button>
                  <input
                    type="file"
                    accept="image/*"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    onChange={handleFileUpload}
                    disabled={uploading}
                  />
                  <button
                    type="button"
                    className="ml-2 bg-gradient-to-r from-purple-800 to-fuchsia-600 text-white font-bold py-2 px-2 rounded-lg hover:opacity-90 shadow-md disabled:opacity-60 flex items-center"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    title="Upload Photo"
                  >
                    {uploading ? <span className="animate-spin">+</span> : '+'}
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
export default TaskDetails;