const axios = require('axios');

const MONOBANK_CLIENT_INFO_URL = "https://api.monobank.ua/personal/client-info";
const MONOBANK_STATEMENT_URL = "https://api.monobank.ua/personal/statement";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Store user states and tokens
const userStates = {};
const userTokens = {};

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
    console.error("Failed to get client info", error);
    return null;
  }
}

async function getAccountStatement(token, account, from, to) {
  try {
    const response = await axios.get(`${MONOBANK_STATEMENT_URL}/${account}/${from}/${to}`, {
      headers: { "X-Token": token }
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
    const balance = account.balance / 100;
    const currency = getCurrencySymbol(account.currencyCode);
    formatted += `${index + 1}. ${balance} ${currency} ${account.type}\n`;
    formatted += `   💰 Balance: ${balance} ${currency}\n`;
    formatted += `   💳 Credit Limit: ${account.creditLimit / 100} ${currency}\n`;
    formatted += `   📊 Type: ${account.type}\n\n`;
  });
  formatted += "Click on an account below to get a statement.";
  return formatted;
}

function formatTransactions(transactions, currency) {
  let formatted = "";
  for (const transaction of transactions) {
    formatted += `📅 Date: ${new Date(transaction.time * 1000).toISOString()}\n`;
    formatted += `💸 Amount: ${transaction.amount / 100} ${currency}\n`;
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
    const text = body.message.text;

    if (text === '/start') {
      await sendTelegramMessage(chatId, "👋 Welcome! Please enter your Monobank API token to get started.");
      userStates[chatId] = { state: 'awaiting_token' };
    } else if (userStates[chatId] && userStates[chatId].state === 'awaiting_token') {
      userTokens[chatId] = text;
      await sendTelegramMessage(chatId, "Token saved. Available command:\n\n" +
        "📊 /account_info - Get account information and select an account for statement");
      userStates[chatId] = { state: 'idle' };
    } else if (text === '/account_info') {
      if (!userTokens[chatId]) {
        await sendTelegramMessage(chatId, "Please start over with /start and enter your Monobank API token.");
        return;
      }
      const clientInfo = await getClientInfo(userTokens[chatId]);
      if (clientInfo) {
        const formattedInfo = formatClientInfo(clientInfo);
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
        await sendTelegramMessage(chatId, "❌ Failed to fetch account information. Please check your token and try again with /start.");
      }
    } else if (userStates[chatId] && userStates[chatId].state === 'awaiting_days') {
      const days = parseInt(text);
      if (isNaN(days) || days < 1 || days > 31) {
        await sendTelegramMessage(chatId, "⚠️ Please provide a valid number of days (1-31).");
      } else {
        await fetchAndSendStatement(chatId, userStates[chatId].selectedAccount, days);
        userStates[chatId] = { state: 'idle' };
      }
    } else {
      await sendTelegramMessage(chatId, "❓ Unknown command. Use /start to begin or /account_info to view your accounts.");
    }
  } else if (body.callback_query) {
    const chatId = body.callback_query.message.chat.id;
    const data = body.callback_query.data;
    
    if (data.startsWith('account:')) {
      const accountIndex = parseInt(data.split(':')[1]);
      const selectedAccount = userStates[chatId].accounts[accountIndex];
      userStates[chatId] = { 
        state: 'awaiting_days', 
        selectedAccount: selectedAccount
      };
      await sendTelegramMessage(chatId, "For how many days would you like to see the statement? (1-31)");
    }
  }
}

async function fetchAndSendStatement(chatId, account, days) {
  const now = Math.floor(Date.now() / 1000);
  const from = now - (days * 86400);
  const transactions = await getAccountStatement(userTokens[chatId], account.id, from, now);
  const balance = account.balance / 100;
  const currency = getCurrencySymbol(account.currencyCode);
  if (transactions && transactions.length > 0) {
    const transactionsMessage = formatTransactions(transactions, currency);
    await sendTelegramMessage(chatId, `🧾 Transactions for account ${balance} ${currency} ${account.type} in the last ${days} days:\n\n${transactionsMessage}`);
  } else {
    await sendTelegramMessage(chatId, `ℹ️ No transactions found for account ${balance} ${currency} ${account.type} in the last ${days} days.`);
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