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
// Группа, куда всегда отправляем сообщения (только для сделок)
const TELEGRAM_CHAT_ID = '-5240130674';
// Бот для уведомлений о первенстве
const NOTIFICATION_BOT_TOKEN = '8671998094:AAEyg-2G8cHIoTQT3gCjm1X5QiyW31D4WQo';
// ID админа для отправки уведомлений в ЛС (загружается из файла при запуске)
let ADMIN_USER_ID = null;

// Путь к файлу с данными (объявляем ПЕРЕД функциями, которые их используют)
const dataDir = path.join(__dirname, 'data');
const dealsFile = path.join(dataDir, 'deals.json');
const tasksFile = path.join(dataDir, 'tasks.json'); // Файл для заданий
const goalsFile = path.join(dataDir, 'goals.json'); // Файл для целей
const usersFile = path.join(dataDir, 'users.json'); // Файл для хранения данных пользователей (для уведомлений)
const adminIdFile = path.join(dataDir, 'adminId.json'); // Файл для хранения ID админа

// Создание папки data если её нет
function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

// Загрузка ID админа из файла
function loadAdminId() {
  ensureDataDir();
  console.log('🔍 Попытка загрузки ADMIN_USER_ID из файла:', adminIdFile);
  console.log('🔍 Файл существует?', fs.existsSync(adminIdFile));
  
  if (!fs.existsSync(adminIdFile)) {
    console.log('⚠️ Файл adminId.json не существует');
    return null;
  }
  try {
    const data = fs.readFileSync(adminIdFile, 'utf8');
    console.log('📄 Содержимое файла adminId.json:', data);
    const adminData = JSON.parse(data);
    const userId = adminData.userId || null;
    console.log('✅ ADMIN_USER_ID загружен из файла:', userId);
    return userId;
  } catch (error) {
    console.error('❌ Ошибка чтения файла adminId.json:', error);
    console.error('❌ Детали ошибки:', error.message, error.stack);
    return null;
  }
}

// Сохранение ID админа в файл
function saveAdminId(userId) {
  ensureDataDir();
  try {
    const userIdStr = String(userId);
    const data = { userId: userIdStr, savedAt: new Date().toISOString() };
    fs.writeFileSync(adminIdFile, JSON.stringify(data, null, 2), 'utf8');
    ADMIN_USER_ID = userIdStr;
    console.log('✅ ADMIN_USER_ID сохранен в файл:', ADMIN_USER_ID);
    console.log('📁 Путь к файлу:', adminIdFile);
    
    // Проверяем, что файл действительно создан
    if (fs.existsSync(adminIdFile)) {
      const fileContent = fs.readFileSync(adminIdFile, 'utf8');
      console.log('✅ Файл adminId.json создан, содержимое:', fileContent);
    } else {
      console.error('❌ Файл adminId.json не был создан!');
    }
  } catch (error) {
    console.error('❌ Ошибка записи файла adminId.json:', error);
    console.error('❌ Детали ошибки:', error.message, error.stack);
  }
}

