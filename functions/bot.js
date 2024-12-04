const axios = require('axios');

const MONOBANK_CLIENT_INFO_URL = "https://api.monobank.ua/personal/client-info";
const MONOBANK_STATEMENT_URL = "https://api.monobank.ua/personal/statement";

const MONOBANK_API_TOKEN = process.env.MONOBANK_API_TOKEN;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Store user states
const userStates = {};

function getCurrencySymbol(currencyCode) {
  switch (currencyCode) {
    case 980: return 'UAH';
    case 840: return 'USD';
    case 978: return 'EUR';
    default: return currencyCode.toString();
  }
}

async function getClientInfo() {
  try {
    const response = await axios.get(MONOBANK_CLIENT_INFO_URL, {
      headers: { "X-Token": MONOBANK_API_TOKEN }
    });
    return response.data;
  } catch (error) {
    console.error("Failed to get client info", error);
    return null;
  }
}

async function getAccountStatement(account, from, to) {
  try {
    const response = await axios.get(`${MONOBANK_STATEMENT_URL}/${account}/${from}/${to}`, {
      headers: { "X-Token": MONOBANK_API_TOKEN }
    });
    return response.data;
  } catch (error) {
    console.error("Failed to get account statement", error);
    return null;
  }
}

function formatClientInfo(clientInfo) {
  let formatted = "👤 Client Information:\n\n";
  formatted += `Name: ${clientInfo.name}\n\n`;
  formatted += `💳 Accounts:\n`;
  clientInfo.accounts.forEach((account, index) => {
    formatted += `${index + 1}. ID: ${account.id}\n`;
    formatted += `   💱 Currency: ${getCurrencySymbol(account.currencyCode)}\n`;
    formatted += `   💰 Balance: ${account.balance / 100} ${getCurrencySymbol(account.currencyCode)}\n`;
    formatted += `   💳 Credit Limit: ${account.creditLimit / 100} ${getCurrencySymbol(account.currencyCode)}\n`;
    formatted += `   📊 Type: ${account.type}\n\n`;
  });
  formatted += "Click on an account ID below to get a statement.";
  return formatted;
}

function formatTransactions(transactions) {
  let formatted = "🧾 Recent Transactions:\n\n";
  for (const transaction of transactions) {
    formatted += `📅 Date: ${new Date(transaction.time * 1000).toISOString()}\n`;
    formatted += `💸 Amount: ${transaction.amount / 100} ${getCurrencySymbol(transaction.currencyCode)}\n`;
    formatted += `📝 Description: ${transaction.description}\n\n`;
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
    const text = body.message.text.toLowerCase();

    if (text === '/start') {
      await sendTelegramMessage(chatId, "👋 Welcome! Available commands:\n\n" +
        "📊 /account_info - Get account information and select an account for statement\n" +
        "🔄 /cancel - Cancel the current operation");
      userStates[chatId] = { state: 'idle' };
    } else if (text === '/account_info') {
      const clientInfo = await getClientInfo();
      if (clientInfo) {
        const formattedInfo = formatClientInfo(clientInfo);
        const keyboard = {
          inline_keyboard: clientInfo.accounts.map(account => [{text: account.id, callback_data: `account:${account.id}`}])
        };
        await sendTelegramMessage(chatId, formattedInfo, keyboard);
        userStates[chatId] = { state: 'awaiting_days', accounts: clientInfo.accounts };
      } else {
        await sendTelegramMessage(chatId, "❌ Failed to fetch account information.");
      }
    } else if (text === '/cancel') {
      userStates[chatId] = { state: 'idle' };
      await sendTelegramMessage(chatId, "Operation cancelled. What would you like to do next?");
    } else if (userStates[chatId] && userStates[chatId].state === 'awaiting_days') {
      const days = parseInt(text);
      if (isNaN(days) || days < 1 || days > 31) {
        await sendTelegramMessage(chatId, "⚠️ Please provide a valid number of days (1-31).");
      } else {
        await fetchAndSendStatement(chatId, userStates[chatId].selectedAccount, days);
        userStates[chatId] = { state: 'idle' };
      }
    } else {
      await sendTelegramMessage(chatId, "❓ Unknown command. Use /start to see available commands.");
    }
  } else if (body.callback_query) {
    const chatId = body.callback_query.message.chat.id;
    const data = body.callback_query.data;
    
    if (data.startsWith('account:')) {
      const accountId = data.split(':')[1];
      userStates[chatId] = { state: 'awaiting_days', selectedAccount: accountId };
      await sendTelegramMessage(chatId, "For how many days would you like to see the statement? (1-31)");
    }
  }
}

async function fetchAndSendStatement(chatId, accountId, days) {
  const now = Math.floor(Date.now() / 1000);
  const from = now - (days * 86400);
  const transactions = await getAccountStatement(accountId, from, now);
  if (transactions && transactions.length > 0) {
    const transactionsMessage = formatTransactions(transactions);
    await sendTelegramMessage(chatId, `🧾 Transactions for account ${accountId} in the last ${days} days:\n\n${transactionsMessage}`);
  } else {
    await sendTelegramMessage(chatId, `ℹ️ No transactions found for account ${accountId} in the last ${days} days.`);
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