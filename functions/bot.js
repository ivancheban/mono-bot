const axios = require('axios');

const MONOBANK_CLIENT_INFO_URL = "https://api.monobank.ua/personal/client-info";
const MONOBANK_STATEMENT_URL = "https://api.monobank.ua/personal/statement";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Store user states, tokens, and language preferences
const userStates = {};
const userTokens = {};
const userLanguages = {};

// Translations
const translations = {
  en: {
    welcome: "👋 Welcome! Please select your language:",
    languageSelected: "Language set to English. To get started, you need to follow the link, authorize in the Monobank app, copy the Monobank API token, and paste it into the bot.\n\nYou can obtain your token here: https://api.monobank.ua/index.html\n\nPlease paste your token in the message below:",
    tokenVerified: "✅ Token verified and saved successfully. Available command:\n\n📊 /account_info - Get account information and select an account for statement",
    invalidToken: "❌ Invalid token. Error: {error}\n\nPlease try again with /start and enter a valid token.",
    enterToken: "Please start over with /start and enter your Monobank API token.",
    accountInfoFailed: "❌ Failed to fetch account information. Error: {error}\n\nPlease check your token and try again with /start.",
    enterDays: "For how many days would you like to see the statement? (1-31)",
    invalidDays: "⚠️ Please provide a valid number of days (1-31).",
    unknownCommand: "❓ Unknown command. Use /start to begin or /account_info to view your accounts.",
    noTransactions: "ℹ️ No transactions found for account {balance} {currency} {type} in the last {days} days.",
    transactionsFailed: "❌ Failed to fetch transactions. Error: {error}",
  },
  uk: {
    welcome: "👋 Вітаємо! Будь ласка, оберіть мову:",
    languageSelected: "Мову встановлено на українську. Щоб почати, вам потрібно перейти за посиланням, авторизуватися в застосунку Monobank, скопіювати токен API Monobank і вставити його в бот.\n\nВи можете отримати свій токен тут: https://api.monobank.ua/index.html\n\nБудь ласка, вставте свій токен в повідомленні нижче:",
    tokenVerified: "✅ Токен перевірено та успішно збережено. Доступна команда:\n\n📊 /account_info - Отримати інформацію про рахунок та вибрати рахунок для виписки",
    invalidToken: "❌ Недійсний токен. Помилка: {error}\n\nБудь ласка, спробуйте знову з /start і введіть дійсний токен.",
    enterToken: "Будь ласка, почніть знову з /start і введіть свій токен API Monobank.",
    accountInfoFailed: "❌ Не вдалося отримати інформацію про рахунок. Помилка: {error}\n\nБудь ласка, перевірте свій токен і спробуйте знову з /start.",
    enterDays: "За скільки днів ви хочете побачити виписку? (1-31)",
    invalidDays: "⚠️ Будь ласка, вкажіть дійсну кількість днів (1-31).",
    unknownCommand: "❓ Невідома команда. Використовуйте /start для початку або /account_info для перегляду ваших рахунків.",
    noTransactions: "ℹ️ Не знайдено транзакцій для рахунку {balance} {currency} {type} за останні {days} днів.",
    transactionsFailed: "❌ Не вдалося отримати транзакції. Помилка: {error}",
  }
};

function getCurrencySymbol(currencyCode) {
  switch (currencyCode) {
    case 980: return 'UAH';
    case 840: return 'USD';
    case 978: return 'EUR';
    default: return currencyCode.toString();
  }
}

async function getClientInfo(token) {
  try {
    const response = await axios.get(MONOBANK_CLIENT_INFO_URL, {
      headers: { "X-Token": token }
    });
    return response.data;
  } catch (error) {
    console.error("Failed to get client info", error.response ? error.response.data : error.message);
    return { error: error.response ? error.response.data : error.message };
  }
}

