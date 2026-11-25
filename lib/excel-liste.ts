import * as XLSX from 'xlsx';

// Excel-Datei (.xlsx) aus Tabellenblättern. Zahlen bleiben Zahlen (rechenbar), Text bleibt Text.
export interface Blatt { name: string; kopf: string[]; zeilen: (string | number | null)[][] }

export function excelDatei(blaetter: Blatt[]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const b of blaetter) {
    const ws = XLSX.utils.aoa_to_sheet([b.kopf, ...b.zeilen]);
    ws['!cols'] = b.kopf.map((k, i) => ({ wch: Math.min(50, Math.max(k.length, ...b.zeilen.map(z => String(z[i] ?? '').length)) + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, b.name.slice(0, 31));
  }
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

export function ladeExcel(dateiname: string, blaetter: Blatt[]) {
  const blob = new Blob([excelDatei(blaetter)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = dateiname;
  a.click();
}