// Загружаем ID админа при запуске
ADMIN_USER_ID = loadAdminId();
if (ADMIN_USER_ID) {
  console.log('✅ ADMIN_USER_ID загружен из файла:', ADMIN_USER_ID);
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

// Загрузка целей из файла
function loadGoals() {
  ensureDataDir();
  if (!fs.existsSync(goalsFile)) {
    return [];
  }
  try {
    const data = fs.readFileSync(goalsFile, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Ошибка чтения файла goals.json:', error);
    return [];
  }
}

// Сохранение целей в файл
function saveGoals(goals) {
  ensureDataDir();
  try {
    fs.writeFileSync(goalsFile, JSON.stringify(goals, null, 2), 'utf8');
  } catch (error) {
    console.error('Ошибка записи файла goals.json:', error);
    throw error;
  }
}

// Загрузка данных пользователей из файла
function loadUsers() {
  ensureDataDir();
  if (!fs.existsSync(usersFile)) {
    return {};
  }
  try {
    const data = fs.readFileSync(usersFile, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Ошибка чтения файла users.json:', error);
    return {};
  }
}

// Сохранение данных пользователей в файл
function saveUsers(users) {
  ensureDataDir();
  try {
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2), 'utf8');
  } catch (error) {
    console.error('Ошибка записи файла users.json:', error);
    throw error;
  }
}

// Функция отправки уведомления пользователю через бота уведомлений
// Функция отправки уведомления админу в ЛС
async function sendNotificationToAdmin(text) {
  // Перезагружаем ADMIN_USER_ID из файла на случай, если он был обновлен
  const currentAdminId = loadAdminId();
  if (currentAdminId) {
    ADMIN_USER_ID = currentAdminId;
  }
  
  if (!ADMIN_USER_ID) {
    console.log('⚠️ ADMIN_USER_ID не установлен, уведомление админу не отправлено. Текст:', text);
    console.log('💡 Подсказка: откройте админское приложение, чтобы ID админа был сохранен');
    return false;
  }
  
  console.log('📤 Отправка уведомления админу в ЛС (userId:', ADMIN_USER_ID + '):', text.substring(0, 50) + '...');
  return await sendNotificationToUser(ADMIN_USER_ID, text);
}

async function sendNotificationToUser(userId, text) {
  if (!userId) {
    console.log('⚠️ userId не указан, уведомление не отправлено');
    return false;
  }
  
  // Проверяем, что текст не пустой
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    console.log('⚠️ Текст уведомления пустой, уведомление не отправлено для userId:', userId);
    return false;
  }
  
  if (!NOTIFICATION_BOT_TOKEN) {
    console.error('❌ NOTIFICATION_BOT_TOKEN не установлен');
    return false;
  }
  
  const url = `https://api.telegram.org/bot${NOTIFICATION_BOT_TOKEN}/sendMessage`;
  const data = JSON.stringify({
    chat_id: String(userId),
    text: text.trim(),
    parse_mode: 'HTML'
  });

  console.log('📤 Попытка отправки уведомления пользователю', userId, 'через бота', NOTIFICATION_BOT_TOKEN.substring(0, 10) + '...');

  return new Promise((resolve) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data, 'utf8')
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
            if (response.ok) {
              console.log('✅ Уведомление отправлено пользователю', userId);
              resolve(true);
            } else {
              console.error('❌ Ошибка отправки уведомления (ответ не OK):', res.statusCode, responseData);
              // Если ошибка 403 или 400 - пользователь не начал диалог с ботом
              if (response.error_code === 403 || response.error_code === 400) {
                console.error('💡 Пользователь не начал диалог с ботом. Нужно сначала написать боту /start');
              }
              resolve(false);
            }
          } catch (e) {
            console.error('❌ Ошибка парсинга ответа:', responseData);
            resolve(false);
          }
        } else {
          console.error('❌ Ошибка отправки уведомления (HTTP):', res.statusCode, responseData);
          try {
            const errorResponse = JSON.parse(responseData);
            if (errorResponse.error_code === 401) {
              console.error('❌ Ошибка 401: Неверный токен бота или бот не существует');
            } else if (errorResponse.error_code === 403) {
              console.error('❌ Ошибка 403: Пользователь заблокировал бота или не начал диалог');
              console.error('💡 Решение: Пользователь должен сначала написать боту /start');
            }
          } catch (e) {}
          resolve(false);
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ Ошибка запроса к Telegram API:', error);
      resolve(false);
    });

    req.write(data);
    req.end();
  });
}

