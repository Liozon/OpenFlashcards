'use strict';
const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const { getUserByUsername, getUserById, getUsers, saveUsers } = require('../utils/storage');
const { signToken, requireAuth } = require('../middleware/auth');

// POST /auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required.' });

  const user = getUserByUsername(username);
  if (!user || !bcrypt.compareSync(password, user.passwordHash))
    return res.status(401).json({ error: 'Invalid credentials.' });

  const token = signToken({ id: user.id, username: user.username, role: user.role });
  res
    .cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000 })
    .json({ ok: true, user: { id: user.id, username: user.username, role: user.role } });
});

// POST /auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token').json({ ok: true });
});

// GET /auth/me
router.get('/me', requireAuth, (req, res) => {
  const user = getUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ id: user.id, username: user.username, role: user.role });
});

// POST /auth/change-password
router.post('/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword || newPassword.length < 4)
    return res.status(400).json({ error: 'Invalid passwords.' });

  const users = getUsers();
  const user  = users[req.user.id];
  if (!user) return res.status(404).json({ error: 'User not found.' });

  if (!bcrypt.compareSync(currentPassword, user.passwordHash))
    return res.status(401).json({ error: 'Current password is wrong.' });

  user.passwordHash = bcrypt.hashSync(newPassword, 10);
  saveUsers(users);
  res.json({ ok: true });
});

module.exports = router;
