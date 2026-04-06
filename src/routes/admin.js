'use strict';
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getUsers, saveUsers, getUserConfig, saveUserConfig } = require('../utils/storage');
const { requireAdmin } = require('../middleware/auth');

router.use(requireAdmin);

// GET /admin/users
router.get('/users', (req, res) => {
  const users = getUsers();
  const safe = Object.values(users).map(u => ({
    id: u.id, username: u.username, role: u.role, createdAt: u.createdAt
  }));
  res.json(safe);
});

// POST /admin/users  – create user
router.post('/users', (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || username.trim().length < 2)
    return res.status(400).json({ error: 'Username (min 2 chars) and password required.' });
  if (password.length < 4)
    return res.status(400).json({ error: 'Password must be at least 4 characters.' });

  const users = getUsers();
  if (Object.values(users).find(u => u.username === username.trim()))
    return res.status(409).json({ error: 'Username already taken.' });

  const id = uuidv4();
  users[id] = {
    id,
    username: username.trim(),
    passwordHash: bcrypt.hashSync(password, 10),
    role: role === 'admin' ? 'admin' : 'user',
    createdAt: new Date().toISOString()
  };
  saveUsers(users);
  res.status(201).json({ ok: true, id });
});

// PUT /admin/users/:id – reset password or change role
router.put('/users/:id', (req, res) => {
  const users = getUsers();
  const user  = users[req.params.id];
  if (!user) return res.status(404).json({ error: 'User not found.' });

  if (req.body.password) {
    if (req.body.password.length < 4)
      return res.status(400).json({ error: 'Password must be at least 4 characters.' });
    user.passwordHash = bcrypt.hashSync(req.body.password, 10);
  }
  if (req.body.role && ['admin','user'].includes(req.body.role)) {
    user.role = req.body.role;
  }
  saveUsers(users);
  res.json({ ok: true });
});

// DELETE /admin/users/:id
router.delete('/users/:id', (req, res) => {
  if (req.params.id === req.user.id)
    return res.status(400).json({ error: 'Cannot delete yourself.' });
  const users = getUsers();
  if (!users[req.params.id]) return res.status(404).json({ error: 'User not found.' });
  delete users[req.params.id];
  saveUsers(users);
  res.json({ ok: true });
});

module.exports = router;