// Функция отправки сообщения в Telegram (возвращает message_id)
async function sendTelegramMessage(text) {
  const chatId = TELEGRAM_CHAT_ID;
  if (!chatId) {
    console.log('⚠️ TELEGRAM_CHAT_ID не установлен, сообщение не отправлено');
    return null;
  }
  
  // Проверяем, что текст не пустой
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    console.log('⚠️ Текст сообщения пустой, сообщение не отправлено');
    return null;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const data = JSON.stringify({
    chat_id: String(chatId),
    text: text.trim(),
    parse_mode: 'HTML'
  });

  return new Promise((resolve) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data, 'utf8')
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
            if (response.ok && response.result) {
              const messageId = response.result.message_id;
              console.log('✅ Telegram сообщение отправлено:', text.substring(0, 50) + '...', 'message_id:', messageId);
              resolve(messageId);
            } else {
              console.error('❌ Ошибка отправки Telegram сообщения:', responseData);
              resolve(null);
            }
          } catch (e) {
            console.error('❌ Ошибка парсинга ответа Telegram:', responseData);
            resolve(null);
          }
        } else {
          console.error('❌ Ошибка отправки Telegram сообщения:', res.statusCode, responseData);
          resolve(null);
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ Ошибка запроса к Telegram API:', error);
      resolve(null);
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

// Логирование всех запросов для отладки
app.use((req, res, next) => {
  if (req.path.startsWith('/api/admin/') || req.path === '/api/users') {
    console.log('📥 Запрос:', req.method, req.path);
    console.log('📥 Body:', JSON.stringify(req.body));
    console.log('📥 Query:', JSON.stringify(req.query));
  }
  next();
});

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

// Получение турнирной таблицы (по подтвержденным сделкам и заданиям)
function getLeaderboard() {
  try {
    const deals = loadDeals();
    const tasks = loadTasks();
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
            tasksCount: 0,
            totalAmount: 0
          };
        }
        userStats[userId].dealsCount++;
        // Для турнирной таблицы считаем все сделки как 2000
        userStats[userId].totalAmount += DEAL_AMOUNT_TEAM;
      }
    }
    
    // Подсчитываем подтвержденные задания
    for (const task of tasks) {
      if (task.completedBy && Array.isArray(task.completedBy)) {
        for (const userId of task.completedBy) {
          const userIdStr = String(userId);
          if (!userStats[userIdStr]) {
            // Если пользователя нет в статистике, создаем запись
            userStats[userIdStr] = {
              userId: userId,
              username: 'Пользователь',
              avatar: null,
              dealsCount: 0,
              tasksCount: 0,
              totalAmount: 0
            };
          }
          userStats[userIdStr].tasksCount++;
        }
      }
    }
    
    // Преобразуем в массив и сортируем по количеству сделок, затем заданий, затем по сумме
    const leaderboard = Object.values(userStats).sort((a, b) => {
      if (b.dealsCount !== a.dealsCount) {
        return b.dealsCount - a.dealsCount;
      }
      if (b.tasksCount !== a.tasksCount) {
        return b.tasksCount - a.tasksCount;
      }
      return b.totalAmount - a.totalAmount;
    });
    
    // Проверяем изменения в первом месте и отправляем уведомления
    checkLeaderboardChanges(leaderboard);
    
    return leaderboard;
  } catch (error) {
    console.error('Ошибка получения турнирной таблицы:', error);
    return [];
  }
}

// Проверка изменений в турнирной таблице и отправка уведомлений
let previousLeaderboard = [];
function checkLeaderboardChanges(currentLeaderboard) {
  try {
    if (previousLeaderboard.length > 0 && currentLeaderboard.length > 0) {
      const previousFirst = previousLeaderboard[0];
      const currentFirst = currentLeaderboard[0];
      
      // Если первый место изменилось
      if (previousFirst && currentFirst && String(previousFirst.userId) !== String(currentFirst.userId)) {
        // Отправляем уведомление предыдущему лидеру (персонально)
        const message = `⚠️ Вы потеряли первое место в турнирной таблице!\n\nТеперь лидер: ${currentFirst.username || 'другой пользователь'}`;
        sendNotificationToUser(previousFirst.userId, message).catch(error => {
          console.error('Ошибка отправки уведомления о потере первенства:', error);
        });
      }
    }
    
    previousLeaderboard = JSON.parse(JSON.stringify(currentLeaderboard));
  } catch (error) {
    console.error('Ошибка проверки изменений в турнирной таблице:', error);
  }
}

