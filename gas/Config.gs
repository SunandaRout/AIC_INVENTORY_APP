/**
 * Config.gs
 * Central configuration. NOTHING secret lives in this file — everything
 * is pulled from Script Properties at runtime (Project Settings >
 * Script Properties in the Apps Script editor, or setScriptProperties()
 * below run once from the editor).
 */

const APP_NAME = 'AIC Inventory App';

// Required Script Properties (set these in the Apps Script editor):
//   DB_TYPE        -> 'mysql' | 'postgres' | 'api'
//   DB_HOST
//   DB_PORT
//   DB_NAME
//   DB_USER
//   DB_PASSWORD
//   SQL_API_URL    -> only if DB_TYPE = 'api' (see Database.gs adapter notes)
//   SHEET_ID       -> the Google Sheet used for operational entry
//   SESSION_SECRET -> random string used to sign session tokens

function getConfig_() {
  const props = PropertiesService.getScriptProperties();
  return {
    dbType: props.getProperty('DB_TYPE') || 'mysql',
    dbHost: props.getProperty('DB_HOST'),
    dbPort: props.getProperty('DB_PORT') || '3306',
    dbName: props.getProperty('DB_NAME'),
    dbUser: props.getProperty('DB_USER'),
    dbPassword: props.getProperty('DB_PASSWORD'),
    sqlApiUrl: props.getProperty('SQL_API_URL'),
    sheetId: props.getProperty('SHEET_ID'),
    sessionSecret: props.getProperty('SESSION_SECRET'),
  };
}

/**
 * One-time helper: run this manually from the Apps Script editor
 * (select the function, click Run) to populate Script Properties.
 * Fill in real values first, then delete/blank them out again after
 * running once — don't leave credentials sitting in this file.
 */
function ONE_TIME_setScriptProperties() {
  PropertiesService.getScriptProperties().setProperties({
    DB_TYPE: 'mysql',
    DB_HOST: 'CHANGE_ME.rds.amazonaws.com',
    DB_PORT: '3306',
    DB_NAME: 'aic_inventory',
    DB_USER: 'CHANGE_ME',
    DB_PASSWORD: 'CHANGE_ME',
    SQL_API_URL: '',
    SHEET_ID: SpreadsheetApp.getActiveSpreadsheet().getId(),
    SESSION_SECRET: Utilities.getUuid(),
  });
  Logger.log('Script properties set. Remove credentials from source if you pasted them above.');
}
