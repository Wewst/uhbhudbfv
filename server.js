const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;
const DEAL_AMOUNT = 9500;

// Telegram Bot настройки (жёстко прописанные данные)
const TELEGRAM_BOT_TOKEN = '7840364464:AAEuBsIUKTnWxCnTaX0jn9WUMC5c4rp2nEk';
// Группа, куда всегда отправляем сообщения
const TELEGRAM_CHAT_ID = '-5240130674';

// Путь к файлу с данными
const dataDir = path.join(__dirname, 'data');
const dealsFile = path.join(dataDir, 'deals.json');
const botMessagesFile = path.join(dataDir, 'bot_messages.json'); // Файл для сохранения сообщений бота

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

// Сохранение сообщения бота в файл для последующего восстановления
function saveBotMessage(messageId, text, date) {
  try {
    ensureDataDir();
    let messages = [];
    if (fs.existsSync(botMessagesFile)) {
      try {
        const data = fs.readFileSync(botMessagesFile, 'utf8');
        messages = JSON.parse(data);
      } catch (e) {
        messages = [];
      }
    }
    
    // Проверяем, нет ли уже такого сообщения
    if (!messages.find(m => m.messageId === messageId)) {
      messages.push({
        messageId,
        text,
        date: date || new Date().toISOString(),
        chatId: TELEGRAM_CHAT_ID
      });
      fs.writeFileSync(botMessagesFile, JSON.stringify(messages, null, 2), 'utf8');
    }
  } catch (error) {
    console.error('Ошибка сохранения сообщения бота:', error);
  }
}

