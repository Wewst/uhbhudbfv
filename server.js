// Загрузка переменных окружения из .env файла (для локальной разработки)
if (process.env.NODE_ENV !== 'production') {
  try {
    require('dotenv').config();
  } catch (e) {
    // dotenv не установлен, это нормально для продакшена
  }
}

// Принудительно используем IPv4 для всех DNS запросов (важно для Render)
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const DEAL_AMOUNT = 9500;

// Подключение к PostgreSQL
// Принудительно используем IPv4 адрес вместо доменного имени
const dbUrl = process.env.DATABASE_URL;

// Функция для парсинга connection string и получения IPv4 адреса
async function getConnectionConfig(url) {
  if (!url) return null;
  
  try {
    const urlObj = new URL(url);
    let hostname = urlObj.hostname;
    
    // Если это уже IPv4 адрес, используем параметры подключения напрямую
    if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      return {
        host: hostname,
        port: parseInt(urlObj.port) || 5432,
        database: urlObj.pathname.slice(1) || 'postgres',
        user: urlObj.username || 'postgres',
        password: urlObj.password,
        ssl: { rejectUnauthorized: false, require: true }
      };
    }
    
    // Автоматически преобразуем обычный Supabase URL в Session Pooler URL (IPv4 совместимый)
    // Если hostname начинается с db.xxx.supabase.co, преобразуем в pooler
    if (hostname.includes('db.') && hostname.includes('.supabase.co')) {
      const projectRef = hostname.match(/db\.([^.]+)\.supabase\.co/);
      if (projectRef && projectRef[1]) {
        // Session Pooler для IPv4 (порт 5432)
        const poolerHostname = `aws-0-${projectRef[1]}.pooler.supabase.com`;
        const poolerUser = `${urlObj.username || 'postgres'}.${projectRef[1]}`;
        
        console.log(`🔄 Обнаружен Supabase URL - преобразуем в Session Pooler (IPv4)`);
        console.log(`   Оригинальный: ${hostname}`);
        console.log(`   Pooler: ${poolerHostname}`);
        console.log(`   User: ${poolerUser}`);
        
        // Пробуем резолвить pooler в IPv4
        return new Promise((resolve) => {
          dns.lookup(poolerHostname, { family: 4, all: false }, (err, address) => {
            if (!err && address) {
              console.log(`✅ DNS резолв Session Pooler: ${poolerHostname} -> ${address} (IPv4)`);
              resolve({
                host: address,
                port: 5432, // Session Pooler использует порт 5432 для IPv4
                database: urlObj.pathname.slice(1) || 'postgres',
                user: poolerUser, // Важно: user должен быть postgres.PROJECT_REF
                password: urlObj.password,
                ssl: { rejectUnauthorized: false, require: true }
              });
            } else {
              console.error(`❌ Ошибка DNS lookup для pooler: ${err ? err.message : 'unknown'}`);
              console.log(`⚠️ Пробуем использовать pooler hostname напрямую...`);
              // Если не удалось резолвить, используем pooler hostname напрямую
              resolve({
                host: poolerHostname,
                port: 5432,
                database: urlObj.pathname.slice(1) || 'postgres',
                user: poolerUser,
                password: urlObj.password,
                ssl: { rejectUnauthorized: false, require: true }
              });
            }
          });
        });
      }
    }
    
    // Резолвим доменное имя в IPv4 адрес
    return new Promise((resolve) => {
      dns.lookup(hostname, { family: 4, all: false }, (err, address) => {
        if (err) {
          console.error('❌ Ошибка DNS lookup:', err.message);
          console.error('⚠️ Пытаемся использовать доменное имя напрямую...');
          // Если не удалось резолвить, используем параметры подключения с доменным именем
          resolve({
            host: hostname,
            port: parseInt(urlObj.port) || 5432,
            database: urlObj.pathname.slice(1) || 'postgres',
            user: urlObj.username || 'postgres',
            password: urlObj.password,
            ssl: { rejectUnauthorized: false, require: true }
          });
          return;
        }
        
        console.log(`✅ DNS резолв: ${hostname} -> ${address} (IPv4)`);
        
        // Используем параметры подключения с IPv4 адресом
        resolve({
          host: address,
          port: parseInt(urlObj.port) || 5432,
          database: urlObj.pathname.slice(1) || 'postgres',
          user: urlObj.username || 'postgres',
          password: urlObj.password,
          ssl: { rejectUnauthorized: false, require: true }
        });
      });
    });
  } catch (e) {
    console.error('❌ Ошибка парсинга URL:', e.message);
    // В случае ошибки пытаемся использовать connectionString
    return {
      connectionString: url,
      ssl: { rejectUnauthorized: false, require: true }
    };
  }
}

// Создаем pool с конфигурацией (будет установлена в initDatabase)
let pool = null;

// Инициализация базы данных (создание таблицы если её нет)
async function initDatabase() {
  try {
    // Проверка наличия DATABASE_URL
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL не установлена! Проверьте переменные окружения в Render.');
    }
    
    // Проверка формата строки подключения
    const dbUrl = process.env.DATABASE_URL;
    console.log('Проверка строки подключения...');
    console.log('URL (без пароля):', dbUrl ? dbUrl.replace(/:[^:@]+@/, ':****@') : 'НЕ УСТАНОВЛЕНА!');
    
    if (!dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://')) {
      throw new Error('DATABASE_URL должна начинаться с postgresql:// или postgres://');
    }
    
    // Проверка на IPv6 адрес в строке
    if (dbUrl.includes('2a05:') || dbUrl.match(/\[.*:.*\]/) || dbUrl.match(/[0-9a-f]{4}:[0-9a-f]{4}:/i)) {
      console.error('❌ ОШИБКА: Обнаружен IPv6 адрес в строке подключения!');
      console.error('❌ Нужно использовать доменное имя db.xxxxx.supabase.co вместо IP адреса!');
      throw new Error('Используется IPv6 адрес вместо доменного имени. Обновите DATABASE_URL в Render.');
    }
    
    // Получаем конфигурацию подключения с IPv4 адресом
    console.log('Резолв доменного имени в IPv4 адрес...');
    const connectionConfig = await getConnectionConfig(dbUrl);
    
    // Создаем pool с правильной конфигурацией
    pool = new Pool({
      ...connectionConfig,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000
    });
    
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
