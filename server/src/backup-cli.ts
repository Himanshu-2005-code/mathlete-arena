// `npm run backup`: one backup of the database at DB_PATH into BACKUP_DIR.
import { backupDb } from "./backup";
import { BACKUP_DIR, BACKUP_KEEP, DB_PATH } from "./config";
import { openDb } from "./db";

const db = openDb(DB_PATH);
backupDb(db, BACKUP_DIR, BACKUP_KEEP)
  .then((file) => {
    console.log(`Backed up ${DB_PATH} to ${file}`);
    db.close();
  })
  .catch((err) => {
    console.error("Backup failed:", err);
    process.exit(1);
  });