async function getAccountStatement(token, account, from, to) {
  try {
    const response = await axios.get(`${MONOBANK_STATEMENT_URL}/${account}/${from}/${to}`, {
      headers: { "X-Token": token }
    });
    return response.data;
  } catch (error) {
    console.error("Failed to get account statement", error.response ? error.response.data : error.message);
    return { error: error.response ? error.response.data : error.message };
  }
}

function formatClientInfo(clientInfo, lang) {
  let formatted = lang === 'uk' ? "👤 Інформація про клієнта:\n\n" : "👤 Client Information:\n\n";
  formatted += `${lang === 'uk' ? "Ім'я" : "Name"}: ${clientInfo.name}\n\n`;
  formatted += `${lang === 'uk' ? "💳 Рахунки" : "💳 Accounts"}:\n`;
  clientInfo.accounts.forEach((account, index) => {
    const balance = account.balance / 100;
    const currency = getCurrencySymbol(account.currencyCode);
    formatted += `${index + 1}. ${balance} ${currency} ${account.type}\n`;
    formatted += `   💰 ${lang === 'uk' ? "Баланс" : "Balance"}: ${balance} ${currency}\n`;
    formatted += `   💳 ${lang === 'uk' ? "Кредитний ліміт" : "Credit Limit"}: ${account.creditLimit / 100} ${currency}\n`;
    formatted += `   📊 ${lang === 'uk' ? "Тип" : "Type"}: ${account.type}\n\n`;
  });
  formatted += lang === 'uk' ? "Натисніть на рахунок нижче, щоб отримати виписку." : "Click on an account below to get a statement.";
  return formatted;
}

function formatTransactions(transactions, currency, lang) {
  let formatted = "";
  for (const transaction of transactions) {
    formatted += `📅 ${lang === 'uk' ? "Дата" : "Date"}: ${new Date(transaction.time * 1000).toISOString()}\n`;
    formatted += `💸 ${lang === 'uk' ? "Сума" : "Amount"}: ${transaction.amount / 100} ${currency}\n`;
    formatted += `📝 ${lang === 'uk' ? "Опис" : "Description"}: ${transaction.description}\n\n`;
  }
  return formatted;
}

async function sendTelegramMessage(chatId, message, keyboard = null) {
  try {
    const payload = {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML'
    };
    if (keyboard) {
      payload.reply_markup = JSON.stringify(keyboard);
    }
    const response = await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, payload);
    console.log("Telegram API response:", response.data);
  } catch (error) {
    console.error("Failed to send Telegram message", error.response ? error.response.data : error.message);
    throw error;
  }
}

