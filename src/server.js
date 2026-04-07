'use strict';
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');

const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');
const i18nRoutes = require('./routes/i18n');
const { requireAuth } = require('./middleware/auth');
const { ensureDataDirs } = require('./utils/storage');

const app = express();
const PORT = process.env.PORT || 8000;

// ── Boot: ensure data dirs & default admin ──────────────────────────────────
ensureDataDirs();

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── Routes ──────────────────────────────────────────────────────────────────
app.use('/auth', authRoutes);
app.use('/i18n', i18nRoutes);          // public – no auth needed
app.use('/api', requireAuth, apiRoutes);
app.use('/admin', requireAuth, adminRoutes);

// ── SPA catch-all: serve index.html for all non-API routes ─────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ OpenFlashcards running on http://localhost:${PORT}`);
});
