// src/routes/help.js — HelpSearchMiss write path. Mirrors the fleet's
// server-derived-identity pattern: role/userId come from req.user, never
// trusted from the client body.
'use strict';
const express = require('express');
const logger  = require('../lib/logger');
const db      = require('../lib/db');

const router = express.Router();
const str = (v) => (typeof v === 'string' ? v.trim() : '');

router.post('/', async (req, res, next) => {
  const query = str(req.body?.query).slice(0, 500);
  if (!query) return res.status(422).json({ error: 'query is required.' });
  const locale = str(req.body?.locale).slice(0, 8) || 'en-US';
  const wasFuzzyRescued = req.body?.wasFuzzyRescued === true;

  try {
    const created = await db.helpSearchMiss.create({
      data: { query, locale, role: req.user.role, wasFuzzyRescued, userId: req.user.id },
      select: { id: true, createdAt: true },
    });
    logger.info({ helpSearchMissId: created.id, query, locale, wasFuzzyRescued }, '[help] search miss recorded');
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
