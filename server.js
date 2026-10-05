const express = require('express'), http = require('http'), fs = require('fs');
const path = require('path'), crypto = require('crypto');
const { WebSocketServer } = require('ws');

const app = express(), srv = http.createServer(app);
fs.mkdirSync('uploads', { recursive: true });

app.use(express.static('public'));
app.use('/uploads', express.static('uploads')); // supports Range requests, so seeking works

// Upload: the browser streams the raw file as the request body
app.post('/upload', (req, res) => {
  const ext = String(req.query.ext || '').toLowerCase();
  if (!['mp4', 'webm', 'mov', 'm4v', 'ogv'].includes(ext)) return res.sendStatus(400);
  const name = crypto.randomBytes(8).toString('hex') + '.' + ext;
  const out = fs.createWriteStream(path.join('uploads', name));
  req.pipe(out);
  out.on('finish', () => res.json({ url: '/uploads/' + name }));
  out.on('error', () => res.sendStatus(500));
});

// Rooms: max two people; every message is relayed to the other person
const rooms = new Map();
new WebSocketServer({ server: srv }).on('connection', (ws, req) => {
  const room = new URL(req.url, 'http://x').searchParams.get('room') || '';
  const set = rooms.get(room) || new Set();
  if (set.size >= 2) { ws.send(JSON.stringify({ t: 'full' })); return ws.close(); }
  rooms.set(room, set); set.add(ws);
  set.forEach(p => p !== ws && p.send(JSON.stringify({ t: 'peer' }))); // tell the other person someone joined
  ws.on('message', d => set.forEach(p => p !== ws && p.readyState === 1 && p.send(d.toString())));
  ws.on('close', () => { set.delete(ws); if (!set.size) rooms.delete(room); });
});

srv.listen(process.env.PORT || 3000, () => console.log('Running on http://localhost:3000'));