// Загрузка сохраненных сообщений бота
function loadBotMessages() {
  ensureDataDir();
  if (!fs.existsSync(botMessagesFile)) {
    return [];
  }
  try {
    const data = fs.readFileSync(botMessagesFile, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Ошибка чтения bot_messages.json:', error);
    return [];
  }
}

// Функция отправки сообщения в Telegram (возвращает message_id)
async function sendTelegramMessage(text) {
  const chatId = TELEGRAM_CHAT_ID;
  if (!chatId) {
    console.log('⚠️ TELEGRAM_CHAT_ID не установлен, сообщение не отправлено:', text);
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
            
            // Сохраняем сообщение в файл для последующего восстановления
            if (messageId) {
              saveBotMessage(messageId, text, new Date().toISOString());
            }
            
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
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    const usernameFormatted = username.startsWith('@') ? username : '@' + username;
    
    const deals = loadDeals();
    const newDeal = {
      id,
      username: usernameFormatted,
      amount: DEAL_AMOUNT,
      date: new Date().toISOString(),
      status: 'pending',
      telegramMessageId: null
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
    const { status } = req.body;
    
    if (!status || !['pending', 'success', 'failed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const deals = loadDeals();
    const dealIndex = deals.findIndex(d => d.id === dealId);

    if (dealIndex === -1) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const deal = deals[dealIndex];
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
        const messageText = status === 'success' 
          ? `Сделка успешна ${deal.username}` 
          : `Сделка провалена ${deal.username}`;
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
    const deals = loadDeals();
    const dealIndex = deals.findIndex(d => d.id === dealId);

    if (dealIndex === -1) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const deal = deals[dealIndex];
    deals.splice(dealIndex, 1);
    saveDeals(deals);

    // Отправляем уведомление в Telegram
    try {
      await sendTelegramMessage(`Сделка удалена ${deal.username}`);
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

// Функция получения всех сообщений бота из группы
// ВАЖНО: getUpdates возвращает только необработанные обновления
// Для получения истории нужно использовать offset=0 и обработать все обновления
async function getAllBotMessages() {
  // Получаем ID бота
  const botInfo = await getBotInfo();
  const botId = botInfo.id;
  
  console.log('📥 Начинаю получение всех сообщений бота из группы...');
  console.log('⚠️ ВАЖНО: getUpdates возвращает только необработанные обновления.');
  console.log('⚠️ Если бот уже обработал обновления, они не вернутся.');
  console.log('⚠️ Для полной истории нужно использовать offset=0 при первом запуске.');
  
  let allUpdates = [];
  let offset = 0;
  let hasMore = true;
  let attempts = 0;
  const maxAttempts = 50; // Максимум 50 попыток (5000 сообщений)
  
  // Получаем обновления порциями
  while (hasMore && attempts < maxAttempts) {
    attempts++;
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${offset}&limit=100`;
    
    const updates = await new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        port: 443,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        timeout: 5000
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
              resolve(response.result || []);
            } catch (e) {
              reject(new Error('Ошибка парсинга ответа'));
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });
      
      req.on('timeout', () => {
        req.destroy();
        resolve([]); // Возвращаем пустой массив при таймауте
      });

      req.end();
    });
    
    if (updates.length === 0) {
      hasMore = false;
      console.log('📭 Больше обновлений нет');
    } else {
      // Фильтруем только сообщения бота из нужной группы
      const botMessages = updates.filter(update => {
        if (!update.message) return false;
        if (!update.message.chat) return false;
        if (String(update.message.chat.id) !== String(TELEGRAM_CHAT_ID)) return false;
        if (!update.message.from) return false;
        if (update.message.from.id !== botId) return false;
        if (!update.message.text) return false;
        return true;
      });
      
      allUpdates = allUpdates.concat(botMessages);
      
      // Обновляем offset для следующего запроса
      const lastUpdateId = updates[updates.length - 1].update_id;
      offset = lastUpdateId + 1;
      
      console.log(`📨 Попытка ${attempts}: получено ${updates.length} обновлений, из них ${botMessages.length} сообщений бота. Всего собрано: ${allUpdates.length}`);
      
      // Если получили меньше 100, значит это последняя порция
      if (updates.length < 100) {
        hasMore = false;
      }
    }
  }
  
  console.log(`✅ Всего получено ${allUpdates.length} сообщений бота из группы`);
  
  if (allUpdates.length === 0) {
    console.log('⚠️ Сообщений не найдено. Возможные причины:');
    console.log('   1. Бот уже обработал все обновления (getUpdates возвращает только необработанные)');
    console.log('   2. Бот не отправлял сообщения в эту группу');
    console.log('   3. Бот не добавлен в группу или не имеет прав');
  }
  
  return allUpdates;
}

// Функция получения ID бота
async function getBotInfo() {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`;
  
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname,
      method: 'GET'
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
            resolve(response.result);
          } catch (e) {
            reject(new Error('Ошибка парсинга ответа'));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

// Функция парсинга сообщения бота и извлечения данных о сделке
function parseDealFromMessage(messageText) {
  if (!messageText) return null;
  
  // Паттерны для распознавания сообщений
  const createPattern = /Сделка создалась\s+(@?\w+)/i;
  const successPattern = /Сделка успешна\s+(@?\w+)/i;
  const failedPattern = /Сделка провалена\s+(@?\w+)/i;
  
  let username = null;
  let status = 'pending';
  
  if (createPattern.test(messageText)) {
    const match = messageText.match(createPattern);
    username = match[1];
    status = 'pending';
  } else if (successPattern.test(messageText)) {
    const match = messageText.match(successPattern);
    username = match[1];
    status = 'success';
  } else if (failedPattern.test(messageText)) {
    const match = messageText.match(failedPattern);
    username = match[1];
    status = 'failed';
  } else {
    return null;
  }
  
  // Нормализуем username
  if (username && !username.startsWith('@')) {
    username = '@' + username;
  }
  
  return { username, status };
}

// Функция восстановления сделок из сообщений бота
async function restoreDealsFromBotMessages() {
  try {
    console.log('🔄 Начинаю синхронизацию сделок из сообщений бота...');
    console.log('✅ Группа для синхронизации:', TELEGRAM_CHAT_ID);
    
    // Сначала загружаем сохраненные сообщения из файла
    const savedMessages = loadBotMessages();
    console.log(`📁 Загружено ${savedMessages.length} сохраненных сообщений из файла`);
    
    // Также пытаемся получить новые сообщения через getUpdates
    let updates = [];
    try {
      updates = await getAllBotMessages();
      console.log(`📨 Получено ${updates.length} новых сообщений через getUpdates`);
    } catch (error) {
      console.log('⚠️ Не удалось получить сообщения через getUpdates:', error.message);
    }
    
    // Объединяем сохраненные и новые сообщения
    const allMessages = [...savedMessages];
    
    // Добавляем новые сообщения из getUpdates (если их еще нет в сохраненных)
    for (const update of updates) {
      if (update.message && update.message.text) {
        const messageId = update.message.message_id;
        if (!allMessages.find(m => m.messageId === messageId)) {
          allMessages.push({
            messageId,
            text: update.message.text,
            date: new Date(update.message.date * 1000).toISOString(),
            chatId: String(update.message.chat.id)
          });
        }
      }
    }
    
    // Фильтруем только сообщения из нужной группы
    const groupMessages = allMessages.filter(msg => 
      String(msg.chatId) === String(TELEGRAM_CHAT_ID)
    );
    
    console.log(`📝 Всего сообщений бота из группы: ${groupMessages.length}`);
    
    const deals = loadDeals();
    let restoredCount = 0;
    let updatedCount = 0;
    
    // Сортируем по дате (от старых к новым)
    groupMessages.sort((a, b) => new Date(a.date) - new Date(b.date));
    console.log(`📝 Обрабатываю ${groupMessages.length} сообщений...`);
    
    // Обрабатываем каждое сообщение
    for (const msg of groupMessages) {
      const dealData = parseDealFromMessage(msg.text);
      if (!dealData) continue;
      
      // Ищем существующую сделку по username и message_id (чтобы не дублировать)
      let existingDeal = deals.find(d => 
        d.telegramMessageId === msg.messageId || 
        (d.username && d.username.toLowerCase() === dealData.username.toLowerCase() && 
         d.status === dealData.status)
      );
      
      if (!existingDeal) {
        // Создаем новую сделку
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
        const newDeal = {
          id,
          username: dealData.username,
          amount: DEAL_AMOUNT,
          date: msg.date || new Date().toISOString(),
          status: dealData.status,
          telegramMessageId: msg.messageId,
          restored: true // Флаг, что сделка восстановлена
        };
        deals.push(newDeal);
        restoredCount++;
        console.log(`✅ Восстановлена сделка: ${dealData.username} (${dealData.status})`);
      } else {
        // Обновляем статус существующей сделки, если нужно
        if (dealData.status !== 'pending' && existingDeal.status === 'pending') {
          existingDeal.status = dealData.status;
          existingDeal.telegramMessageId = msg.messageId;
          updatedCount++;
          console.log(`🔄 Обновлен статус сделки: ${dealData.username} -> ${dealData.status}`);
        }
      }
    }
    
    // Сохраняем все сделки
    if (restoredCount > 0 || updatedCount > 0) {
      saveDeals(deals);
      console.log(`✅ Синхронизация завершена: восстановлено ${restoredCount}, обновлено ${updatedCount}`);
    } else {
      console.log('✅ Синхронизация завершена: изменений нет');
    }
    
    return { restored: restoredCount, updated: updatedCount, total: deals.length };
  } catch (error) {
    console.error('❌ Ошибка синхронизации:', error);
    throw error;
  }
}

// Endpoint для ручной синхронизации
app.post('/api/telegram/sync', async (req, res) => {
  try {
    const result = await restoreDealsFromBotMessages();
    res.json({ ok: true, ...result });
  } catch (error) {
    console.error('Ошибка синхронизации:', error);
    res.status(500).json({ error: 'Ошибка синхронизации', message: error.message });
  }
});

// Endpoint для получения статистики синхронизации
app.get('/api/telegram/sync', async (req, res) => {
  try {
    const deals = loadDeals();
    const restored = deals.filter(d => d.restored).length;
    res.json({ 
      total: deals.length, 
      restored: restored,
      normal: deals.length - restored
    });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка получения статистики' });
  }
});

// Запуск сервера
app.listen(PORT, () => {
  console.log('✅ Сервер запущен успешно!');
  console.log('GOLDEN TRAFF:', 'http://localhost:' + PORT);
  ensureDataDir();
  
  if (TELEGRAM_CHAT_ID) {
    console.log('✅ Telegram Chat ID установлен:', TELEGRAM_CHAT_ID);
    
    // Автоматическая синхронизация при старте (в фоне, не блокирует запуск)
    setTimeout(async () => {
      try {
        await restoreDealsFromBotMessages();
      } catch (error) {
        console.error('⚠️ Ошибка автоматической синхронизации при старте:', error.message);
      }
    }, 3000); // Ждем 3 секунды после запуска
  } else {
    console.log('⚠️ Telegram Chat ID не установлен в коде');
  }
});