// Endpoint для сохранения ID админа (вызывается из админского приложения при первом запросе)
app.post('/api/admin/set-id', (req, res) => {
  try {
    console.log('📥 Получен запрос на установку ADMIN_USER_ID:', req.body);
    const { userId } = req.body;
    if (userId) {
      const userIdStr = String(userId);
      console.log('💾 Сохранение ADMIN_USER_ID:', userIdStr);
      
      // Сохраняем ID админа
      saveAdminId(userIdStr);
      
      // Перезагружаем из файла для проверки
      const loadedId = loadAdminId();
      console.log('✅ ADMIN_USER_ID успешно сохранен:', ADMIN_USER_ID);
      console.log('✅ Проверка загрузки из файла:', loadedId);
      
      // Отправляем тестовое уведомление для проверки
      sendNotificationToAdmin('✅ Ваш ID админа успешно сохранен! Теперь вы будете получать уведомления о выполненных заданиях.').then(function(sent) {
        if (sent) {
          console.log('✅ Тестовое уведомление админу отправлено успешно');
        } else {
          console.log('⚠️ Тестовое уведомление админу не отправлено (возможно, бот не запущен или пользователь не начал диалог)');
        }
      }).catch(function(err) {
        console.error('❌ Ошибка отправки тестового уведомления:', err);
      });
      
      res.json({ ok: true, adminId: ADMIN_USER_ID, loadedFromFile: loadedId, message: 'ID админа успешно сохранен' });
    } else {
      console.log('⚠️ userId не передан в запросе');
      res.status(400).json({ error: 'userId is required' });
    }
  } catch (error) {
    console.error('❌ Ошибка установки ADMIN_USER_ID:', error);
    res.status(500).json({ error: 'Ошибка установки ADMIN_USER_ID' });
  }
});

// Endpoint для проверки текущего ADMIN_USER_ID
app.get('/api/admin/check-id', (req, res) => {
  try {
    console.log('🔍 Проверка статуса ADMIN_USER_ID...');
    // Перезагружаем из файла на случай, если он был обновлен
    const loadedId = loadAdminId();
    if (loadedId) {
      ADMIN_USER_ID = loadedId;
      console.log('✅ ADMIN_USER_ID обновлен из файла:', ADMIN_USER_ID);
    }
    
    const fileExists = fs.existsSync(adminIdFile);
    console.log('📁 Файл adminId.json существует?', fileExists);
    if (fileExists) {
      try {
        const fileContent = fs.readFileSync(adminIdFile, 'utf8');
        console.log('📄 Содержимое файла:', fileContent);
      } catch (e) {
        console.error('❌ Ошибка чтения файла для проверки:', e);
      }
    }
    
    res.json({ 
      ok: true, 
      adminId: ADMIN_USER_ID,
      isSet: !!ADMIN_USER_ID,
      fileExists: fileExists,
      loadedFromFile: loadedId
    });
  } catch (error) {
    console.error('❌ Ошибка проверки ADMIN_USER_ID:', error);
    res.status(500).json({ error: 'Ошибка проверки ADMIN_USER_ID' });
  }
});

