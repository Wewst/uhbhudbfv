// Загрузка переменных окружения из .env файла (для локальной разработки)
if (process.env.NODE_ENV !== 'production') {
  try {
    require('dotenv').config();
  } catch (e) {
    // dotenv не установлен, это нормально для продакшена
  }
}

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const DEAL_AMOUNT = 9500;

// Подключение к PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Инициализация базы данных (создание таблицы если её нет)
async function initDatabase() {
  try {
    // Проверка подключения к базе данных
    console.log('Проверка подключения к базе данных...');
    const testQuery = await pool.query('SELECT NOW()');
    console.log('✅ Подключение к базе данных успешно!', testQuery.rows[0]);
    
    // Создание таблицы
    console.log('Создание таблицы deals...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS deals (
        id VARCHAR(255) PRIMARY KEY,
        username VARCHAR(255) NOT NULL,
        amount INTEGER NOT NULL,
        date TIMESTAMP NOT NULL,
        status VARCHAR(50) DEFAULT 'pending'
      )
    `);
    console.log('✅ Таблица deals создана или уже существует');
    
    // Проверка, что таблица существует
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'deals'
      );
    `);
    console.log('Проверка таблицы:', tableCheck.rows[0].exists ? '✅ Таблица существует' : '❌ Таблица не найдена');
    
  } catch (error) {
    console.error('❌ Ошибка инициализации БД:');
    console.error('Тип ошибки:', error.name);
    console.error('Сообщение:', error.message);
    console.error('Код ошибки:', error.code);
    if (error.message.includes('password')) {
      console.error('⚠️ Проблема с паролем! Проверьте DATABASE_URL в .env файле');
    }
    if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
      console.error('⚠️ Не удается подключиться к серверу базы данных! Проверьте строку подключения');
    }
    throw error; // Пробрасываем ошибку дальше, чтобы сервер не запустился с неработающей БД
  }
}

app.use(cors());
app.use(express.json());

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

async function getSumData() {
  try {
    const result = await pool.query('SELECT * FROM deals ORDER BY date DESC');
    const deals = result.rows.map(row => ({
      id: row.id,
      username: row.username,
      amount: row.amount,
      date: row.date.toISOString(),
      status: row.status
    }));

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
      totalTax,
      totalLeads,
      totalEmployees,
      totalFinal: total - totalTax - totalLeads - totalEmployees,
      monthTax,
      monthLeads,
      monthEmployees,
      monthFinal: monthSum - monthTax - monthLeads - monthEmployees,
      dayTax,
      dayLeads,
      dayEmployees,
      dayFinal: daySum - dayTax - dayLeads - dayEmployees
    };
  } catch (error) {
    console.error('Ошибка получения данных:', error);
    return {
      total: 0, month: 0, day: 0,
      totalTax: 0, totalLeads: 0, totalEmployees: 0, totalFinal: 0,
      monthTax: 0, monthLeads: 0, monthEmployees: 0, monthFinal: 0,
      dayTax: 0, dayLeads: 0, dayEmployees: 0, dayFinal: 0
    };
  }
}

app.get('/api/sum', async (req, res) => {
  res.json(await getSumData());
});

app.get('/api/deals', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM deals ORDER BY date DESC');
    const deals = result.rows.map(row => ({
      id: row.id,
      username: row.username,
      amount: row.amount,
      date: row.date.toISOString(),
      status: row.status
    }));
    res.json(deals);
  } catch (error) {
    console.error('Ошибка получения сделок:', error);
    res.json([]);
  }
});

app.post('/api/deals', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim().replace(/^@/, '') || 'user';
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    const usernameFormatted = username.startsWith('@') ? username : '@' + username;
    
    await pool.query(
      'INSERT INTO deals (id, username, amount, date, status) VALUES ($1, $2, $3, $4, $5)',
      [id, usernameFormatted, DEAL_AMOUNT, new Date(), 'pending']
    );

    const result = await pool.query('SELECT * FROM deals ORDER BY date DESC');
    const deals = result.rows.map(row => ({
      id: row.id,
      username: row.username,
      amount: row.amount,
      date: row.date.toISOString(),
      status: row.status
    }));

    res.json({ ok: true, deals });
  } catch (error) {
    console.error('Ошибка добавления сделки:', error);
    res.status(500).json({ error: 'Ошибка добавления сделки' });
  }
});

app.patch('/api/deals/:id', async (req, res) => {
  try {
    const dealId = req.params.id;
    const { status } = req.body;
    
    if (!status || !['pending', 'success', 'failed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const result = await pool.query(
      'UPDATE deals SET status = $1 WHERE id = $2 RETURNING *',
      [status, dealId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const deal = result.rows[0];
    res.json({
      ok: true,
      deal: {
        id: deal.id,
        username: deal.username,
        amount: deal.amount,
        date: deal.date.toISOString(),
        status: deal.status
      }
    });
  } catch (error) {
    console.error('Ошибка обновления сделки:', error);
    res.status(500).json({ error: 'Ошибка обновления сделки' });
  }
});

app.delete('/api/deals/:id', async (req, res) => {
  try {
    const dealId = req.params.id;
    const result = await pool.query('DELETE FROM deals WHERE id = $1', [dealId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Ошибка удаления сделки:', error);
    res.status(500).json({ error: 'Ошибка удаления сделки' });
  }
});

// Инициализация и запуск сервера
initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log('✅ Сервер запущен успешно!');
      console.log('GOLDEN TRAFF:', 'http://localhost:' + PORT);
    });
  })
  .catch((error) => {
    console.error('❌ Не удалось запустить сервер из-за ошибки базы данных:');
    console.error(error);
    console.error('\n⚠️ Проверьте:');
    console.error('1. Файл .env существует и содержит DATABASE_URL');
    console.error('2. Строка подключения правильная (с паролем)');
    console.error('3. Интернет работает и Supabase доступен');
    process.exit(1);
  });
