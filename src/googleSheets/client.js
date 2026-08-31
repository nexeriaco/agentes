const { google } = require('googleapis');

if (!process.env.GOOGLE_SHEETS_CREDENTIALS_BASE64) {
  throw new Error('Falta la variable de entorno GOOGLE_SHEETS_CREDENTIALS_BASE64');
}

const credentials = JSON.parse(
  Buffer.from(process.env.GOOGLE_SHEETS_CREDENTIALS_BASE64, 'base64').toString('utf-8')
);

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

const sheets = google.sheets({ version: 'v4', auth });

module.exports = { sheets, serviceAccountEmail: credentials.client_email };
