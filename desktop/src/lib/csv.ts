const NEEDS_QUOTES = /[",;\r\n]/
const FORMULA_START = /^[=+\-@\t\r]/

function cell(value: string | number): string {
  if (typeof value === 'number') return String(value)
  const text = FORMULA_START.test(value) ? `'${value}` : value
  return NEEDS_QUOTES.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function toCsv(rows: readonly (readonly (string | number)[])[]): string {
  return `\uFEFF${rows.map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`
}
