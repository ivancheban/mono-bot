const axios = require('axios');

// Monobank API endpoints
const MONOBANK_CLIENT_INFO_URL = "https://api.monobank.ua/personal/client-info";
const MONOBANK_STATEMENT_URL = "https://api.monobank.ua/personal/statement";

// Your Monobank API token
const MONOBANK_API_TOKEN = process.env.MONOBANK_API_TOKEN;

// Your Telegram Bot token
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

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
  let formatted = "Client Information:\n\n";
  formatted += `Name: ${clientInfo.name}\n`;
  formatted += `Accounts:\n`;
  for (const account of clientInfo.accounts) {
    formatted += `- ID: ${account.id}\n`;
    formatted += `  Currency: ${account.currencyCode}\n`;
    formatted += `  Balance: ${account.balance / 100}\n`;
    formatted += `  Credit Limit: ${account.creditLimit / 100}\n`;
    formatted += `  Type: ${account.type}\n\n`;
  }
  return formatted;
}

function formatTransactions(transactions) {
  let formatted = "Recent Transactions:\n\n";
  for (const transaction of transactions) {
    formatted += `Date: ${new Date(transaction.time * 1000).toISOString()}\n`;
    formatted += `Amount: ${transaction.amount / 100} ${transaction.currencyCode}\n`;
    formatted += `Description: ${transaction.description}\n\n`;
  }
  return formatted;
}

async function sendTelegramMessage(chatId, message) {
  try {
    const response = await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: message
    });
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
    const command = message.text.split(' ')[0].toLowerCase();
    const args = message.text.split(' ').slice(1);

    switch (command) {
      case '/start':
        await sendTelegramMessage(chatId, "Welcome! Available commands:\n/account_info - Get account information\n/statement <account_id> <days> - Get statement for specified account and number of days");
        break;
      
      case '/account_info':
        const clientInfo = await getClientInfo();
        if (clientInfo) {
          const formattedInfo = formatClientInfo(clientInfo);
          await sendTelegramMessage(chatId, formattedInfo);
        } else {
          await sendTelegramMessage(chatId, "Failed to fetch account information.");
        }
        break;
      
      case '/statement':
        if (args.length !== 2) {
          await sendTelegramMessage(chatId, "Usage: /statement <account_id> <days>");
          break;
        }
        
        const accountId = args[0];
        const days = parseInt(args[1]);
        
        if (isNaN(days) || days <= 0 || days > 31) {
          await sendTelegramMessage(chatId, "Please provide a valid number of days (1-31).");
          break;
        }
        
        const now = Math.floor(Date.now() / 1000);
        const from = now - (days * 86400); // Convert days to seconds
        
        const transactions = await getAccountStatement(accountId, from, now);
        if (transactions && transactions.length > 0) {
          const transactionsMessage = formatTransactions(transactions);
          await sendTelegramMessage(chatId, `Transactions for account ${accountId} in the last ${days} days:\n${transactionsMessage}`);
        } else {
          await sendTelegramMessage(chatId, `No transactions found for account ${accountId} in the last ${days} days.`);
        }
        break;
      
      case '/rebuild':
        try {
          await axios.post('https://api.netlify.com/build_hooks/675079f5f28b9125fc54536e');
          await sendTelegramMessage(chatId, "Build triggered successfully.");
        } catch (error) {
          console.error("Failed to trigger build", error);
          await sendTelegramMessage(chatId, "Failed to trigger build.");
        }
        break;

      default:
        await sendTelegramMessage(chatId, "Unknown command. Use /start to see available commands.");
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