async function handleTelegramWebhook(body) {
  if (body.message && body.message.text) {
    const chatId = body.message.chat.id;
    const text = body.message.text;
    const lang = userLanguages[chatId] || 'en';

    if (text === '/start') {
      const keyboard = {
        inline_keyboard: [
          [{ text: "English", callback_data: "lang:en" }],
          [{ text: "Українська", callback_data: "lang:uk" }]
        ]
      };
      await sendTelegramMessage(chatId, translations[lang].welcome, keyboard);
      userStates[chatId] = { state: 'selecting_language' };
    } else if (userStates[chatId] && userStates[chatId].state === 'awaiting_token') {
      userTokens[chatId] = text;
      const clientInfoResponse = await getClientInfo(userTokens[chatId]);
      if (clientInfoResponse && !clientInfoResponse.error) {
        await sendTelegramMessage(chatId, translations[lang].tokenVerified);
        userStates[chatId] = { state: 'idle' };
      } else {
        const errorMessage = clientInfoResponse.error ? JSON.stringify(clientInfoResponse.error) : "Unknown error";
        await sendTelegramMessage(chatId, translations[lang].invalidToken.replace('{error}', errorMessage));
        delete userTokens[chatId];
        userStates[chatId] = { state: 'idle' };
      }
    } else if (text === '/account_info') {
      if (!userTokens[chatId]) {
        await sendTelegramMessage(chatId, translations[lang].enterToken);
        return;
      }
      const clientInfo = await getClientInfo(userTokens[chatId]);
      if (clientInfo && !clientInfo.error) {
        const formattedInfo = formatClientInfo(clientInfo, lang);
        const keyboard = {
          inline_keyboard: clientInfo.accounts.map((account, index) => {
            const balance = account.balance / 100;
            const currency = getCurrencySymbol(account.currencyCode);
            return [{text: `${balance} ${currency} ${account.type}`, callback_data: `account:${index}`}];
          })
        };
        await sendTelegramMessage(chatId, formattedInfo, keyboard);
        userStates[chatId] = { state: 'awaiting_days', accounts: clientInfo.accounts };
      } else {
        const errorMessage = clientInfo.error ? JSON.stringify(clientInfo.error) : "Unknown error";
        await sendTelegramMessage(chatId, translations[lang].accountInfoFailed.replace('{error}', errorMessage));
      }
    } else if (userStates[chatId] && userStates[chatId].state === 'awaiting_days') {
      const days = parseInt(text);
      if (isNaN(days) || days < 1 || days > 31) {
        await sendTelegramMessage(chatId, translations[lang].invalidDays);
      } else {
        await fetchAndSendStatement(chatId, userStates[chatId].selectedAccount, days);
        userStates[chatId] = { state: 'idle' };
      }
    } else {
      await sendTelegramMessage(chatId, translations[lang].unknownCommand);
    }
  } else if (body.callback_query) {
    const chatId = body.callback_query.message.chat.id;
    const data = body.callback_query.data;
    
    if (data.startsWith('lang:')) {
      const selectedLang = data.split(':')[1];
      userLanguages[chatId] = selectedLang;
      await sendTelegramMessage(chatId, translations[selectedLang].languageSelected);
      userStates[chatId] = { state: 'awaiting_token' };
    } else if (data.startsWith('account:')) {
      const accountIndex = parseInt(data.split(':')[1]);
      const selectedAccount = userStates[chatId].accounts[accountIndex];
      userStates[chatId] = { 
        state: 'awaiting_days', 
        selectedAccount: selectedAccount
      };
      const lang = userLanguages[chatId] || 'en';
      await sendTelegramMessage(chatId, translations[lang].enterDays);
    }
  }
}

async function fetchAndSendStatement(chatId, account, days) {
  const now = Math.floor(Date.now() / 1000);
  const from = now - (days * 86400);
  const transactions = await getAccountStatement(userTokens[chatId], account.id, from, now);
  const lang = userLanguages[chatId] || 'en';
  if (transactions && !transactions.error) {
    const balance = account.balance / 100;
    const currency = getCurrencySymbol(account.currencyCode);
    if (transactions.length > 0) {
      const transactionsMessage = formatTransactions(transactions, currency, lang);
      await sendTelegramMessage(chatId, `🧾 ${lang === 'uk' ? 'Транзакції для рахунку' : 'Transactions for account'} ${balance} ${currency} ${account.type} ${lang === 'uk' ? 'за останні' : 'in the last'} ${days} ${lang === 'uk' ? 'днів' : 'days'}:\n\n${transactionsMessage}`);
    } else {
      await sendTelegramMessage(chatId, translations[lang].noTransactions
        .replace('{balance}', balance)
        .replace('{currency}', currency)
        .replace('{type}', account.type)
        .replace('{days}', days));
    }
  } else {
    const errorMessage = transactions.error ? JSON.stringify(transactions.error) : "Unknown error";
    await sendTelegramMessage(chatId, translations[lang].transactionsFailed.replace('{error}', errorMessage));
  }
}

exports.handler = async function(event, context) {
  if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body);
      await handleTelegramWebhook(body);
      return {
        statusCode: 200,
        body: JSON.stringify({ message: "Webhook processed successfully" })
      };
    } catch (error) {
      console.error("Error processing webhook:", error);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: "Error processing webhook", error: error.toString() })
      };
    }
  } else {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: "Method not allowed" })
    };
  }
};