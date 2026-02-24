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

function calculateDeductions(amount) {
  const tax = Math.round(amount * 0.06); // 6% налог
  const leads = 500; // Оплата лидам
  const employees = 2000; // Выплата сотрудникам
  const totalDeductions = tax + leads + employees;
  const final = amount - totalDeductions;
  
  return {
    tax,
    leads,
    employees,
    totalDeductions,
    final
  };
}

function getSumData(deals) {
  const now = new Date();
  const todayStart = startOfDay(now);
  const monthStart = startOfMonth(now);

  let total = 0, monthSum = 0, daySum = 0;
  let totalTax = 0, monthTax = 0, dayTax = 0;
  let totalLeads = 0, monthLeads = 0, dayLeads = 0;
  let totalEmployees = 0, monthEmployees = 0, dayEmployees = 0;

  for (const d of deals) {
    const amt = d.amount || DEAL_AMOUNT;
    const t = new Date(d.date).getTime();
    const deductions = calculateDeductions(amt);
    
    total += amt;
    totalTax += deductions.tax;
    totalLeads += deductions.leads;
    totalEmployees += deductions.employees;
    
    if (t >= monthStart) {
      monthSum += amt;
      monthTax += deductions.tax;
      monthLeads += deductions.leads;
      monthEmployees += deductions.employees;
    }
    
    if (t >= todayStart) {
      daySum += amt;
      dayTax += deductions.tax;
      dayLeads += deductions.leads;
      dayEmployees += deductions.employees;
    }
  }

  return {
    total,
    month: monthSum,
    day: daySum,
    // Общий период
    totalTax,
    totalLeads,
    totalEmployees,
    totalFinal: total - totalTax - totalLeads - totalEmployees,
    // Месячный период
    monthTax,
    monthLeads,
    monthEmployees,
    monthFinal: monthSum - monthTax - monthLeads - monthEmployees,
    // Дневной период
    dayTax,
    dayLeads,
    dayEmployees,
    dayFinal: daySum - dayTax - dayLeads - dayEmployees
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
