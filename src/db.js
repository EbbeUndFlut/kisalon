// Connection-Pool für MySQL. Alle Abfragen laufen über pool.execute()
// bzw. connection.execute() mit ?-Platzhaltern (Prepared Statements).
import mysql from 'mysql2/promise';
import config from './config.js';

export const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 10,
  // DATETIME/DATE als Text liefern ("2026-11-17 09:00:00"), damit keine
  // Zeitzonen-Umrechnung durch JavaScript-Date-Objekte passiert.
  dateStrings: true,
  // DECIMAL als Zahl statt als String
  decimalNumbers: true,
  charset: 'utf8mb4',
});

/**
 * Führt fn(connection) in einer Transaktion aus.
 * READ COMMITTED: Prüfabfragen nach einer Sperre sehen garantiert den
 * zuletzt bestätigten Stand (wichtig gegen Doppelbuchungen, R-02).
 */
export async function transaktion(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await conn.beginTransaction();
    const ergebnis = await fn(conn);
    await conn.commit();
    return ergebnis;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}