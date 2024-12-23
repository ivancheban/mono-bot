# Monobank Telegram Bot

This Telegram bot allows users to fetch and view their Monobank account information and transaction history directly through Telegram. The bot supports both English and Ukrainian languages.

## Features

- Language selection (English/Ukrainian)
- Secure Monobank API token input
- View account information
- Fetch transaction history for specific accounts
- Supports multiple currency types (UAH, USD, EUR)

## Prerequisites

- Node.js
- Netlify account
- Telegram Bot Token
- Monobank API access

## Setup

1. Clone this repository:

    ```sh
    git clone https://github.com/your-username/monobank-telegram-bot.git cd monobank-telegram-bot
    ```

2. Install dependencies:

    ```sh
    npm install
    ```

3. Set up environment variables:

- Create a `.env` file in the root directory
- Add your Telegram Bot Token:

    ```sh
    TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
    ```

4. Deploy to Netlify:

- Connect your GitHub repository to Netlify
- Set the build command to `npm install`
- Set the publish directory to `functions`

5. Set up your Telegram bot webhook:

- Replace `YOUR_BOT_TOKEN` and `YOUR_NETLIFY_FUNCTION_URL` in the following URL and open it in a browser:

    ```sh
    https://api.telegram.org/botYOUR_BOT_TOKEN/setWebhook?url=YOUR_NETLIFY_FUNCTION_URL
    ```

## Usage

1. Start a chat with your bot on Telegram.
2. Send the `/start` command.
3. Select your preferred language.
4. Follow the instructions to input your Monobank API token.
5. Use the `/account_info` command to view your accounts and fetch transaction history.

## File structure

- `functions/bot.js`: Main bot logic and Netlify serverless function
- `package.json`: Project dependencies
- `netlify.toml`: Netlify configuration file

## Token Storage and Security

This bot handles Monobank API tokens, which are sensitive pieces of information. Here's how tokens are currently managed in this implementation:

1. **Temporary Memory Storage**: 
   - Tokens are stored in a JavaScript object (`userTokens`) in the server's memory (RAM).
   - This object is created anew with each function invocation and does not persist between invocations.

2. **Isolation**:
   - Each instance of the Netlify function runs in isolation.
   - One user cannot access another user's token through this implementation.

3. **No Persistent Storage**:
   - Tokens are not stored in any database or file system.
   - They are not logged or stored in Netlify logs by default.

4. **Temporary Nature**:
   - Tokens only exist in memory for the duration of each function execution.
   - Once the function execution is complete, that memory is cleared.

5. **Limitations**:
   - Users need to re-enter their token every time they start a new session with the bot.
   - This approach doesn't provide persistence between bot restarts or server downtime.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Disclaimer

This bot is not officially associated with Monobank. Use at your own risk and ensure you keep your API token secure.
