export type SheetPurpose = 
  | 'IMPORT_ACCOUNTS'
  | 'EXPORT_SALARY_DELIBERATIONS'
  | 'IMPORT_CLIENT_FEEDBACK'
  | 'IMPORT_OBJECTIVES'
  | 'CUSTOM_IMPORT'
  | 'CUSTOM_EXPORT';

export interface ColumnDefinition {
  header?: string;
  name?: string;
  explanation?: string;
  description?: string;
  required?: boolean;
}

export interface TabConfig {
  purpose: SheetPurpose | string;
  description?: string;
  headerRow?: number;
  columns: Record<string, ColumnDefinition>;
}

export interface SpreadsheetDefinition {
  name: string;
  spreadsheetId: string;
  description?: string;
  tabs: Record<string, TabConfig>;
}

export interface GoogleSheetsConfigFile {
  $schema_version?: string;
  defaultSpreadsheetId?: string;
  spreadsheets: Record<string, SpreadsheetDefinition>;
}
