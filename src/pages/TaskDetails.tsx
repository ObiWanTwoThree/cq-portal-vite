


import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { notifyUsers } from '../lib/notifications';
import jsPDF from 'jspdf';
import { Camera, ChevronLeft, MapPin, Navigation, Pencil, Plus, Save, Trash2, X } from 'lucide-react';

const STATUSES = ['Open', 'In Progress', 'Completed', 'Closed'] as const;
type TaskStatus = (typeof STATUSES)[number];
type UserRole = 'admin' | 'operative' | null;

type ProfileRow = {
  id: string
  role?: unknown
  full_name?: unknown
  email?: unknown
}

type TaskRow = {
  id: string
  title?: string | null
  category?: string | null
  location?: string | null
  site?: string | null
  postcode?: string | null
  due_date?: string | null
  status?: string | null
  notes?: string | null
  assigned_to?: string | null
  completion_percent?: number | null
  photo_urls?: string[] | null
}

type CommentRow = {
  id: string
  task_id: string
  user_id: string
  user_name: string
  content: string
  created_at: string
}

type OperativeOption = {
  id: string;
  label: string;
};

const TaskDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState<TaskRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [comments, setComments] = useState<CommentRow[]>([]);
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
  const [deleting, setDeleting] = useState(false);
  const [assigningAction, setAssigningAction] = useState<'assign_operative' | 'assign_me' | 'unassign' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number>(0);
  const [savingProgress, setSavingProgress] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const [editTask, setEditTask] = useState(false);
  const [savingTaskEdits, setSavingTaskEdits] = useState(false);
  const [taskEditDraft, setTaskEditDraft] = useState({
    title: '',
    location: '',
    category: 'Snagging',
    due_date: '',
  });

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
          const p = (profile ?? null) as ProfileRow | null;
          const rRaw = typeof p?.role === 'string' ? p.role : '';
          const r = rRaw.toLowerCase().trim();
          setUserRole((r === 'admin' || r === 'operative') ? (r as UserRole) : null);
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

        const nextTask = (taskRes.data ?? null) as TaskRow | null;
        setTask(nextTask);
        setComments(((commentsRes.data || []) as CommentRow[]));
        setProgress(
          typeof nextTask?.completion_percent === 'number'
            ? Math.max(0, Math.min(100, Math.round(nextTask.completion_percent)))
            : 0,
        );

        // Load assigned operative label (name/email fallback) if assigned.
        const assignedTo = ((taskRes.data ?? null) as TaskRow | null)?.assigned_to ?? null;
        if (assignedTo) {
          const { data: assignedProfile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', assignedTo)
            .single();
          const ap = (assignedProfile ?? null) as ProfileRow | null;
          const assignedName = typeof ap?.full_name === 'string' ? ap.full_name : '';
          const assignedEmail = typeof ap?.email === 'string' ? ap.email : ''
          setAssignedOperativeLabel(assignedName.trim() || assignedEmail.trim() || 'Operative');
        } else {
          setAssignedOperativeLabel('');
        }

        // Load operative list for admin assignment dropdown.
        // Prefer name/email for display. Never show raw UUIDs to end users.
        let ops: ProfileRow[] = []
        {
          const { data: ops1, error: opsErr1 } = await supabase
            .from('profiles')
            .select('id,role,full_name,email')
            .ilike('role', 'operative')
            .order('full_name', { ascending: true })
          if (!opsErr1) {
            ops = (ops1 ?? []) as ProfileRow[]
          } else {
            const { data: ops2 } = await supabase
              .from('profiles')
              .select('*')
              .ilike('role', 'operative')
              .order('full_name', { ascending: true })
            ops = (ops2 ?? []) as ProfileRow[]
          }
        }

        const options: OperativeOption[] = ops
          .map((p) => {
            const name = typeof p.full_name === 'string' ? p.full_name.trim() : ''
            const email = typeof p.email === 'string' ? p.email.trim() : ''
            const label = name || email
            return { id: p.id, label }
          })
          .filter((o) => Boolean(o.label))

        setOperatives(options);
        setSelectedOperativeId(assignedTo || '');
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load');
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
      const nextTask = (newTask ?? null) as TaskRow | null;
      setTask(nextTask);

      const assignedTo = nextTask?.assigned_to ?? null;
      if (assignedTo) {
        notifyUsers({
          userIds: [assignedTo],
          title: 'Job status updated',
          body: `Status changed to ${nextStatus}: ${newTask?.title ?? 'a job'}`,
          link: `/task/${id}`,
          type: 'task_status',
        });
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to update status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const mapsHref = (postcodeValue: string) => {
    // Requirement: replace spaces with plus signs.
    const query = encodeURIComponent(postcodeValue.trim()).replace(/%20/g, '+')
    return `https://www.google.com/maps/search/?api=1&query=${query}`
  }

  const mapsHrefAddress = (addressValue: string) => {
    const query = encodeURIComponent(addressValue.trim()).replace(/%20/g, '+')
    return `https://www.google.com/maps/search/?api=1&query=${query}`
  }

  const startEditTask = () => {
    if (userRole !== 'admin' || !task) return
    setTaskEditDraft({
      title: (task.title ?? '').toString(),
      location: (task.location ?? task.site ?? '').toString(),
      category: (task.category ?? 'Snagging').toString(),
      due_date: (task.due_date ?? '').toString().slice(0, 10),
    })
    setEditTask(true)
  }

  const cancelEditTask = () => {
    setEditTask(false)
  }

  const saveTaskEdits = async () => {
    if (!id) return
    if (userRole !== 'admin') return
    const title = taskEditDraft.title.trim()
    if (!title) {
      setError('Title is required.')
      return
    }

    setSavingTaskEdits(true)
    setError('')
    try {
      const payload = {
        title,
        location: taskEditDraft.location.trim() || null,
        category: taskEditDraft.category || null,
        due_date: taskEditDraft.due_date || null,
      }
      const { error: upErr } = await supabase.from('tasks').update(payload).eq('id', id)
      if (upErr) throw upErr

      setTask((prev) => (prev ? { ...prev, ...payload } : prev))
      setEditTask(false)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg || 'Failed to save task')
    } finally {
      setSavingTaskEdits(false)
    }
  }

  const statusBadgeClass = (statusRaw: unknown) => {
    const s = typeof statusRaw === 'string' ? statusRaw.toLowerCase().trim() : ''
    if (s === 'open') return 'bg-emerald-50 text-emerald-700 border border-emerald-200'
    if (s === 'in progress' || s === 'in_progress') return 'bg-sky-50 text-sky-700 border border-sky-200'
    if (s === 'completed' || s === 'closed') return 'bg-slate-100 text-slate-700 border border-slate-200'
    return 'bg-slate-100 text-slate-700 border border-slate-200'
  }

  const assignedToLabel = useMemo(() => {
    if (!task?.assigned_to) return 'Unassigned'
    return assignedOperativeLabel?.trim() || 'Assigned'
  }, [assignedOperativeLabel, task?.assigned_to])

  const chatImageUrls = useMemo(() => {
    return comments
      .map((c) => (c.content ?? '').trim())
      .filter(Boolean)
      .filter((v) => {
        if (!v.startsWith('http')) return false
        if (v.includes('/storage/v1/object/public/task-files/')) return true
        return /\.(jpeg|jpg|png|gif|webp)$/i.test(v)
      })
  }, [comments])

  const galleryUrls = useMemo(() => {
    const fromTask = Array.isArray(task?.photo_urls) ? task.photo_urls : []
    const merged = [...fromTask, ...chatImageUrls]
    const seen = new Set<string>()
    const out: string[] = []
    for (const u of merged) {
      const k = (u ?? '').trim()
      if (!k || seen.has(k)) continue
      seen.add(k)
      out.push(k)
    }
    return out
  }, [chatImageUrls, task])

  const saveProgress = async (nextValue: number) => {
    if (!id) return
    setSavingProgress(true)
    setError('')
    try {
      const { error: upErr } = await supabase.from('tasks').update({ completion_percent: nextValue }).eq('id', id)
      if (upErr) throw upErr
      setTask((prev) => (prev ? { ...prev, completion_percent: nextValue } : prev))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg || 'Failed to save progress')
    } finally {
      setSavingProgress(false)
    }
  }

  const uploadGalleryPhoto = async (file: File) => {
    if (!id) return
    setUploadingGallery(true)
    setError('')
    try {
      const path = `${id}/${Date.now()}-${file.name}`
      const { error: upErr } = await supabase.storage.from('task-files').upload(path, file, { upsert: false })
      if (upErr) throw upErr
      const { data: publicUrlData } = supabase.storage.from('task-files').getPublicUrl(path)
      const url = publicUrlData.publicUrl

      // Best-effort: persist in tasks.photo_urls (requires DB column). If missing, this will fail silently.
      const next = [...(Array.isArray(task?.photo_urls) ? task!.photo_urls : []), url]
      const { error: upTaskErr } = await supabase.from('tasks').update({ photo_urls: next }).eq('id', id)
      if (!upTaskErr) setTask((prev) => (prev ? { ...prev, photo_urls: next } : prev))

      // Also post into chat so everyone sees it in updates.
      const { data: userData } = await supabase.auth.getUser()
      const user = userData?.user
      if (user?.id) {
        await supabase.from('task_comments').insert([{ task_id: id, user_id: user.id, user_name: user.email, content: url }])
        const { data: commentsData } = await supabase
          .from('task_comments')
          .select('*')
          .eq('task_id', id)
          .order('created_at', { ascending: true })
        setComments(((commentsData || []) as CommentRow[]))
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg || 'Upload failed')
    } finally {
      setUploadingGallery(false)
      if (galleryInputRef.current) galleryInputRef.current.value = ''
    }
  }

  const deleteOpenJob = async () => {
    if (!id) return
    if (userRole !== 'admin') return
    if ((task?.status ?? 'Open') !== 'Open') {
      alert('Only Open jobs can be deleted.')
      return
    }
    if (!window.confirm('Delete this open job? This cannot be undone.')) return

    setDeleting(true)
    setError('')
    try {
      // Best-effort: delete comments first (ignore failures).
      await supabase.from('task_comments').delete().eq('task_id', id)

      const { error: delErr } = await supabase.from('tasks').delete().eq('id', id)
      if (delErr) throw delErr
      navigate('/dashboard')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg || 'Failed to delete job')
    } finally {
      setDeleting(false)
    }
  }

  // Admin unassign handler
  const handleUnassign = async () => {
    if (!id) return;
    if (!window.confirm('Are you sure you want to unassign this operative?')) return;
    setAssigningAction('unassign');
    setAssigning(true);
    try {
      const { error: updateErr } = await supabase.from('tasks').update({ assigned_to: null }).eq('id', id);
      if (updateErr) throw updateErr;
      const { data: newTask } = await supabase.from('tasks').select('*').eq('id', id).single();
      setTask((newTask ?? null) as TaskRow | null);
      setAssignedOperativeLabel('');
      setSelectedOperativeId('');
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to unassign');
    } finally {
      setAssigning(false);
      setAssigningAction(null);
    }
  };

  const handleAssignOperative = async () => {
    if (!id) return;
    if (operatives.length === 0) {
      alert('No operatives found')
      return
    }
    if (!selectedOperativeId) {
      alert('Please select an operative first.')
      return
    }
    setAssigningAction('assign_operative');
    setAssigning(true);
    try {
      const { error: updateErr } = await supabase
        .from('tasks')
        .update({ assigned_to: selectedOperativeId })
        .eq('id', id);
      if (updateErr) throw updateErr;

      const { data: newTask } = await supabase.from('tasks').select('*').eq('id', id).single();
      const nextTask = (newTask ?? null) as TaskRow | null;
      setTask(nextTask);

      const chosen = operatives.find((o) => o.id === selectedOperativeId);
      setAssignedOperativeLabel(chosen?.label || selectedOperativeId);

      // Notify the operative they were assigned.
      notifyUsers({
        userIds: [selectedOperativeId],
        title: 'Job assigned to you',
        body: `You have been assigned: ${nextTask?.title ?? 'a job'}`,
        link: `/task/${id}`,
        type: 'task_assigned',
      });
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to assign');
    } finally {
      setAssigning(false);
      setAssigningAction(null);
    }
  };

  const handleAdminAssignToMe = async () => {
    if (!id || !currentUserId) return;
    if (task?.assigned_to && task.assigned_to !== currentUserId) {
      const ok = window.confirm('This job is currently assigned to someone else. Reassign to you?');
      if (!ok) return;
    }
    setAssigningAction('assign_me');
    setAssigning(true);
    try {
      const { error: updateErr } = await supabase
        .from('tasks')
        .update({ assigned_to: currentUserId })
        .eq('id', id);
      if (updateErr) throw updateErr;

      const { data: newTask } = await supabase.from('tasks').select('*').eq('id', id).single();
      const nextTask = (newTask ?? null) as TaskRow | null;
      setTask(nextTask);
      setSelectedOperativeId(currentUserId);
      setAssignedOperativeLabel('You');

      notifyUsers({
        userIds: [currentUserId],
        title: 'Job assigned to you',
        body: `You were assigned: ${nextTask?.title ?? 'a job'}`,
        link: `/task/${id}`,
        type: 'task_assigned',
      });
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to assign');
    } finally {
      setAssigning(false);
      setAssigningAction(null);
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
      const nextTask = (newTask ?? null) as TaskRow | null;
      setTask(nextTask);
      setSelectedOperativeId(user.id);
      setAssignedOperativeLabel('You');

      notifyUsers({
        userIds: [user.id],
        title: 'Job assigned to you',
        body: `You claimed: ${nextTask?.title ?? 'a job'}`,
        link: `/task/${id}`,
        type: 'task_assigned',
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to assign job';
      const details = (typeof e === 'object' && e && 'details' in e) ? String((e as { details?: unknown }).details ?? '') : '';
      alert(`${msg}${details ? `\n\n${details}` : ''}`);
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
      const assignedTo = task?.assigned_to ?? null;
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
      setComments(((commentsData || []) as CommentRow[]));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert('Failed to send message: ' + msg);
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
      const filePath = `${id}/${fileName}`;
      const { error: uploadError } = await supabase.storage.from('task-files').upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data: publicUrlData } = supabase.storage.from('task-files').getPublicUrl(filePath);
      const publicUrl = publicUrlData.publicUrl;
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) throw new Error('Not logged in');
      await supabase.from('task_comments').insert([
        { task_id: id, user_id: user.id, user_name: user.email, content: publicUrl }
      ]);
      const { data: commentsData } = await supabase.from('task_comments').select('*').eq('task_id', id).order('created_at', { ascending: true });
      setComments(((commentsData || []) as CommentRow[]));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert('Upload failed: ' + msg);
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="page p-6">
      <div className="max-w-4xl mx-auto">
        <button
          type="button"
          className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-4"
          onClick={() => navigate('/dashboard')}
        >
          <ChevronLeft size={18} />
          Back to Dashboard
        </button>
        <div className="bg-white border border-slate-200 rounded-3xl shadow-sm p-6 sm:p-8">
          {loading ? (
            <div className="text-slate-500 text-lg text-center">Loading task details...</div>
          ) : error ? (
            <div className="text-red-700 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
          ) : !task ? (
            <div className="text-slate-500 text-lg text-center">Task not found.</div>
          ) : (
            <>
              <div className="mb-8">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      {!editTask ? (
                        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 break-words">{task.title}</h2>
                      ) : (
                        <input
                          className="input min-h-[44px] text-slate-950 font-semibold text-lg sm:text-xl w-full sm:w-[420px]"
                          value={taskEditDraft.title}
                          onChange={(e) => setTaskEditDraft((p) => ({ ...p, title: e.target.value }))}
                          disabled={savingTaskEdits}
                          aria-label="Task title"
                        />
                      )}
                      <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${statusBadgeClass(task.status)}`}>
                        {task.status || 'Open'}
                      </span>
                      {userRole === 'admin' && !editTask && (
                        <button
                          type="button"
                          className="btn-secondary rounded-full px-3 py-2.5 min-h-[44px] inline-flex items-center gap-2"
                          onClick={startEditTask}
                          title="Edit task"
                        >
                          <Pencil size={16} />
                          Edit
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="hidden sm:flex">
                    {editTask ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="btn-primary min-h-[44px] inline-flex items-center gap-2"
                          onClick={saveTaskEdits}
                          disabled={savingTaskEdits}
                        >
                          <Save size={18} />
                          {savingTaskEdits ? 'Saving…' : 'Save'}
                        </button>
                        <button type="button" className="btn-secondary min-h-[44px] inline-flex items-center gap-2" onClick={cancelEditTask} disabled={savingTaskEdits}>
                          <X size={18} />
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button type="button" onClick={generatePDF} className="btn-secondary min-h-[44px]">
                        Download PDF
                      </button>
                    )}
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 mb-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs font-bold tracking-widest text-slate-500">LOCATION</div>
                      {!editTask ? (
                        <div className="mt-1 text-slate-950 font-semibold break-words">{task.location || task.site || '—'}</div>
                      ) : (
                        <input
                          className="input mt-2 min-h-[44px]"
                          value={taskEditDraft.location}
                          onChange={(e) => setTaskEditDraft((p) => ({ ...p, location: e.target.value }))}
                          disabled={savingTaskEdits}
                          placeholder="Address / location"
                        />
                      )}

                      {(task.location || task.site) ? (
                        <a
                          href={mapsHrefAddress(task.location || task.site || '')}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center gap-2 text-purple-700 hover:text-purple-800 font-semibold"
                          title="Get directions"
                        >
                          <MapPin size={16} />
                          Get Directions
                        </a>
                      ) : null}
                      {task.postcode?.trim() ? (
                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          <a
                            href={mapsHref(task.postcode)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-purple-700 hover:text-purple-800 font-semibold underline underline-offset-4"
                          >
                            <Navigation size={16} />
                            {task.postcode}
                          </a>
                          <a
                            href={mapsHref(task.postcode)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-secondary rounded-full px-4 py-2.5 min-h-[44px] inline-flex items-center gap-2"
                          >
                            <Navigation size={18} />
                            Get Directions
                          </a>
                        </div>
                      ) : null}
                    </div>

                    <div>
                      <div className="text-xs font-bold tracking-widest text-slate-500">ASSIGNED TO</div>
                      <div className="mt-1 text-slate-950 font-semibold">{assignedToLabel}</div>
                    </div>

                    <div>
                      <div className="text-xs font-bold tracking-widest text-slate-500">CATEGORY</div>
                      {!editTask ? (
                        <div className="mt-1 text-slate-950 font-semibold">{task.category || '—'}</div>
                      ) : (
                        <select
                          className="input mt-2 min-h-[44px]"
                          value={taskEditDraft.category}
                          onChange={(e) => setTaskEditDraft((p) => ({ ...p, category: e.target.value }))}
                          disabled={savingTaskEdits}
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
                      )}
                    </div>

                    <div>
                      <div className="text-xs font-bold tracking-widest text-slate-500">DUE DATE</div>
                      {!editTask ? (
                        <div className="mt-1 text-slate-950 font-semibold">
                          {task.due_date ? new Date(task.due_date).toLocaleDateString() : '—'}
                        </div>
                      ) : (
                        <input
                          type="date"
                          className="input mt-2 min-h-[44px]"
                          value={taskEditDraft.due_date}
                          onChange={(e) => setTaskEditDraft((p) => ({ ...p, due_date: e.target.value }))}
                          disabled={savingTaskEdits}
                        />
                      )}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs font-bold tracking-widest text-slate-500">STATUS</div>
                      <select
                        className="input mt-2 min-h-[44px]"
                        value={task.status || 'Open'}
                        onChange={(e) => updateStatus(e.target.value as TaskStatus)}
                        disabled={updatingStatus}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div className="text-xs font-bold tracking-widest text-slate-500">COMPLETION %</div>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-slate-950">{progress}%</div>
                        <div className="text-xs text-slate-500">{savingProgress ? 'Saving…' : ''}</div>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={progress}
                        onChange={(e) => setProgress(Number(e.target.value))}
                        onMouseUp={() => saveProgress(progress)}
                        onTouchEnd={() => saveProgress(progress)}
                        className="mt-2 w-full"
                        disabled={savingProgress}
                      />
                    </div>
                  </div>
                </div>
                {/* Assignment section (admin) */}
                {userRole === 'admin' && (
                  <div className="mb-6 bg-slate-50 border border-slate-200 rounded-2xl p-5">
                    <div className="text-sm font-semibold text-slate-950">Assignment</div>
                    {operatives.length === 0 ? (
                      <div className="mt-2 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
                        No operatives found
                      </div>
                    ) : null}

                    <div className="relative z-50 flex flex-col lg:flex-row lg:items-center gap-3 mt-4">
                      <select
                        className="input w-full lg:flex-1 min-h-[44px]"
                        value={selectedOperativeId}
                        onChange={(e) => setSelectedOperativeId(e.target.value)}
                        disabled={assigning}
                      >
                        <option value="">{operatives.length === 0 ? 'No operatives found' : 'Select an operative…'}</option>
                        {operatives.map((o) => (
                          <option key={o.id} value={o.id}>{o.label}</option>
                        ))}
                      </select>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full lg:w-auto">
                        <button
                          type="button"
                          className="btn-primary w-full min-h-[44px] inline-flex items-center justify-center gap-2"
                          onClick={handleAssignOperative}
                          disabled={assigning || !selectedOperativeId || operatives.length === 0}
                        >
                          {assigning && assigningAction === 'assign_operative' ? (
                            <>
                              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                              </svg>
                              Saving…
                            </>
                          ) : (
                            'Assign operative'
                          )}
                        </button>
                        <button
                          type="button"
                          className="btn-primary w-full min-h-[44px] inline-flex items-center justify-center gap-2"
                          onClick={handleAdminAssignToMe}
                          disabled={assigning || !currentUserId}
                        >
                          {assigning && assigningAction === 'assign_me' ? (
                            <>
                              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                              </svg>
                              Saving…
                            </>
                          ) : (
                            'Assign to me'
                          )}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary w-full min-h-[44px] inline-flex items-center justify-center gap-2"
                          onClick={handleUnassign}
                          disabled={assigning || !task.assigned_to}
                        >
                          {assigning && assigningAction === 'unassign' ? (
                            <>
                              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                              </svg>
                              Saving…
                            </>
                          ) : (
                            'Unassign'
                          )}
                        </button>
                      </div>
                    </div>
                    {task.assigned_to && (
                      <div className="text-slate-600 mt-2 text-sm">
                        Assigned to: <span className="font-semibold text-slate-800">{assignedToLabel}</span>
                      </div>
                    )}
                  </div>
                )}
                <div className="mt-6">
                  <h3 className="section-title">Notes</h3>
                  {String(task.category ?? '').toLowerCase().trim() === 'domestic' && (
                    <div className="mt-3 bg-sky-50 border border-sky-200 text-sky-900 rounded-2xl p-4 shadow-sm">
                      <div className="font-semibold">Customer appointment required</div>
                      <div className="text-sm text-sky-900/90 mt-1">
                        Please contact the customer in advance to confirm availability and ensure access can be provided.
                      </div>
                    </div>
                  )}
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
                <div className="flex items-center justify-between gap-3">
                  <div className="text-lg font-semibold text-slate-950">Job Photos</div>
                  <button
                    type="button"
                    className="btn-secondary rounded-full px-4 py-2.5 min-h-[44px] inline-flex items-center gap-2"
                    onClick={() => galleryInputRef.current?.click()}
                    disabled={uploadingGallery}
                  >
                    <Plus size={18} />
                    {uploadingGallery ? 'Uploading…' : 'Add photo'}
                  </button>
                  <input
                    ref={galleryInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (!f) return
                      uploadGalleryPhoto(f)
                    }}
                    disabled={uploadingGallery}
                  />
                </div>

                {galleryUrls.length === 0 ? (
                  <div className="mt-3 text-slate-500">No photos yet.</div>
                ) : (
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {galleryUrls.map((u) => (
                      <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="block">
                        <img src={u} alt="job" className="h-28 w-full object-cover rounded-2xl border border-slate-200 shadow-sm" />
                      </a>
                    ))}
                  </div>
                )}

                <div className="mt-8 text-lg font-semibold text-slate-950">Job Updates</div>
                <div className="mt-3 bg-slate-50 border border-slate-200 rounded-2xl p-4 max-h-[420px] overflow-y-auto">
                  {comments.length === 0 ? (
                    <div className="text-slate-400 text-center italic py-10">No updates yet.</div>
                  ) : (
                    <ul className="space-y-3">
                      {comments.map((c) => {
                        const mine = Boolean(currentUserId && c.user_id === currentUserId)
                        const content = (c.content ?? '').trim()
                        const isImage =
                          content.startsWith('http') &&
                          (content.includes('/storage/v1/object/public/task-files/') || /\.(jpeg|jpg|png|gif|webp)$/i.test(content))
                        return (
                          <li key={c.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] sm:max-w-[70%] ${mine ? 'text-right' : 'text-left'}`}>
                              <div
                                className={`inline-block rounded-2xl px-4 py-3 shadow-sm border ${
                                  mine ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-slate-900 border-slate-200'
                                }`}
                              >
                                {isImage ? (
                                  <a href={content} target="_blank" rel="noopener noreferrer">
                                    <img src={content} alt="uploaded" className="max-h-56 rounded-xl border border-white/20" />
                                  </a>
                                ) : (
                                  <div className="whitespace-pre-line text-sm leading-relaxed">{content}</div>
                                )}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">{c.created_at ? new Date(c.created_at).toLocaleString() : ''}</div>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>

                <form onSubmit={handleSendMessage} className="mt-3 flex items-end gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      className="input w-full pr-12 min-h-[44px]"
                      placeholder="Message…"
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      disabled={sending || uploading}
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-900 p-2 rounded-lg"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      title="Quick photo update"
                    >
                      <Camera size={18} />
                    </button>
                  </div>
                  <button type="submit" className="btn-primary min-h-[44px]" disabled={sending || !newComment.trim() || uploading}>
                    {sending ? 'Sending…' : 'Send'}
                  </button>
                  <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleFileUpload} disabled={uploading} />
                </form>

                {userRole === 'admin' && (
                  <div className="mt-10 border-t border-slate-200 pt-6">
                    <div className="text-sm font-semibold text-slate-950">Danger Zone</div>
                    <div className="text-sm text-slate-600 mt-1">Delete is only available for Open jobs.</div>
                  {editTask ? (
                    <div className="mt-3 flex flex-col sm:flex-row gap-2">
                      <button
                        type="button"
                        className="btn-primary min-h-[44px] inline-flex items-center gap-2"
                        onClick={saveTaskEdits}
                        disabled={savingTaskEdits}
                      >
                        <Save size={18} />
                        {savingTaskEdits ? 'Saving…' : 'Save changes'}
                      </button>
                      <button type="button" className="btn-secondary min-h-[44px] inline-flex items-center gap-2" onClick={cancelEditTask} disabled={savingTaskEdits}>
                        <X size={18} />
                        Cancel
                      </button>
                    </div>
                  ) : null}
                    <button
                      type="button"
                      className="mt-3 inline-flex items-center gap-2 text-red-700 hover:text-red-800 font-semibold min-h-[44px]"
                      onClick={deleteOpenJob}
                      disabled={deleting || (task.status ?? 'Open') !== 'Open'}
                    >
                      <Trash2 size={18} />
                      {deleting ? 'Deleting…' : 'Delete task'}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
export default TaskDetails;