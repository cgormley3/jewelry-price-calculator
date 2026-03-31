/** RFC 4180-style CSV field quoting for export rows. */
export function escapeCsvField(value: string | number | boolean): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function rowToCsvLine(fields: string[]): string {
  return fields.map(escapeCsvField).join(',');
}