app.get('/api/sum', (req, res) => {
  // Сохраняем ID админа из запроса (если есть и еще не установлен)
  const adminId = req.query.adminId || req.headers['x-admin-id'];
  if (adminId && !ADMIN_USER_ID) {
    console.log('💾 Установка ADMIN_USER_ID через /api/sum:', adminId);
    saveAdminId(adminId);
  }
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

// Сохранение данных пользователя (для уведомлений)
app.post('/api/users', (req, res) => {
  try {
    const { userId, username, avatar } = req.body;
    console.log('📥 Получен запрос на сохранение пользователя:', { userId, username });
    
    if (!userId) {
      console.log('⚠️ userId не передан в запросе');
      return res.status(400).json({ error: 'userId is required' });
    }
    
    const users = loadUsers();
    const userIdStr = String(userId);
    users[userIdStr] = {
      userId: userIdStr,
      username: username || 'Пользователь',
      avatar: avatar || null,
      updatedAt: new Date().toISOString()
    };
    saveUsers(users);
    
    console.log('✅ Пользователь сохранен:', userIdStr, username);
    
    // Если это админ (проверяем по первому сохраненному пользователю или по специальному признаку)
    // Автоматически сохраняем ID админа, если он еще не сохранен
    if (!ADMIN_USER_ID) {
      console.log('💡 ADMIN_USER_ID не установлен, пытаемся установить из сохраненного пользователя:', userIdStr);
      saveAdminId(userIdStr);
    }
    
    res.json({ ok: true });
  } catch (error) {
    console.error('❌ Ошибка сохранения пользователя:', error);
    res.status(500).json({ error: 'Ошибка сохранения пользователя' });
  }
});

// Получение текущей цели
app.get('/api/goal', (req, res) => {
  try {
    const goals = loadGoals();
    // Получаем текущую цель (последнюю созданную)
    const currentGoal = goals.length > 0 ? goals[goals.length - 1] : null;
    res.json(currentGoal);
  } catch (error) {
    console.error('Ошибка получения цели:', error);
    res.json(null);
  }
});

// Создание еженедельной цели (только админ, можно в любой день, но нельзя менять цель на срок недели)
app.post('/api/goal', async (req, res) => {
  try {
    const { text, isAdmin } = req.body;
    
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admin can create goals' });
    }
    
    if (!text) {
      return res.status(400).json({ error: 'Goal text is required' });
    }
    
    const today = new Date();
    const goals = loadGoals();
    
    // Проверяем, не создана ли уже цель на эту неделю
    // Неделя начинается с понедельника
    const dayOfWeek = today.getDay(); // 0 = воскресенье, 1 = понедельник
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    weekStart.setHours(0, 0, 0, 0);
    
    // Проверяем, есть ли цель на эту неделю
    const existingGoal = goals.find(g => {
      const goalDate = new Date(g.createdAt);
      const goalWeekStart = new Date(goalDate);
      const goalDayOfWeek = goalDate.getDay();
      goalWeekStart.setDate(goalDate.getDate() - (goalDayOfWeek === 0 ? 6 : goalDayOfWeek - 1));
      goalWeekStart.setHours(0, 0, 0, 0);
      
      // Проверяем, что цель относится к той же неделе
      return goalWeekStart.getTime() === weekStart.getTime();
    });
    
    if (existingGoal) {
      return res.status(400).json({ error: 'Goal for this week already exists. You can create a new goal next week.' });
    }
    
    const newGoal = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      text: text,
      createdAt: new Date().toISOString(),
      weekStart: weekStart.toISOString()
    };
    
    goals.push(newGoal);
    saveGoals(goals);
    
    // Отправляем уведомление всем пользователям о новой цели
    try {
      const users = loadUsers();
      const message = `🎯 Новая еженедельная цель!\n\n${text}`;
      
      for (const userId in users) {
        if (userId && userId !== 'undefined' && userId !== 'null') {
          await sendNotificationToUser(userId, message);
        }
      }
    } catch (error) {
      console.error('Ошибка отправки уведомлений о цели:', error);
    }
    
    res.json({ ok: true, goal: newGoal });
  } catch (error) {
    console.error('Ошибка создания цели:', error);
    res.status(500).json({ error: 'Ошибка создания цели' });
  }
});

// Получение заданий (для командного приложения - только неподтвержденные)
app.get('/api/tasks', (req, res) => {
  try {
    const userId = req.query.userId || null;
    const tasks = loadTasks();
    
    // Фильтруем: показываем только задания, которые пользователь еще не подтвердил
    // или которые имеют pendingCompletions
    const filteredTasks = tasks.filter(task => {
      // Если у пользователя есть userId, проверяем, не подтверждено ли задание
      if (userId) {
        const isConfirmed = task.completedBy && task.completedBy.includes(String(userId));
        // Показываем задание, если оно не подтверждено пользователем
        return !isConfirmed;
      }
      // Если userId нет, показываем все задания
      return true;
    });
    
    // Сортируем по дате создания (новые сверху)
    filteredTasks.sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
    res.json(filteredTasks);
  } catch (error) {
    console.error('Ошибка получения заданий:', error);
    res.json([]);
  }
});

