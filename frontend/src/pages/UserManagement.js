import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Plus, KeyRound, Trash2, Edit, Save, X } from 'lucide-react';
import api from '../services/api';

const ROLES = ['Administrator', 'Manager', 'Sales Manager', 'Quality Manager', 'Production Manager', 'User'];

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [newPwd, setNewPwd] = useState('');
  const [form, setForm] = useState({ username: '', password: '', name: '', email: '', role: 'User' });

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const r = await api.get('/auth/users');
      setUsers(r.data || []);
    } catch (e) {
      const msg = e?.response?.data?.detail || e.message;
      if (e?.response?.status === 403) alert('Admin access required to view this page.');
      else alert('Failed to load users: ' + msg);
    } finally { setLoading(false); }
  };

  const addUser = async () => {
    if (!form.username || !form.password) return alert('Username and password are required');
    if (form.password.length < 6) return alert('Password must be at least 6 characters');
    try {
      await api.post('/auth/users', form);
      setForm({ username: '', password: '', name: '', email: '', role: 'User' });
      setAdding(false); fetchUsers();
    } catch (e) { alert('Create failed: ' + (e?.response?.data?.detail || e.message)); }
  };

  const saveEdit = async () => {
    try {
      await api.patch(`/auth/users/${editingUser.username}`, {
        name: editingUser.name, email: editingUser.email, role: editingUser.role,
      });
      setEditingUser(null); fetchUsers();
    } catch (e) { alert('Update failed: ' + (e?.response?.data?.detail || e.message)); }
  };

  const submitReset = async () => {
    if (!newPwd || newPwd.length < 6) return alert('Password must be at least 6 characters');
    try {
      await api.post(`/auth/users/${resetTarget.username}/reset-password`, { new_password: newPwd });
      const tmpUser = resetTarget.username;
      const tmpPwd = newPwd;
      setResetTarget(null); setNewPwd('');
      alert(`✅ Password reset for ${tmpUser}\n\nNew password: ${tmpPwd}\n\nPlease share this with the user securely.`);
    } catch (e) { alert('Reset failed: ' + (e?.response?.data?.detail || e.message)); }
  };

  const removeUser = async (u) => {
    if (!window.confirm(`Permanently delete user "${u.username}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/auth/users/${u.username}`);
      fetchUsers();
    } catch (e) { alert('Delete failed: ' + (e?.response?.data?.detail || e.message)); }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6" data-testid="user-management-page">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">User Management</h1>
          <p className="text-gray-600 text-sm mt-1">Login accounts that can access this system. Admin-only.</p>
        </div>
        <Button onClick={() => setAdding(true)} data-testid="user-add"><Plus className="w-4 h-4 mr-1" /> Add User</Button>
      </div>

      {adding && (
        <Card data-testid="user-add-form"><CardHeader className="pb-2"><CardTitle className="text-base">New User</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><Label>Username *</Label><Input value={form.username} onChange={e => setForm({...form, username: e.target.value})} data-testid="user-new-username" placeholder="e.g. johnt" /></div>
            <div><Label>Password *</Label><Input value={form.password} onChange={e => setForm({...form, password: e.target.value})} data-testid="user-new-password" placeholder="min 6 chars" /></div>
            <div><Label>Full Name</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
            <div><Label>Email</Label><Input value={form.email} onChange={e => setForm({...form, email: e.target.value})} /></div>
            <div><Label>Role</Label>
              <select className="w-full border rounded h-9 px-2" value={form.role} onChange={e => setForm({...form, role: e.target.value})} data-testid="user-new-role">
                {ROLES.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div className="md:col-span-2 flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setAdding(false); setForm({ username: '', password: '', name: '', email: '', role: 'User' }); }}><X className="w-4 h-4 mr-1" /> Cancel</Button>
              <Button onClick={addUser} data-testid="user-new-save"><Save className="w-4 h-4 mr-1" /> Create</Button>
            </div>
          </CardContent></Card>
      )}

      {resetTarget && (
        <Card className="border-amber-400 bg-amber-50" data-testid="user-reset-card"><CardHeader className="pb-2"><CardTitle className="text-base">Reset password for {resetTarget.username}</CardTitle></CardHeader>
          <CardContent className="flex gap-2 items-end flex-wrap">
            <div className="flex-1 min-w-[200px]"><Label>New Password (min 6 chars)</Label><Input value={newPwd} onChange={e => setNewPwd(e.target.value)} data-testid="user-reset-input" autoFocus /></div>
            <Button onClick={submitReset} data-testid="user-reset-confirm"><KeyRound className="w-4 h-4 mr-1" /> Set Password</Button>
            <Button variant="outline" onClick={() => { setResetTarget(null); setNewPwd(''); }}>Cancel</Button>
          </CardContent></Card>
      )}

      <Card>
        <CardHeader className="pb-3"><CardTitle>{users.length} user{users.length === 1 ? '' : 's'}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50"><tr>
              <th className="text-left p-2 border">Username</th>
              <th className="text-left p-2 border">Name</th>
              <th className="text-left p-2 border">Email</th>
              <th className="text-left p-2 border">Role</th>
              <th className="text-left p-2 border w-56">Actions</th>
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={5} className="text-center text-gray-500 py-6">Loading…</td></tr>}
              {!loading && users.length === 0 && <tr><td colSpan={5} className="text-center text-gray-500 py-6">No users.</td></tr>}
              {users.map(u => {
                const isEditing = editingUser && editingUser.username === u.username;
                return (
                  <tr key={u.username} className="hover:bg-gray-50">
                    <td className="p-2 border font-mono font-bold">{u.username}</td>
                    <td className="p-2 border">
                      {isEditing ? <Input value={editingUser.name || ''} onChange={e => setEditingUser({...editingUser, name: e.target.value})} className="h-8" /> : (u.name || '')}
                    </td>
                    <td className="p-2 border">
                      {isEditing ? <Input value={editingUser.email || ''} onChange={e => setEditingUser({...editingUser, email: e.target.value})} className="h-8" /> : (u.email || '')}
                    </td>
                    <td className="p-2 border">
                      {isEditing ? (
                        <select className="border rounded h-8 px-2 w-full" value={editingUser.role || ''} onChange={e => setEditingUser({...editingUser, role: e.target.value})}>
                          {ROLES.map(r => <option key={r}>{r}</option>)}
                        </select>
                      ) : <span className="px-2 py-0.5 bg-gray-100 rounded text-xs font-semibold">{u.role}</span>}
                    </td>
                    <td className="p-2 border whitespace-nowrap">
                      {isEditing ? (
                        <>
                          <Button size="sm" onClick={saveEdit} className="mr-1" data-testid={`user-save-${u.username}`}><Save className="w-3.5 h-3.5" /></Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingUser(null)}><X className="w-3.5 h-3.5" /></Button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => setEditingUser({...u})} className="text-blue-600 hover:underline mr-3 inline-flex items-center gap-1 text-xs" data-testid={`user-edit-${u.username}`}><Edit className="w-3.5 h-3.5" /> Edit</button>
                          <button onClick={() => { setResetTarget(u); setNewPwd(''); }} className="text-amber-700 hover:underline mr-3 inline-flex items-center gap-1 text-xs" data-testid={`user-reset-${u.username}`}><KeyRound className="w-3.5 h-3.5" /> Reset Pw</button>
                          <button onClick={() => removeUser(u)} className="text-red-600 hover:underline inline-flex items-center gap-1 text-xs" data-testid={`user-delete-${u.username}`}><Trash2 className="w-3.5 h-3.5" /> Delete</button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
};

export default UserManagement;
