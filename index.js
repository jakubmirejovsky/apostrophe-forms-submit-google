const { google } = require('googleapis');

module.exports = {
  improve: 'apostrophe-forms',
  addFields: [
    {
      name: 'googleSheetSubmissions',
      label: 'Submit to Google Spreadsheets',
      type: 'boolean',
      choices: [
        {
          label: 'Yes',
          value: true,
          showFields: [ 'googleSpreadsheetId' ]
        }
      ]
    },
    {
      name: 'googleSpreadsheetId',
      label: 'Google Spreadsheet ID',
      type: 'string',
      htmlHelp: '<a href="https://developers.google.com/sheets/api/guides/concepts#spreadsheet_id">The ID is found in the spreadsheet URL</a>: https://docs.google.com/spreadsheets/d/<strong>spreadsheetId</strong>/edit#gid=0'
    }
  ],
  construct: async function (self, options) {
    options.arrangeFields = options.arrangeFields.map(group => {
      if (group.name === 'afterSubmit') {
        group.fields.push(
          'googleSheetSubmissions',
          'googleSpreadsheetId'
        );
      }
      return group;
    });

    // Set the environment variable for API auth.
    process.env.GOOGLE_APPLICATION_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      `${__dirname}/credentials.json`;

    let auth;

    try {
      // Make google auth connection.
      auth = await google.auth.getClient({
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });
    } catch (error) {
      self.apos.utils.error('⚠️ Google Authentication Error: ', error);
      return;
    }

    const sheets = google.sheets({ version: 'v4', auth });

    if (auth) {
      self.on('submission', 'googleSheetSubmission', async function (req, form, data) {
        if (form.googleSheetSubmissions === true) {

          // Get the header row titles.
          const header = await getHeaderRow(form.googleSpreadsheetId);

          // Rework form submission data to match headers. If no column exists for a form value, add it.
          const liveColumns = [...header];
          const newRow = [];

          header.forEach(column => {
            newRow.push(data[column] || '');
            delete data[column];
          });

          // Add a column header for any data properties left-over.
          for (var key in data) {
            if (Array.isArray(data[key])) {
              data[key] = data[key].join(',');
            }
            header.push(key);
            newRow.push(data[key]);
          }

          // Update the spreadsheet header if necessary.
          if (liveColumns.length !== header.length) {
            await updateHeader(form.googleSpreadsheetId, header);
          }
          // Make post request to the google sheet.
          await appendSubmission(form.googleSpreadsheetId, newRow);
        }
      });
    }

    async function getHeaderRow(spreadsheetId) {
      return sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId,
        majorDimension: 'ROWS',
        range: 'Sheet1!1:1'
      })
        .then(result => {
          return result.data.values ? result.data.values[0] : [];
        })
        .catch(err => {
          self.apos.utils.error(err);
          return [];
        });
    }

    async function updateHeader(spreadsheetId, newHeader) {
      return sheets.spreadsheets.values.update({
        spreadsheetId: spreadsheetId,
        range: 'Sheet1!1:1',
        valueInputOption: 'RAW',
        responseDateTimeRenderOption: 'FORMATTED_STRING',
        resource: {
          "range": 'Sheet1!1:1',
          "majorDimension": 'ROWS',
          "values": [
            newHeader
          ]
        }
      })
        .catch(err => {
          self.apos.utils.error(err);
        });
    }

    async function appendSubmission(spreadsheetId, newRow) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: spreadsheetId,
        range: 'Sheet1',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        responseDateTimeRenderOption: 'FORMATTED_STRING',
        resource: {
          values: [
            newRow
          ]
        }
      })
        .catch(err => {
          throw Error(err);
        });
    }
  }
};
