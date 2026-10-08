import specifications from '../data/campaignColumnsSpecifications.json';

interface ColumnDefinition {
  index?: number;
  field?: string;
  name?: string;
}

type ColumnMap = Record<string, string | ColumnDefinition>;

export interface ResolvedCampaignColumn {
  letter: string;
  index: number;
  field: string;
  name: string;
}

function columnLetterToIndex(letter: string): number {
  return letter.toUpperCase().split('').reduce((value, char) => value * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function decodeColumns(columns: ColumnMap | undefined): ResolvedCampaignColumn[] {
  if (!columns) return [];
  return Object.entries(columns).map(([letter, definition]) => {
    if (typeof definition !== 'string') {
      return {
        letter,
        index: definition.index ?? columnLetterToIndex(letter),
        field: definition.field || '',
        name: definition.name || definition.field || ''
      };
    }
    const separator = definition.indexOf('|');
    return {
      letter,
      index: columnLetterToIndex(letter),
      field: separator >= 0 ? definition.slice(0, separator) : definition,
      name: separator >= 0 ? definition.slice(separator + 1) : definition
    };
  });
}

export class CampaignColumnsSpecificationService {
  static getSpreadsheetId(year: number): string | undefined {
    const source = specifications.files.Analyse_Jury_Salaires as any;
    return source.campaignYears?.[String(year)]?.spreadsheetId;
  }

  static getSheetAliases(sheet: 'Analyse_Jury' | 'TJ_Cible'): string[] {
    const definition = specifications.files.Analyse_Jury_Salaires.sheets[sheet] as any;
    return definition.aliases ? [...definition.aliases] : [sheet, sheet.replace('_', ' ')];
  }

  static getColumns(sheet: 'Analyse_Jury' | 'TJ_Cible', year: number): ResolvedCampaignColumn[] {
    const years = specifications.files.Analyse_Jury_Salaires.sheets[sheet].campaignYears as Record<string, any>;
    const yearKey = sheet === 'Analyse_Jury'
      ? (year <= 2022 ? '2022_and_earlier' : String(year))
      : (year <= 2023 ? '2022_and_2023' : '2024_and_2025');
    const yearDefinition = years[yearKey];
    const resolvedDefinition = yearDefinition?.mapping ? years[yearDefinition.mapping] : yearDefinition;
    return decodeColumns(resolvedDefinition?.columns as ColumnMap | undefined);
  }

  static getColumnIndex(sheet: 'Analyse_Jury' | 'TJ_Cible', year: number, field: string): number {
    return this.getColumns(sheet, year).find(column => column.field === field)?.index ?? -1;
  }

  static getStaticColumns(file: 'BDD_LL_New_Drive' | 'Vues_LL_NEW_DRIVE', sheet: 'Profil' | 'Vue_Meteo'): ResolvedCampaignColumn[] {
    const source = (specifications.files as any)[file];
    return decodeColumns(source?.sheets?.[sheet]?.columns as ColumnMap | undefined);
  }

  static getStaticColumnIndex(file: 'BDD_LL_New_Drive' | 'Vues_LL_NEW_DRIVE', sheet: 'Profil' | 'Vue_Meteo', field: string): number {
    return this.getStaticColumns(file, sheet).find(column => column.field === field)?.index ?? -1;
  }

  static getDriveResolution(file: 'Primes' | 'Bilans_Annuels') {
    return (specifications.files as any)[file];
  }
}
