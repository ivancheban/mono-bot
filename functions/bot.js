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
  formatted += "To get a statement, reply with the number of the account you want to view.";
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
  const { message } = body;
  if (message && message.text) {
    const chatId = message.chat.id;
    const text = message.text.toLowerCase();

    if (text === '/start') {
      await sendTelegramMessage(chatId, "👋 Welcome! Available commands:\n\n" +
        "📊 /account_info - Get account information and select an account for statement\n" +
        "🔄 /cancel - Cancel the current operation");
      userStates[chatId] = { state: 'idle' };
    } else if (text === '/account_info') {
      const clientInfo = await getClientInfo();
      if (clientInfo) {
        const formattedInfo = formatClientInfo(clientInfo);
        await sendTelegramMessage(chatId, formattedInfo);
        userStates[chatId] = { state: 'awaiting_account_selection', accounts: clientInfo.accounts };
      } else {
        await sendTelegramMessage(chatId, "❌ Failed to fetch account information.");
      }
    } else if (text === '/cancel') {
      userStates[chatId] = { state: 'idle' };
      await sendTelegramMessage(chatId, "Operation cancelled. What would you like to do next?");
    } else if (userStates[chatId]) {
      switch (userStates[chatId].state) {
        case 'awaiting_account_selection':
          const accountIndex = parseInt(text) - 1;
          if (isNaN(accountIndex) || accountIndex < 0 || accountIndex >= userStates[chatId].accounts.length) {
            await sendTelegramMessage(chatId, "⚠️ Invalid selection. Please choose a number from the list.");
          } else {
            userStates[chatId].selectedAccount = userStates[chatId].accounts[accountIndex];
            userStates[chatId].state = 'awaiting_days';
            await sendTelegramMessage(chatId, "For how many days would you like to see the statement? (1-31)");
          }
          break;
        case 'awaiting_days':
          const days = parseInt(text);
          if (isNaN(days) || days < 1 || days > 31) {
            await sendTelegramMessage(chatId, "⚠️ Please provide a valid number of days (1-31).");
          } else {
            const now = Math.floor(Date.now() / 1000);
            const from = now - (days * 86400);
            const transactions = await getAccountStatement(userStates[chatId].selectedAccount.id, from, now);
            if (transactions && transactions.length > 0) {
              const transactionsMessage = formatTransactions(transactions);
              await sendTelegramMessage(chatId, `🧾 Transactions for account ${userStates[chatId].selectedAccount.id} in the last ${days} days:\n\n${transactionsMessage}`);
            } else {
              await sendTelegramMessage(chatId, `ℹ️ No transactions found for account ${userStates[chatId].selectedAccount.id} in the last ${days} days.`);
            }
            userStates[chatId] = { state: 'idle' };
          }
          break;
        default:
          await sendTelegramMessage(chatId, "❓ Unknown command. Use /start to see available commands.");
      }
    } else {
      await sendTelegramMessage(chatId, "❓ Unknown command. Use /start to see available commands.");
    }
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