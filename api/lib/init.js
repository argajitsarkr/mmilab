const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'db', 'mmilab.db');

function initDB() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // ── Create Tables ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('pi','scholar')),
      photo_url TEXT DEFAULT '',
      must_change_password INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bacterial_inventory (
      Vial_ID TEXT PRIMARY KEY,
      Organism TEXT NOT NULL,
      Phenotype_Notes TEXT DEFAULT '',
      Stock_Type TEXT NOT NULL CHECK(Stock_Type IN ('Master', 'Working')),
      Freezer_Location TEXT DEFAULT '',
      Status TEXT DEFAULT 'Available' CHECK(Status IN ('Available', 'In Use', 'Depleted')),
      Date_Frozen DATETIME DEFAULT CURRENT_TIMESTAMP,
      added_by INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS stock_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vial_id TEXT REFERENCES bacterial_inventory(Vial_ID),
      user_id INTEGER REFERENCES users(id),
      action TEXT NOT NULL CHECK(action IN ('checkout','checkin','depleted','added')),
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      notes TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS scholar_profiles (
      user_id INTEGER PRIMARY KEY REFERENCES users(id),
      enrollment_date TEXT DEFAULT '',
      research_topic TEXT DEFAULT '',
      milestones TEXT DEFAULT '[]',
      current_experiments TEXT DEFAULT '',
      notes TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      funding_agency TEXT DEFAULT '',
      start_date TEXT DEFAULT '',
      end_date TEXT DEFAULT '',
      status TEXT DEFAULT 'active' CHECK(status IN ('active','completed','upcoming')),
      description TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mimetype TEXT NOT NULL,
      size INTEGER NOT NULL,
      uploader_id INTEGER REFERENCES users(id),
      upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      tag TEXT DEFAULT 'Uncategorized',
      is_public INTEGER DEFAULT 0
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS document_search USING fts5(
      document_id UNINDEXED,
      content,
      tokenize='porter'
    );

    CREATE TABLE IF NOT EXISTS project_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER REFERENCES projects(id),
      user_id INTEGER REFERENCES users(id),
      role_in_project TEXT DEFAULT 'member',
      UNIQUE(project_id, user_id)
    );
  `);

  // ── Migrations: add columns safely ──
  try { db.exec('ALTER TABLE users ADD COLUMN must_change_password INTEGER DEFAULT 0'); } catch(e) { /* column already exists */ }
  try { db.exec('ALTER TABLE documents ADD COLUMN project_id INTEGER REFERENCES projects(id)'); } catch(e) { /* column already exists */ }
  try { db.exec('ALTER TABLE documents ADD COLUMN folder TEXT DEFAULT ""'); } catch(e) { /* column already exists */ }

  // ── Migrations table ──
  db.exec("CREATE TABLE IF NOT EXISTS _migrations (key TEXT PRIMARY KEY)");

  // ── One-time: set individual permanent passwords from .env (runs once) ──
  // Passwords are stored ONLY in .env (gitignored), never in source code.
  // Format in .env: USER_PASSWORDS=email1:pass1,email2:pass2,...
  const pwMigration = 'individual_passwords_v2';
  if (!db.prepare("SELECT key FROM _migrations WHERE key = ?").get(pwMigration)) {
    const pwEnv = process.env.USER_PASSWORDS || '';
    if (pwEnv) {
      console.log('MIGRATION: Setting individual passwords from .env ...');
      const updatePw = db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE email = ?');
      const setPasswords = db.transaction(() => {
        for (const entry of pwEnv.split(',')) {
          const [email, pw] = entry.trim().split(':');
          if (email && pw) {
            updatePw.run(bcrypt.hashSync(pw, 10), email);
            console.log(`  ✓ Password set for ${email}`);
          }
        }
      });
      setPasswords();
      db.prepare("INSERT OR IGNORE INTO _migrations (key) VALUES (?)").run(pwMigration);
      console.log('MIGRATION DONE: Individual passwords set. No forced reset.');
    } else {
      console.log('SKIP: USER_PASSWORDS not found in .env — passwords unchanged.');
    }
  }

  // ── Seed Users if empty ──
  // Passwords come from USER_PASSWORDS in .env (gitignored). Falls back to 'ChangeMe@2026'.
  // Database persists on Docker volume — seed only runs on first-ever launch.
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (userCount === 0) {
    console.log('Seeding default users...');
    // Build password lookup from .env
    const pwLookup = {};
    for (const entry of (process.env.USER_PASSWORDS || '').split(',')) {
      const [email, pw] = entry.trim().split(':');
      if (email && pw) pwLookup[email] = pw;
    }
    const fallbackPw = 'ChangeMe@2026';

    const insertUser = db.prepare('INSERT INTO users (name, email, password_hash, role, photo_url, must_change_password) VALUES (?, ?, ?, ?, ?, 0)');
    const insertProfile = db.prepare('INSERT INTO scholar_profiles (user_id, enrollment_date, research_topic) VALUES (?, ?, ?)');

    const users = [
      { name: 'Dr. Surajit Bhattacharjee', email: 'sbhattacharjee@gmail.com', role: 'pi', photo: 'assets/team/surajit-bhattacharjee.jpg' },
      { name: 'Mr. Suman Paul', email: 'sumanpaul93udp@gmail.com', role: 'scholar', photo: 'assets/team/suman-paul.jpeg' },
      { name: 'Mr. Argajit Sarkar', email: 'argajit05@gmail.com', role: 'scholar', photo: 'assets/team/argajit-sarkar.jpg' },
      { name: 'Mr. Debajyoti Datta', email: 'debajyotidatta14@gmail.com', role: 'scholar', photo: 'assets/team/debajyoti-datta.jpg' },
      { name: 'Ms. Moumita Debnath', email: 'iammou2001@gmail.com', role: 'scholar', photo: 'assets/team/moumita-debnath.jpg' },
      { name: 'Ms. Barsha Ghosh', email: 'barshaghosh5023@gmail.com', role: 'scholar', photo: 'assets/team/barsha-ghosh.jpeg' },
      { name: 'Ms. Diptani Saha', email: 'diptani24@gmail.com', role: 'scholar', photo: 'assets/team/diptani-saha.jpeg' },
      { name: 'Ms. Sanchari Pal', email: 'thesanchari@gmail.com', role: 'scholar', photo: 'assets/team/sanchari-pal.jpeg' },
    ];

    const insertMany = db.transaction(() => {
      for (const u of users) {
        const pw = pwLookup[u.email] || fallbackPw;
        const hash = bcrypt.hashSync(pw, 10);
        const result = insertUser.run(u.name, u.email, hash, u.role, u.photo);
        if (u.role === 'scholar') {
          insertProfile.run(result.lastInsertRowid, '', '');
        }
      }
    });
    insertMany();
    console.log(`Seeded ${users.length} users.`);

    // ── Seed Sample Strains ──
    console.log('Seeding sample inventory...');
    const insertStrain = db.prepare(`INSERT INTO bacterial_inventory (Vial_ID, Organism, Phenotype_Notes, Stock_Type, Freezer_Location, Status, added_by) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    const insertLog = db.prepare('INSERT INTO stock_log (vial_id, user_id, action, notes) VALUES (?, ?, ?, ?)');

    const inventory = [
      { id: 'SA-01-M', org: 'Staphylococcus aureus ATCC 25923', notes: 'Reference strain for AST', type: 'Master', loc: 'Box W1 - A1', status: 'Available' },
      { id: 'VC-01-M', org: 'Vibrio cholerae O1 El Tor', notes: 'Clinical isolate, CIP-R, TET-R', type: 'Master', loc: 'Box W2 - B1', status: 'Available' },
      { id: 'VC-01-W', org: 'Vibrio cholerae O1 El Tor', notes: 'Ampicillin Res, High Biofilm', type: 'Working', loc: 'Box W1 - A2', status: 'Available' },
      { id: 'VC-02-W', org: 'Vibrio cholerae O1 El Tor', notes: 'Quercetin Susceptible', type: 'Working', loc: 'Box W1 - A3', status: 'Available' },
      { id: 'AB-01-M', org: 'Acinetobacter baumannii', notes: 'MDR Isolate', type: 'Master', loc: 'Box M1 - A1', status: 'Available' },
      { id: 'KP-01-W', org: 'Klebsiella pneumoniae', notes: 'Carbapenem-resistant, CRB-R', type: 'Working', loc: 'Box W2 - C4', status: 'In Use' }
    ];

    const seedInventory = db.transaction(() => {
      for (const item of inventory) {
        insertStrain.run(item.id, item.org, item.notes, item.type, item.loc, item.status, 1);
        insertLog.run(item.id, 1, 'added', 'Initial stock entry');
      }
    });
    seedInventory();
    console.log(`Seeded ${inventory.length} sample inventory items.`);
  }

  return db;
}

module.exports = { initDB, DB_PATH };
