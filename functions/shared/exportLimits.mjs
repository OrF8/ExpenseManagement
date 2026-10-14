// Conservative bounds for a single callable response and ExcelJS's in-memory
// browser workbook. These are all-or-error limits, never truncation thresholds.
export const EXPORT_LIMITS = Object.freeze({ boards: 1000, transactions: 20000, bytes: 6 * 1024 * 1024 });
export const EXPORT_TOO_LARGE = 'הייצוא גדול מדי לקובץ אחד. יש לייצא לוחות משנה בנפרד. לא נוצר קובץ חלקי.';
