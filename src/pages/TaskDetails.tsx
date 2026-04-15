


import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { notifyUsers } from '../lib/notifications';
import jsPDF from 'jspdf';

const STATUSES = ['Open', 'Completed'] as const;
type TaskStatus = (typeof STATUSES)[number];
type UserRole = 'admin' | 'operative' | null;

type OperativeOption = {
  id: string;
  label: string;
};

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
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [userRole, setUserRole] = useState<UserRole>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [operatives, setOperatives] = useState<OperativeOption[]>([]);
  const [assignedOperativeLabel, setAssignedOperativeLabel] = useState<string>('');
  const [assigning, setAssigning] = useState(false);
  const [selectedOperativeId, setSelectedOperativeId] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch task
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError('');
    const load = async () => {
      try {
        const { data: authData } = await supabase.auth.getUser();
        const user = authData?.user ?? null;
        setCurrentUserId(user?.id ?? null);
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();
          setUserRole((profile as any)?.role ?? null);
        } else {
          setUserRole(null);
        }

        const [taskRes, commentsRes] = await Promise.all([
          supabase.from('tasks').select('*').eq('id', id).single(),
          supabase.from('task_comments').select('*').eq('task_id', id).order('created_at', { ascending: true }),
        ]);

        if (taskRes.error) {
          setError(taskRes.error.message);
          setTask(null);
          setComments([]);
          return;
        }

        setTask(taskRes.data);
        setComments(commentsRes.data || []);

        // Load assigned operative label (name/email fallback) if assigned.
        const assignedTo = (taskRes.data as any)?.assigned_to as string | null | undefined;
        if (assignedTo) {
          const { data: assignedProfile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', assignedTo)
            .single();
          const assignedName = (assignedProfile as any)?.full_name as string | undefined;
          setAssignedOperativeLabel(assignedName?.trim() || assignedTo);
        } else {
          setAssignedOperativeLabel('');
        }

        // Load operative list for admin assignment dropdown.
        const { data: ops } = await supabase
          .from('profiles')
          .select('*')
          .eq('role', 'operative')
          .order('full_name', { ascending: true });

        const options: OperativeOption[] = (ops || []).map((p: any) => {
          const name = (p.full_name as string | undefined)?.trim();
          return { id: p.id, label: name || p.id };
        });
        setOperatives(options);
        setSelectedOperativeId(assignedTo || '');
      } catch (err: any) {
        setError(err?.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id]);

  const updateStatus = async (nextStatus: TaskStatus) => {
    if (!id) return;
    setUpdatingStatus(true);
    try {
      const { error: updateErr } = await supabase
        .from('tasks')
        .update({ status: nextStatus })
        .eq('id', id);
      if (updateErr) throw updateErr;
      const { data: newTask, error: fetchErr } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', id)
        .single();
      if (fetchErr) throw fetchErr;
      setTask(newTask);

      const assignedTo = (newTask as any)?.assigned_to as string | null | undefined;
      if (assignedTo) {
        notifyUsers({
          userIds: [assignedTo],
          title: 'Job status updated',
          body: `Status changed to ${nextStatus}: ${newTask?.title ?? 'a job'}`,
          link: `/task/${id}`,
          type: 'task_status',
        });
      }
    } catch (e: any) {
      alert(e?.message ?? 'Failed to update status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Admin unassign handler
  const handleUnassign = async () => {
    if (!id) return;
    if (!window.confirm('Are you sure you want to unassign this operative?')) return;
    setAssigning(true);
    try {
      const { error: updateErr } = await supabase.from('tasks').update({ assigned_to: null }).eq('id', id);
      if (updateErr) throw updateErr;
      const { data: newTask } = await supabase.from('tasks').select('*').eq('id', id).single();
      setTask(newTask);
      setAssignedOperativeLabel('');
      setSelectedOperativeId('');
    } catch (e: any) {
      alert(e?.message ?? 'Failed to unassign');
    } finally {
      setAssigning(false);
    }
  };

  const handleAssignOperative = async () => {
    if (!id || !selectedOperativeId) return;
    setAssigning(true);
    try {
      const { error: updateErr } = await supabase
        .from('tasks')
        .update({ assigned_to: selectedOperativeId })
        .eq('id', id);
      if (updateErr) throw updateErr;

      const { data: newTask } = await supabase.from('tasks').select('*').eq('id', id).single();
      setTask(newTask);

      const chosen = operatives.find((o) => o.id === selectedOperativeId);
      setAssignedOperativeLabel(chosen?.label || selectedOperativeId);

      // Notify the operative they were assigned.
      notifyUsers({
        userIds: [selectedOperativeId],
        title: 'Job assigned to you',
        body: `You have been assigned: ${newTask?.title ?? 'a job'}`,
        link: `/task/${id}`,
        type: 'task_assigned',
      });
    } catch (e: any) {
      alert(e?.message ?? 'Failed to assign');
    } finally {
      setAssigning(false);
    }
  };

  const handleAdminAssignToMe = async () => {
    if (!id || !currentUserId) return;
    if (task?.assigned_to && task.assigned_to !== currentUserId) {
      const ok = window.confirm('This job is currently assigned to someone else. Reassign to you?');
      if (!ok) return;
    }
    setAssigning(true);
    try {
      const { error: updateErr } = await supabase
        .from('tasks')
        .update({ assigned_to: currentUserId })
        .eq('id', id);
      if (updateErr) throw updateErr;

      const { data: newTask } = await supabase.from('tasks').select('*').eq('id', id).single();
      setTask(newTask);
      setSelectedOperativeId(currentUserId);
      setAssignedOperativeLabel('You');

      notifyUsers({
        userIds: [currentUserId],
        title: 'Job assigned to you',
        body: `You were assigned: ${newTask?.title ?? 'a job'}`,
        link: `/task/${id}`,
        type: 'task_assigned',
      });
    } catch (e: any) {
      alert(e?.message ?? 'Failed to assign');
    } finally {
      setAssigning(false);
    }
  };

  const handleAssignToMe = async () => {
    if (!id) return;
    setAssigning(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user?.id) throw new Error('Not logged in');

      const { data: profileRow, error: profileErr } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();
      if (profileErr) throw profileErr;
      if (!profileRow?.id) throw new Error(`No profile row exists for your user id (${user.id}).`);

      const { error: updateErr } = await supabase
        .from('tasks')
        .update({ assigned_to: user.id, status: 'Open' })
        .eq('id', id)
        .is('assigned_to', null);
      if (updateErr) throw updateErr;

      const { data: newTask } = await supabase.from('tasks').select('*').eq('id', id).single();
      setTask(newTask);
      setSelectedOperativeId(user.id);
      setAssignedOperativeLabel('You');

      notifyUsers({
        userIds: [user.id],
        title: 'Job assigned to you',
        body: `You claimed: ${newTask?.title ?? 'a job'}`,
        link: `/task/${id}`,
        type: 'task_assigned',
      });
    } catch (e: any) {
      alert(`${e?.message ?? 'Failed to assign job'}${e?.details ? `\n\n${e.details}` : ''}`);
    } finally {
      setAssigning(false);
    }
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

      // Notify assigned operative (if any) except the commenter.
      const assignedTo = (task as any)?.assigned_to as string | null | undefined;
      if (assignedTo && assignedTo !== user.id) {
        notifyUsers({
          userIds: [assignedTo],
          title: 'New job update',
          body: `New message on: ${task?.title ?? 'a job'}`,
          link: `/task/${id}`,
          type: 'task_comment',
        });
      }

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
    <div className="page p-6">
      <div className="max-w-2xl mx-auto">
        <button
          className="btn-secondary mb-6"
          onClick={() => navigate('/dashboard')}
        >
          ← Back to Dashboard
        </button>
        <div className="card card-pad">
          {loading ? (
            <div className="text-slate-500 text-lg text-center">Loading task details...</div>
          ) : error ? (
            <div className="text-red-700 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
          ) : !task ? (
            <div className="text-slate-500 text-lg text-center">Task not found.</div>
          ) : (
            <>
              <div className="mb-8">
                <h2 className="page-title mb-4">{task.title}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
                  <div>
                    <div className="label mb-0">Site/Location</div>
                    <div className="text-slate-800">{task.location || task.site || '-'}</div>
                  </div>
                  <div>
                    <div className="label mb-0">Category</div>
                    <div className="text-slate-800">{task.category || '-'}</div>
                  </div>
                  <div>
                    <div className="label mb-0">Due Date</div>
                    <div className="text-slate-800">{task.due_date ? new Date(task.due_date).toLocaleDateString() : '-'}</div>
                  </div>
                  <div>
                    <div className="label mb-0">Status</div>
                    <select
                      className="input mt-1"
                      value={task.status || 'Open'}
                      onChange={(e) => updateStatus(e.target.value as TaskStatus)}
                      disabled={updatingStatus}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {/* Assignment section (admin) */}
                {userRole === 'admin' && (
                  <div className="mb-6">
                    <div className="label">Assignment</div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <select
                        className="input w-full sm:flex-1"
                        value={selectedOperativeId}
                        onChange={(e) => setSelectedOperativeId(e.target.value)}
                        disabled={assigning}
                      >
                        <option value="">Unassigned</option>
                        {operatives.map((o) => (
                          <option key={o.id} value={o.id}>{o.label}</option>
                        ))}
                      </select>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full sm:w-auto">
                        <button
                          type="button"
                          className="btn-primary w-full"
                          onClick={handleAssignOperative}
                          disabled={assigning || !selectedOperativeId}
                        >
                          {assigning ? 'Saving…' : 'Assign operative'}
                        </button>
                        <button
                          type="button"
                          className="btn-primary w-full"
                          onClick={handleAdminAssignToMe}
                          disabled={assigning || !currentUserId}
                        >
                          {assigning ? 'Saving…' : 'Assign to me'}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary w-full"
                          onClick={handleUnassign}
                          disabled={assigning || !task.assigned_to}
                        >
                          Unassign
                        </button>
                      </div>
                    </div>
                    {task.assigned_to && (
                      <div className="text-slate-600 mt-2 text-sm">
                        Currently assigned to: <span className="font-semibold text-slate-800">{assignedOperativeLabel || task.assigned_to}</span>
                      </div>
                    )}
                  </div>
                )}
                <div className="mt-6">
                  <h3 className="section-title">Notes</h3>
                  <p className="text-slate-600 bg-slate-50 border border-slate-200 p-4 rounded-lg mt-2">
                    {task.notes || <span className="italic text-slate-400">No notes provided.</span>}
                  </p>
                  <div className="mt-4">
                    <button onClick={generatePDF} className="btn-secondary">
                      Download PDF
                    </button>
                  </div>
                </div>
              </div>

              {userRole !== 'admin' && !task.assigned_to && (
                <button
                  type="button"
                  className="btn-primary w-full mt-2"
                  onClick={handleAssignToMe}
                  disabled={assigning || !currentUserId}
                >
                  {assigning ? 'Assigning…' : 'Assign to Me'}
                </button>
              )}
              <div className="mt-12">
                <div className="section-title mb-4">Job Updates</div>
                <div className="bg-slate-50 rounded-lg p-4 mb-4 min-h-[120px] max-h-72 overflow-y-auto border border-slate-200">
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
                    className="input flex-1"
                    placeholder="Type a message..."
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    disabled={sending || uploading}
                  />
                  <button
                    type="submit"
                    className="btn-primary w-auto"
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
                    className="btn-primary w-auto px-3"
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