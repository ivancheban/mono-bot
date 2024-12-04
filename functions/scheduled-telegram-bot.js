const { schedule } = require('@netlify/functions');
const { handler } = require('./telegram-bot');

// Run every hour
const scheduledFunction = schedule('0 * * * *', handler);

module.exports.handler = scheduledFunction;