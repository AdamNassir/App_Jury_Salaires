import { parseCsv, type SourceTable, type TableKind, normalize } from './importModel';
import config from '../../google-sheets-config.json';

export async function readSourceFile(file: File, csvKind: TableKind): Promise<SourceTable[]> {
  if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name} dépasse 25 Mo.`);
  if (/\.csv$/i.test(file.name)) return [{ kind: csvKind, file: file.name, sheet: file.name, rows: parseCsv(await file.text()) }];
  if (!/\.xlsx$/i.test(file.name)) throw new Error('Utiliser un fichier .xlsx ou .csv.');
  const excel = await import('exceljs'); const Workbook = excel.Workbook || excel.default.Workbook; const workbook = new Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const names: Record<string, TableKind> = (config as any).campaignImports?.sheetKinds || {};
  const tables: SourceTable[] = [];
  workbook.eachSheet(sheet => {
    const kind = Object.entries(names).find(([name]) => normalize(name) === normalize(sheet.name))?.[1]
      || (/^evaluations? campagne \d{4}$/.test(normalize(sheet.name)) ? 'evaluations' : undefined);
    if (!kind) return;
    const rows: string[][] = [];
    sheet.eachRow({ includeEmpty: true }, row => {
      const values: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        let v: any = cell.value;
        if (v && typeof v === 'object' && ('formula' in v || 'sharedFormula' in v)) v = v.result;
        if (typeof v === 'number' && cell.numFmt?.includes('%')) v = v * 100;
        if (v instanceof Date) v = v.toISOString().slice(0, 10);
        else if (v && typeof v === 'object' && v.richText) v = v.richText.map((r: any) => r.text).join('');
        else if (v && typeof v === 'object' && v.hyperlink) v = v.hyperlink;
        else if (v && typeof v === 'object' && v.error) v = v.error;
        values[col - 1] = String(v ?? '');
      }); rows.push(Array.from({ length: values.length }, (_, i) => values[i] || ''));
    });
    tables.push({ kind, file: file.name, sheet: sheet.name, rows });
  });
  if (!tables.length) throw new Error(`${file.name} : aucun onglet reconnu (voir google-sheets-config.json).`);
  return tables;
}
