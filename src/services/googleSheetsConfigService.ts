import rawConfig from '../../google-sheets-config.json';
import { GoogleSheetsConfigFile, SpreadsheetDefinition, TabConfig } from '../types/googleSheetsConfig';

const config: GoogleSheetsConfigFile = rawConfig as GoogleSheetsConfigFile;

export class GoogleSheetsConfigService {
  /**
   * Returns the entire parsed configuration.
   */
  static getConfig(): GoogleSheetsConfigFile {
    return config;
  }

  /**
   * Returns the default spreadsheetId configured in google-sheets-config.json.
   */
  static getDefaultSpreadsheetId(): string {
    return config.defaultSpreadsheetId || '1QbvLbW39EgHCtOtj2LrrP7w1byWlkE6F5deOXOjCWmk';
  }

  /**
   * Returns a list of all registered spreadsheets.
   */
  static getAllSpreadsheets(): SpreadsheetDefinition[] {
    return Object.values(config.spreadsheets || {});
  }

  /**
   * Finds a spreadsheet definition by its ID or returns undefined.
   */
  static getSpreadsheet(spreadsheetId: string): SpreadsheetDefinition | undefined {
    if (!config.spreadsheets) return undefined;
    return config.spreadsheets[spreadsheetId];
  }

  /**
   * Finds the first tab matching a given purpose for a specific spreadsheet.
   */
  static findTabByPurpose(spreadsheetId: string, purpose: string): { tabName: string; tab: TabConfig } | undefined {
    const sheet = this.getSpreadsheet(spreadsheetId);
    if (!sheet || !sheet.tabs) return undefined;

    for (const [tabName, tab] of Object.entries(sheet.tabs)) {
      if (tab.purpose === purpose) {
        return { tabName, tab };
      }
    }
    return undefined;
  }

  /**
   * Finds any tab across all spreadsheets matching a given purpose (fallback if spreadsheetId is not supplied).
   */
  static findAnyTabByPurpose(purpose: string): { spreadsheetId: string; tabName: string; tab: TabConfig } | undefined {
    for (const [spreadsheetId, sheet] of Object.entries(config.spreadsheets || {})) {
      for (const [tabName, tab] of Object.entries(sheet.tabs || {})) {
        if (tab.purpose === purpose) {
          return { spreadsheetId, tabName, tab };
        }
      }
    }
    return undefined;
  }

  /**
   * Resolves the configured column header name for a field in a specific sheet and tab.
   */
  static getColumnHeader(spreadsheetId: string, tabName: string, fieldKey: string): string | undefined {
    const sheet = this.getSpreadsheet(spreadsheetId);
    if (!sheet?.tabs?.[tabName]?.columns?.[fieldKey]) return undefined;
    return sheet.tabs[tabName].columns[fieldKey].header || sheet.tabs[tabName].columns[fieldKey].name;
  }

  /**
   * Returns an inverted map of Header Name -> Field Key for robust header parsing.
   */
  static getHeaderToFieldMap(spreadsheetId: string, tabName: string): Map<string, string> {
    const map = new Map<string, string>();
    const sheet = this.getSpreadsheet(spreadsheetId);
    const columns = sheet?.tabs?.[tabName]?.columns;
    if (!columns) return map;

    for (const [fieldKey, colDef] of Object.entries(columns)) {
      const header = colDef.header || colDef.name;
      if (header) {
        map.set(header.trim().toLowerCase(), fieldKey);
      }
    }
    return map;
  }
}
