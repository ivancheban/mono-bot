const axios = require('axios');

// Monobank API endpoints
const MONOBANK_CLIENT_INFO_URL = "https://api.monobank.ua/personal/client-info";
const MONOBANK_STATEMENT_URL = "https://api.monobank.ua/personal/statement";

// Your Monobank API token
const MONOBANK_API_TOKEN = process.env.MONOBANK_API_TOKEN;

// Your Telegram Bot token
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Telegram chat ID where you want to send the messages
const CHAT_ID = process.env.CHAT_ID;

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
    formatted += `- ${account.currencyCode} account: ${account.balance / 100} ${account.cashbackType}\n`;
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

async function sendTelegramMessage(message) {
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: message
    });
  } catch (error) {
    console.error("Failed to send Telegram message", error);
  }
}

exports.handler = async function(event, context) {
  try {
    const clientInfo = await getClientInfo();
    if (!clientInfo) {
      throw new Error("Failed to fetch client info");
    }

    const clientInfoMessage = formatClientInfo(clientInfo);
    await sendTelegramMessage(clientInfoMessage);

    // Get transactions for the last 24 hours
    const now = Math.floor(Date.now() / 1000);
    const oneDayAgo = now - 86400; // 24 hours in seconds
    
    for (const account of clientInfo.accounts) {
      const transactions = await getAccountStatement(account.id, oneDayAgo, now);
      if (transactions && transactions.length > 0) {
        const transactionsMessage = formatTransactions(transactions);
        await sendTelegramMessage(`Transactions for account ${account.id}:\n${transactionsMessage}`);
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Client info and transactions sent successfully" })
    };
  } catch (error) {
    console.error("An error occurred", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "An error occurred", error: error.toString() })
    };
  }
};