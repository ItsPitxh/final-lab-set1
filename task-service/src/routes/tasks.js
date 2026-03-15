const express     = require('express');
const { pool }    = require('../db/db');
const requireAuth = require('../middleware/authMiddleware');

const router = express.Router();

async function logEvent({ level, event, userId, ip, method, path, statusCode, message, meta }) {
  try {
    await fetch('http://log-service:3003/api/logs/internal', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service:     'task-service',
        level,
        event,
        user_id:     userId     || null,
        ip_address:  ip         || null,
        method:      method     || null,
        path:        path       || null,
        status_code: statusCode || null,
        message:     message    || null,
        meta:        meta       || null
      })
    });
  } catch (_) {}
}

// GET /api/tasks/health  (public)
router.get('/health', (_, res) => res.json({ status: 'ok', service: 'task-service' }));

// All routes below require JWT
router.use(requireAuth);

// GET /api/tasks/
router.get('/', async (req, res) => {
  try {
    let result;
    if (req.user.role === 'admin') {
      result = await pool.query(`
        SELECT t.*, u.username FROM tasks t
        JOIN users u ON t.user_id = u.id
        ORDER BY t.created_at DESC
      `);
    } else {
      result = await pool.query(`
        SELECT t.*, u.username FROM tasks t
        JOIN users u ON t.user_id = u.id
        WHERE t.user_id = $1
        ORDER BY t.created_at DESC
      `, [req.user.sub]);
    }
    res.json({ tasks: result.rows, count: result.rowCount });
  } catch (err) {
    console.error('[TASK] GET / error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/tasks/
router.post('/', async (req, res) => {
  const { title, description, status = 'TODO', priority = 'medium' } = req.body;
  const ip = req.headers['x-real-ip'] || req.ip;

  if (!title) return res.status(400).json({ error: 'title is required' });

  try {
    const result = await pool.query(
      `INSERT INTO tasks (user_id, title, description, status, priority)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.sub, title, description, status, priority]
    );
    const task = result.rows[0];

    await logEvent({
      level: 'INFO', event: 'TASK_CREATED', userId: req.user.sub, ip,
      method: 'POST', path: '/api/tasks', statusCode: 201,
      message: `Task created: "${title}"`, meta: { task_id: task.id, title }
    });

    res.status(201).json({ task });
  } catch (err) {
    console.error('[TASK] POST / error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/tasks/:id
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT t.*, u.username FROM tasks t
       JOIN users u ON t.user_id = u.id WHERE t.id = $1`, [id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Task not found' });
    if (result.rows[0].user_id !== req.user.sub && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.json({ task: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/tasks/:id
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const ip = req.headers['x-real-ip'] || req.ip;

  try {
    const check = await pool.query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (!check.rows[0]) return res.status(404).json({ error: 'Task not found' });
    if (check.rows[0].user_id !== req.user.sub && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { title, description, status, priority } = req.body;
    const result = await pool.query(
      `UPDATE tasks
       SET title       = COALESCE($1, title),
           description = COALESCE($2, description),
           status      = COALESCE($3, status),
           priority    = COALESCE($4, priority),
           updated_at  = NOW()
       WHERE id = $5 RETURNING *`,
      [title, description, status, priority, id]
    );

    await logEvent({
      level: 'INFO', event: 'TASK_UPDATED', userId: req.user.sub, ip,
      method: 'PUT', path: `/api/tasks/${id}`, statusCode: 200,
      message: `Task ${id} updated`, meta: { task_id: parseInt(id) }
    });

    res.json({ task: result.rows[0] });
  } catch (err) {
    console.error('[TASK] PUT /:id error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/tasks/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const ip = req.headers['x-real-ip'] || req.ip;

  try {
    const check = await pool.query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (!check.rows[0]) return res.status(404).json({ error: 'Task not found' });
    if (check.rows[0].user_id !== req.user.sub && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await pool.query('DELETE FROM tasks WHERE id = $1', [id]);

    await logEvent({
      level: 'INFO', event: 'TASK_DELETED', userId: req.user.sub, ip,
      method: 'DELETE', path: `/api/tasks/${id}`, statusCode: 200,
      message: `Task ${id} deleted`, meta: { task_id: parseInt(id) }
    });

    res.json({ message: 'Task deleted' });
  } catch (err) {
    console.error('[TASK] DELETE /:id error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