// Получение всех заданий (для админского приложения - с pendingCompletions)
app.get('/api/admin/tasks', (req, res) => {
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
      completedBy: [], // Массив userId пользователей, подтвержденных админом
      pendingCompletions: [] // Массив пользователей, ожидающих подтверждения
    };
    
    tasks.push(newTask);
    saveTasks(tasks);
    
    // Отправляем уведомление всем пользователям о новом задании
    try {
      const users = loadUsers();
      const message = `📋 Новое задание!\n\n${title}\n${description}\n\nНаграда: ${reward}₽`;
      
      // Отправляем всем пользователям, у которых есть userId
      for (const userId in users) {
        if (userId && userId !== 'undefined' && userId !== 'null') {
          await sendNotificationToUser(userId, message);
        }
      }
    } catch (error) {
      console.error('Ошибка отправки уведомлений о задании:', error);
    }
    
    res.json({ ok: true, task: newTask });
  } catch (error) {
    console.error('Ошибка создания задания:', error);
    res.status(500).json({ error: 'Ошибка создания задания' });
  }
});

// Обновление задания (отметка о выполнении пользователем - добавляет в pending)
app.patch('/api/tasks/:id', async (req, res) => {
  try {
    const taskId = req.params.id;
    const { userId, action, username, avatar } = req.body; // action: 'complete' или 'uncomplete'
    
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
      // Инициализируем pendingCompletions если его нет
      if (!task.pendingCompletions) {
        task.pendingCompletions = [];
      }
      
      // Проверяем, не добавлен ли уже пользователь
      const existing = task.pendingCompletions.find(p => String(p.userId) === String(userId));
      if (!existing) {
        task.pendingCompletions.push({
          userId: String(userId),
          username: username || 'Пользователь',
          avatar: avatar || null,
          completedAt: new Date().toISOString() // Время выполнения
        });
        
        // Мгновенно отправляем уведомление админу в ЛС о выполнении задания
        try {
          const adminMessage = `📋 Новое выполнение задания!\n\nЗадание: ${task.title}\nПользователь: ${username || 'Пользователь'}\nВремя: ${new Date().toLocaleString('ru-RU')}`;
          await sendNotificationToAdmin(adminMessage);
        } catch (error) {
          console.error('Ошибка отправки уведомления админу о выполнении задания:', error);
        }
      }
    } else if (action === 'uncomplete') {
      // Удаляем из pending
      if (task.pendingCompletions) {
        task.pendingCompletions = task.pendingCompletions.filter(p => String(p.userId) !== String(userId));
      }
      // Также удаляем из подтвержденных, если был
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

// Подтверждение выполнения задания админом
app.post('/api/tasks/:id/confirm', async (req, res) => {
  try {
    const taskId = req.params.id;
    const { userId, isAdmin } = req.body; // userId пользователя, которого подтверждаем
    
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admin can confirm tasks' });
    }
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    const tasks = loadTasks();
    const taskIndex = tasks.findIndex(t => t.id === taskId);
    
    if (taskIndex === -1) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    const task = tasks[taskIndex];
    
    // Если задание уже подтверждено для кого-то, отклоняем всех остальных
    if (task.completedBy && task.completedBy.length > 0) {
      // Задание уже имеет победителя, отклоняем всех из pending
      if (task.pendingCompletions) {
        const rejectedUsers = task.pendingCompletions.filter(p => String(p.userId) !== String(userId));
        task.pendingCompletions = [];
        
        // Отправляем уведомления отклоненным пользователям
        for (const rejected of rejectedUsers) {
          if (rejected && rejected.userId) {
            const message = `❌ Ваше выполнение задания "${task.title}" отклонено. Победитель уже определен.`;
            await sendNotificationToUser(rejected.userId, message).catch(error => {
              console.error('Ошибка отправки уведомления отклоненному пользователю:', error);
            });
          }
        }
      }
    } else {
      // Первое подтверждение - отклоняем всех остальных из pending
      if (task.pendingCompletions) {
        const rejectedUsers = task.pendingCompletions.filter(p => String(p.userId) !== String(userId));
        task.pendingCompletions = [];
        
        // Отправляем уведомления отклоненным пользователям
        for (const rejected of rejectedUsers) {
          if (rejected && rejected.userId) {
            const message = `❌ Ваше выполнение задания "${task.title}" отклонено. Победитель уже определен.`;
            await sendNotificationToUser(rejected.userId, message).catch(error => {
              console.error('Ошибка отправки уведомления отклоненному пользователю:', error);
            });
          }
        }
      }
    }
    
    // Добавляем в подтвержденные
    if (!task.completedBy) {
      task.completedBy = [];
    }
    if (!task.completedBy.includes(String(userId))) {
      task.completedBy.push(String(userId));
    }
    
    saveTasks(tasks);
    
    // Отправляем уведомление подтвержденному пользователю
    const confirmMessage = `✅ Ваше выполнение задания "${task.title}" подтверждено! Награда: ${task.reward}₽`;
    await sendNotificationToUser(userId, confirmMessage).catch(error => {
      console.error('Ошибка отправки уведомления подтвержденному пользователю:', error);
    });
    
    res.json({ ok: true, task: tasks[taskIndex] });
  } catch (error) {
    console.error('Ошибка подтверждения задания:', error);
    res.status(500).json({ error: 'Ошибка подтверждения задания' });
  }
});

// Отклонение выполнения задания админом
app.post('/api/tasks/:id/reject', async (req, res) => {
  try {
    const taskId = req.params.id;
    const { userId, isAdmin } = req.body;
    
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admin can reject tasks' });
    }
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    const tasks = loadTasks();
    const taskIndex = tasks.findIndex(t => t.id === taskId);
    
    if (taskIndex === -1) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    const task = tasks[taskIndex];
    
    // Удаляем из pending
    if (task.pendingCompletions) {
      task.pendingCompletions = task.pendingCompletions.filter(p => String(p.userId) !== String(userId));
    }
    
    saveTasks(tasks);
    
    res.json({ ok: true, task: tasks[taskIndex] });
  } catch (error) {
    console.error('Ошибка отклонения задания:', error);
    res.status(500).json({ error: 'Ошибка отклонения задания' });
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

// Проверка истечения срока цели и отправка уведомления админу
function checkGoalExpiration() {
  try {
    const goals = loadGoals();
    if (goals.length === 0) return;
    
    const currentGoal = goals[goals.length - 1];
    if (!currentGoal || !currentGoal.weekStart) return;
    
    const weekStart = new Date(currentGoal.weekStart);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7); // Неделя = 7 дней
    
    const now = new Date();
    
    // Если неделя истекла и админу еще не отправляли уведомление
    if (now >= weekEnd && !currentGoal.notificationSent) {
      // Отправляем уведомление админу в ЛС
      const adminMessage = `⏰ Срок еженедельной цели истек!\n\nТекст цели: ${currentGoal.text}\n\nСоздайте новую цель для следующей недели.`;
      
      sendNotificationToAdmin(adminMessage).then(() => {
        // Отмечаем, что уведомление отправлено
        currentGoal.notificationSent = true;
        const goalIndex = goals.findIndex(g => g.id === currentGoal.id);
        if (goalIndex !== -1) {
          goals[goalIndex].notificationSent = true;
          saveGoals(goals);
        }
      }).catch(error => {
        console.error('Ошибка отправки уведомления админу о цели:', error);
      });
    }
  } catch (error) {
    console.error('Ошибка проверки истечения цели:', error);
  }
}

// Проверяем истечение цели каждые 30 минут (для более быстрого уведомления)
setInterval(checkGoalExpiration, 30 * 60 * 1000);
// Проверяем сразу при запуске
checkGoalExpiration();

// Запуск сервера
app.listen(PORT, () => {
  console.log('✅ Сервер запущен успешно!');
  console.log('GOLDEN TRAFF:', 'http://localhost:' + PORT);
  ensureDataDir();
  
  if (TELEGRAM_CHAT_ID) {
    console.log('✅ Telegram Chat ID установлен (для сделок в группу):', TELEGRAM_CHAT_ID);
  } else {
    console.log('⚠️ Telegram Chat ID не установлен в коде');
  }
  
  if (ADMIN_USER_ID) {
    console.log('✅ ADMIN_USER_ID установлен (для уведомлений админу в ЛС):', ADMIN_USER_ID);
  } else {
    console.log('⚠️ ADMIN_USER_ID не установлен. Откройте админское приложение для автоматической установки.');
  }
  
  console.log('📱 Бот для уведомлений:', NOTIFICATION_BOT_TOKEN ? 'настроен' : 'не настроен');
});
