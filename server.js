const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const DEAL_AMOUNT = 9000;
const DATA_FILE = path.join(__dirname, 'data', 'deals.json');

app.use(cors());
app.use(express.json());

function ensureDataDir() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadDeals() {
  ensureDataDir();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

function saveDeals(deals) {
  ensureDataDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(deals, null, 2), 'utf8');
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function startOfMonth(d) {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function getSumData(deals) {
  const now = new Date();
  const todayStart = startOfDay(now);
  const monthStart = startOfMonth(now);
  const prevMonthStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const yesterdayStart = startOfDay(now.getTime() - 86400000);

  let total = 0, monthSum = 0, daySum = 0, prevMonthSum = 0, yesterdaySum = 0;

  for (const d of deals) {
    const amt = d.amount || DEAL_AMOUNT;
    const t = new Date(d.date).getTime();
    total += amt;
    if (t >= monthStart) monthSum += amt;
    if (t >= todayStart) daySum += amt;
    if (t >= prevMonthStart && t < monthStart) prevMonthSum += amt;
    if (t >= yesterdayStart && t < todayStart) yesterdaySum += amt;
  }

  return {
    total,
    month: monthSum,
    day: daySum,
    trendMonth: monthSum - prevMonthSum,
    trendDay: daySum - yesterdaySum,
    trendAll: total
  };
}

app.get('/api/sum', (req, res) => {
  res.json(getSumData(loadDeals()));
});

app.get('/api/deals', (req, res) => {
  res.json(loadDeals());
});

app.post('/api/deals', (req, res) => {
  const username = String(req.body.username || '').trim().replace(/^@/, '') || 'user';
  const deals = loadDeals();
  deals.unshift({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2),
    username: username.startsWith('@') ? username : '@' + username,
    amount: DEAL_AMOUNT,
    date: new Date().toISOString()
  });
  saveDeals(deals);
  res.json({ ok: true, deals });
});

app.listen(PORT, () => {
  console.log('GOLDEN TRAFF:', 'http://localhost:' + PORT);
});
