const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;
const DEAL_AMOUNT_ADMIN = 9500; // Сумма для админского приложения
const DEAL_AMOUNT_TEAM = 2000; // Сумма для командного приложения

// Telegram Bot настройки (жёстко прописанные данные)
const TELEGRAM_BOT_TOKEN = '7840364464:AAEuBsIUKTnWxCnTaX0jn9WUMC5c4rp2nEk';
// Группа, куда всегда отправляем сообщения
const TELEGRAM_CHAT_ID = '-5240130674';

// Путь к файлу с данными
const dataDir = path.join(__dirname, 'data');
const dealsFile = path.join(dataDir, 'deals.json');
const tasksFile = path.join(dataDir, 'tasks.json'); // Файл для заданий

// Создание папки data если её нет
function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

// Загрузка сделок из файла
function loadDeals() {
  ensureDataDir();
  if (!fs.existsSync(dealsFile)) {
    return [];
  }
  try {
    const data = fs.readFileSync(dealsFile, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Ошибка чтения файла deals.json:', error);
    return [];
  }
}

// Сохранение сделок в файл
function saveDeals(deals) {
  ensureDataDir();
  try {
    fs.writeFileSync(dealsFile, JSON.stringify(deals, null, 2), 'utf8');
  } catch (error) {
    console.error('Ошибка записи файла deals.json:', error);
    throw error;
  }
}

// Загрузка заданий из файла
function loadTasks() {
  ensureDataDir();
  if (!fs.existsSync(tasksFile)) {
    return [];
  }
  try {
    const data = fs.readFileSync(tasksFile, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Ошибка чтения файла tasks.json:', error);
    return [];
  }
}

// Сохранение заданий в файл
function saveTasks(tasks) {
  ensureDataDir();
  try {
    fs.writeFileSync(tasksFile, JSON.stringify(tasks, null, 2), 'utf8');
  } catch (error) {
    console.error('Ошибка записи файла tasks.json:', error);
    throw error;
  }
}

// Функция отправки сообщения в Telegram (возвращает message_id)
async function sendTelegramMessage(text) {
  const chatId = TELEGRAM_CHAT_ID;
  if (!chatId) {
    console.log('⚠️ TELEGRAM_CHAT_ID не установлен, сообщение не отправлено:', text);
    return null;
  }
  
  // Проверяем, что текст не пустой
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    console.log('⚠️ Текст сообщения пустой, сообщение не отправлено');
    return null;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const data = JSON.stringify({
    chat_id: chatId,
    text: text,
    parse_mode: 'HTML'
  });

  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const response = JSON.parse(responseData);
            const messageId = response.result && response.result.message_id;
            console.log('✅ Telegram сообщение отправлено:', text, 'message_id:', messageId);
            resolve(messageId);
          } catch (e) {
            console.log('✅ Telegram сообщение отправлено:', text);
            resolve(null);
          }
        } else {
          console.error('❌ Ошибка отправки Telegram сообщения:', res.statusCode, responseData);
          reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ Ошибка запроса к Telegram API:', error);
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

// Функция удаления сообщения в Telegram
async function deleteTelegramMessage(messageId) {
  const chatId = TELEGRAM_CHAT_ID;
  if (!chatId || !messageId) {
    return;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteMessage`;
  const data = JSON.stringify({
    chat_id: chatId,
    message_id: messageId
  });

  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('✅ Telegram сообщение удалено, message_id:', messageId);
          resolve(true);
        } else {
          console.error('❌ Ошибка удаления Telegram сообщения:', res.statusCode, responseData);
          resolve(false); // Не отклоняем, если не удалось удалить
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ Ошибка запроса к Telegram API:', error);
      resolve(false); // Не отклоняем, если не удалось удалить
    });

    req.write(data);
    req.end();
  });
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

// Получение данных суммы для админского приложения (с вычетами)
function getSumData() {
  try {
    const deals = loadDeals();

  const now = new Date();
  const todayStart = startOfDay(now);
  const monthStart = startOfMonth(now);

    let total = 0, monthSum = 0, daySum = 0;
    let totalTax = 0, monthTax = 0, dayTax = 0;
    let totalLeads = 0, monthLeads = 0, dayLeads = 0;
    let totalEmployees = 0, monthEmployees = 0, dayEmployees = 0;

  for (const d of deals) {
    // В админском приложении все сделки показываются как 9500₽
    const amt = DEAL_AMOUNT_ADMIN;
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

// Получение данных суммы для командного приложения (без вычетов, с персональной суммой)
function getTeamSumData(userId) {
  try {
    const deals = loadDeals();
    const now = new Date();
    const todayStart = startOfDay(now);
    const monthStart = startOfMonth(now);

    let totalAll = 0; // Общая сумма только успешных сделок (admin + team, но admin показывается как 2000)
    let totalPersonal = 0; // Персональная сумма пользователя (все статусы)
    let monthAll = 0, dayAll = 0;
    let monthPersonal = 0, dayPersonal = 0;

    for (const d of deals) {
      const t = new Date(d.date).getTime();
      let dealAmount = d.amount || (d.appType === 'admin' ? DEAL_AMOUNT_ADMIN : DEAL_AMOUNT_TEAM);
      
      // В командном приложении админские сделки показываются как 2000
      if (d.appType === 'admin') {
        dealAmount = DEAL_AMOUNT_TEAM;
      }
      
      // Общая сумма (только успешные сделки)
      if (d.status === 'success') {
        totalAll += dealAmount;
        if (t >= monthStart) monthAll += dealAmount;
        if (t >= todayStart) dayAll += dealAmount;
      }
      
      // Персональная сумма (только сделки пользователя, все статусы)
      if (userId && d.userId && String(d.userId) === String(userId)) {
        totalPersonal += dealAmount;
        if (t >= monthStart) monthPersonal += dealAmount;
        if (t >= todayStart) dayPersonal += dealAmount;
      }
    }

    return {
      totalAll,
      monthAll,
      dayAll,
      totalPersonal,
      monthPersonal,
      dayPersonal
    };
  } catch (error) {
    console.error('Ошибка получения данных команды:', error);
    return {
      totalAll: 0, monthAll: 0, dayAll: 0,
      totalPersonal: 0, monthPersonal: 0, dayPersonal: 0
    };
  }
}

// Получение турнирной таблицы (по подтвержденным сделкам)
function getLeaderboard() {
  try {
    const deals = loadDeals();
    const userStats = {};
    
    // Подсчитываем только успешные сделки
    for (const d of deals) {
      if (d.status === 'success' && d.userId) {
        const userId = String(d.userId);
        if (!userStats[userId]) {
          userStats[userId] = {
            userId: d.userId,
            username: d.createdBy || d.username || 'Неизвестный',
            avatar: d.avatar || null,
            dealsCount: 0,
            totalAmount: 0
          };
        }
        userStats[userId].dealsCount++;
        // Для турнирной таблицы считаем все сделки как 2000
        userStats[userId].totalAmount += DEAL_AMOUNT_TEAM;
      }
    }
    
    // Преобразуем в массив и сортируем по количеству сделок (затем по сумме)
    const leaderboard = Object.values(userStats).sort((a, b) => {
      if (b.dealsCount !== a.dealsCount) {
        return b.dealsCount - a.dealsCount;
      }
      return b.totalAmount - a.totalAmount;
    });
    
    return leaderboard;
  } catch (error) {
    console.error('Ошибка получения турнирной таблицы:', error);
    return [];
  }
}

app.get('/api/sum', (req, res) => {
  res.json(getSumData());
});

app.get('/api/deals', (req, res) => {
  try {
    const deals = loadDeals();
    // Сортируем по дате (новые сверху)
    deals.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json(deals);
  } catch (error) {
    console.error('Ошибка получения сделок:', error);
    res.json([]);
  }
});

app.post('/api/deals', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim().replace(/^@/, '') || 'user';
    const appType = req.body.appType || 'admin'; // 'admin' или 'team'
    const userId = req.body.userId || null; // ID пользователя Telegram
    const userAvatar = req.body.avatar || null; // Аватар пользователя
    const createdBy = req.body.createdBy || username; // Имя создателя
    
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    const usernameFormatted = username.startsWith('@') ? username : '@' + username;
    
    const dealAmount = appType === 'admin' ? DEAL_AMOUNT_ADMIN : DEAL_AMOUNT_TEAM;
    
    const deals = loadDeals();
    const newDeal = {
      id,
      username: usernameFormatted,
      amount: dealAmount,
      date: new Date().toISOString(),
      status: 'pending',
      telegramMessageId: null,
      appType: appType,
      userId: userId,
      avatar: userAvatar,
      createdBy: createdBy
    };
    
    deals.push(newDeal);
    saveDeals(deals);

    // Отправляем уведомление в Telegram и сохраняем message_id
    try {
      const messageId = await sendTelegramMessage(`Сделка создалась ${usernameFormatted}`);
      if (messageId) {
        newDeal.telegramMessageId = messageId;
        // Обновляем сделку с message_id
        const dealIndex = deals.findIndex(d => d.id === id);
        if (dealIndex !== -1) {
          deals[dealIndex].telegramMessageId = messageId;
          saveDeals(deals);
        }
      }
    } catch (error) {
      console.error('Ошибка отправки Telegram уведомления:', error);
    }

    // Возвращаем все сделки отсортированные по дате
    deals.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json({ ok: true, deals });
  } catch (error) {
    console.error('Ошибка добавления сделки:', error);
    res.status(500).json({ error: 'Ошибка добавления сделки' });
  }
});

app.patch('/api/deals/:id', async (req, res) => {
  try {
    const dealId = req.params.id;
    const { status, userId } = req.body; // userId для проверки прав
    
    if (!status || !['pending', 'success', 'failed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const deals = loadDeals();
    const dealIndex = deals.findIndex(d => d.id === dealId);

    if (dealIndex === -1) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const deal = deals[dealIndex];
    
    // Проверка прав: только создатель сделки может изменять её (кроме админского приложения)
    if (deal.appType === 'team' && userId && deal.userId && String(deal.userId) !== String(userId)) {
      return res.status(403).json({ error: 'You can only modify your own deals' });
    }
    
    const oldMessageId = deal.telegramMessageId;
    
    deals[dealIndex].status = status;
    saveDeals(deals);

    // Удаляем старое сообщение о создании сделки и отправляем новое
    try {
      if (status === 'success' || status === 'failed') {
        // Удаляем старое сообщение о создании
        if (oldMessageId) {
          await deleteTelegramMessage(oldMessageId);
        }
        
        // Отправляем новое сообщение о статусе
        const username = deal.username || 'неизвестный';
        const messageText = status === 'success' 
          ? `Сделка успешна ${username}` 
          : `Сделка провалена ${username}`;
        const newMessageId = await sendTelegramMessage(messageText);
        
        // Сохраняем новый message_id
        if (newMessageId) {
          deals[dealIndex].telegramMessageId = newMessageId;
          saveDeals(deals);
        }
      }
    } catch (error) {
      console.error('Ошибка обновления Telegram уведомления:', error);
    }

    res.json({
      ok: true,
      deal: deals[dealIndex]
    });
  } catch (error) {
    console.error('Ошибка обновления сделки:', error);
    res.status(500).json({ error: 'Ошибка обновления сделки' });
  }
});

app.delete('/api/deals/:id', async (req, res) => {
  try {
    const dealId = req.params.id;
    const { userId } = req.body; // userId для проверки прав
    
    const deals = loadDeals();
    const dealIndex = deals.findIndex(d => d.id === dealId);

    if (dealIndex === -1) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const deal = deals[dealIndex];
    
    // Проверка прав: только создатель сделки может удалять её (кроме админского приложения)
    if (deal.appType === 'team' && userId && deal.userId && String(deal.userId) !== String(userId)) {
      return res.status(403).json({ error: 'You can only delete your own deals' });
    }
    
    const username = deal.username || 'неизвестный';
    deals.splice(dealIndex, 1);
    saveDeals(deals);

    // Отправляем уведомление в Telegram
    try {
      await sendTelegramMessage(`Сделка удалена ${username}`);
    } catch (error) {
      console.error('Ошибка отправки Telegram уведомления:', error);
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Ошибка удаления сделки:', error);
    res.status(500).json({ error: 'Ошибка удаления сделки' });
  }
});

// Endpoint для пинга (чтобы Render не засыпал)
app.get('/ping', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    message: 'Server is alive' 
  });
});

// Альтернативный эндпоинт для пинга
app.get('/api/ping', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    message: 'Server is alive' 
  });
});

// ========== ENDPOINTS ДЛЯ КОМАНДНОГО ПРИЛОЖЕНИЯ ==========

// Получение суммы для командного приложения
app.get('/api/team/sum', (req, res) => {
  try {
    const userId = req.query.userId || null;
    const data = getTeamSumData(userId);
    res.json(data);
  } catch (error) {
    console.error('Ошибка получения суммы команды:', error);
    res.status(500).json({ error: 'Ошибка получения суммы' });
  }
});

// Получение сделок для командного приложения (с фильтрацией)
app.get('/api/team/deals', (req, res) => {
  try {
    const userId = req.query.userId || null;
    const filter = req.query.filter || 'all'; // 'all', 'personal'
    const deals = loadDeals();
    
    let filteredDeals = [];
    
    // Фильтруем по типу
    if (filter === 'personal' && userId) {
      // Личные: только сделки конкретного пользователя (все статусы)
      filteredDeals = deals.filter(d => d.userId && String(d.userId) === String(userId));
    } else if (filter === 'all') {
      // Общие: только успешные сделки (status === 'success')
      filteredDeals = deals.filter(d => d.status === 'success');
    }
    
    // Сортируем по дате (новые сверху)
    filteredDeals.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json(filteredDeals);
  } catch (error) {
    console.error('Ошибка получения сделок команды:', error);
    res.json([]);
  }
});

// Получение турнирной таблицы
app.get('/api/leaderboard', (req, res) => {
  try {
    const leaderboard = getLeaderboard();
    res.json(leaderboard);
  } catch (error) {
    console.error('Ошибка получения турнирной таблицы:', error);
    res.json([]);
  }
});

// Получение заданий
app.get('/api/tasks', (req, res) => {
  try {
    const tasks = loadTasks();
    // Сортируем по дате создания (новые сверху)
    tasks.sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
    res.json(tasks);
  } catch (error) {
    console.error('Ошибка получения заданий:', error);
    res.json([]);
  }
});

// Создание задания (только админ)
app.post('/api/tasks', async (req, res) => {
  try {
    const { title, description, reward, isAdmin } = req.body;
    
    // Проверка прав (только админ может создавать задания)
    // В реальном приложении здесь должна быть проверка через Telegram WebApp
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admin can create tasks' });
    }
    
    if (!title || !description || !reward) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const tasks = loadTasks();
    const newTask = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      title,
      description,
      reward: Number(reward) || 0,
      createdAt: new Date().toISOString(),
      completedBy: [] // Массив userId пользователей, выполнивших задание
    };
    
    tasks.push(newTask);
    saveTasks(tasks);
    
    res.json({ ok: true, task: newTask });
  } catch (error) {
    console.error('Ошибка создания задания:', error);
    res.status(500).json({ error: 'Ошибка создания задания' });
  }
});

// Обновление задания (отметка о выполнении)
app.patch('/api/tasks/:id', async (req, res) => {
  try {
    const taskId = req.params.id;
    const { userId, action } = req.body; // action: 'complete' или 'uncomplete'
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    const tasks = loadTasks();
    const taskIndex = tasks.findIndex(t => t.id === taskId);
    
    if (taskIndex === -1) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    const task = tasks[taskIndex];
    
    if (action === 'complete') {
      // Добавляем userId в список выполнивших, если его там нет
      if (!task.completedBy) {
        task.completedBy = [];
      }
      if (!task.completedBy.includes(String(userId))) {
        task.completedBy.push(String(userId));
      }
    } else if (action === 'uncomplete') {
      // Удаляем userId из списка
      if (task.completedBy) {
        task.completedBy = task.completedBy.filter(id => String(id) !== String(userId));
      }
    }
    
    saveTasks(tasks);
    
    res.json({ ok: true, task: tasks[taskIndex] });
  } catch (error) {
    console.error('Ошибка обновления задания:', error);
    res.status(500).json({ error: 'Ошибка обновления задания' });
  }
});

// Удаление задания (только админ)
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const taskId = req.params.id;
    const { isAdmin } = req.body;
    
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admin can delete tasks' });
    }
    
    const tasks = loadTasks();
    const taskIndex = tasks.findIndex(t => t.id === taskId);
    
    if (taskIndex === -1) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    tasks.splice(taskIndex, 1);
    saveTasks(tasks);
    
    res.json({ ok: true });
  } catch (error) {
    console.error('Ошибка удаления задания:', error);
    res.status(500).json({ error: 'Ошибка удаления задания' });
  }
});

// Запуск сервера
app.listen(PORT, () => {
  console.log('✅ Сервер запущен успешно!');
  console.log('GOLDEN TRAFF:', 'http://localhost:' + PORT);
  ensureDataDir();
  
  if (TELEGRAM_CHAT_ID) {
    console.log('✅ Telegram Chat ID установлен:', TELEGRAM_CHAT_ID);
  } else {
    console.log('⚠️ Telegram Chat ID не установлен в коде');
  }
});
