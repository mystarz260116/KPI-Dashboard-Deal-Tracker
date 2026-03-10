import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("kpi_app.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT,
    name TEXT,
    department TEXT
  );

  CREATE TABLE IF NOT EXISTS clinics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT
  );

  CREATE TABLE IF NOT EXISTS deals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    clinic_id INTEGER,
    amount INTEGER,
    status TEXT, -- 'proposal', 'won'
    is_new_client BOOLEAN,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(clinic_id) REFERENCES clinics(id)
  );

  CREATE TABLE IF NOT EXISTS budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    department TEXT,
    amount INTEGER,
    period TEXT, -- '2026-03'
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

  const seedUsers = [
    { name: "寺町", dept: "①-1 高槻営業", email: "teramachi@example.com" },
    { name: "今井", dept: "①-1 高槻営業", email: "imai@example.com" },
    { name: "阪本", dept: "①-1 高槻営業", email: "sakamoto@example.com" },
    { name: "熊懐", dept: "①-1 高槻営業", email: "kumafuku@example.com" },
    { name: "川合", dept: "①-1 高槻営業", email: "kawai@example.com" },
    { name: "山田", dept: "①-1 高槻営業", email: "yamada@example.com" },
    { name: "松井", dept: "①-1 高槻営業", email: "matsui@example.com" },
    { name: "平", dept: "①-1 高槻営業", email: "taira@example.com" },
    { name: "宮川", dept: "①-1 高槻営業", email: "miyagawa@example.com" },
    { name: "小山", dept: "①-2 北浜営業", email: "koyama@example.com" },
    { name: "竹内", dept: "①-2 北浜営業", email: "takeuchi@example.com" },
    { name: "中澤", dept: "①-2 北浜営業", email: "nakazawa@example.com" },
    { name: "枡田", dept: "①-2 北浜営業", email: "masuda@example.com" },
    { name: "藤丸", dept: "①-2 北浜営業", email: "fujimaru@example.com" },
    { name: "中西", dept: "①-2 北浜営業", email: "nakanishi@example.com" },
    { name: "片山", dept: "①-2 北浜営業", email: "katayama@example.com" },
    { name: "山本", dept: "①-2 北浜営業", email: "yamamoto@example.com" },
    { name: "権藤", dept: "②-1 東京営業", email: "gondo@example.com" },
    { name: "浦上", dept: "②-1 東京営業", email: "urakami@example.com" },
    { name: "井出", dept: "②-1 東京営業", email: "ide@example.com" },
    { name: "茂田", dept: "②-1 東京営業", email: "shigeta@example.com" },
    { name: "熊木", dept: "②-1 東京営業", email: "kumaki@example.com" },
    { name: "山口", dept: "②-1 東京営業", email: "yamaguchi@example.com" },
    { name: "小野寺", dept: "②-1 東京営業", email: "onodera@example.com" },
    { name: "工藤", dept: "②-1 東京営業", email: "kudo@example.com" },
  ];

  const insertUser = db.prepare("INSERT OR IGNORE INTO users (email, password, name, department) VALUES (?, ?, ?, ?)");
  seedUsers.forEach(u => insertUser.run(u.email, "password", u.name, u.dept));

  const clinicCount = db.prepare("SELECT count(*) as count FROM clinics").get() as { count: number };
  if (clinicCount.count === 0) {
    db.prepare("INSERT INTO clinics (name) VALUES (?)").run("ひまわり歯科");
    db.prepare("INSERT INTO clinics (name) VALUES (?)").run("さくら医院");
  }

  // Seed some deals for the first user
  db.prepare("INSERT INTO deals (user_id, clinic_id, amount, status, is_new_client, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    1, 1, 500000, 'won', 0, '2026-03-01'
  );
  db.prepare("INSERT INTO deals (user_id, clinic_id, amount, status, is_new_client, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    1, 2, 300000, 'proposal', 1, '2026-03-02'
  );

  // Seed budgets
  db.prepare("INSERT INTO budgets (user_id, amount, period) VALUES (?, ?, ?)").run(1, 1000000, '2026-03');
  db.prepare("INSERT INTO budgets (department, amount, period) VALUES (?, ?, ?)").run('①大阪営業部', 5000000, '2026-03');

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Auth API
  app.post("/api/login", (req, res) => {
    const { email, password } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE email = ? AND password = ?").get(email, password);
    if (user) {
      res.json({ user });
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
  });

  app.post("/api/signup", (req, res) => {
    const { email, password, name, department } = req.body;
    try {
      const info = db.prepare("INSERT INTO users (email, password, name, department) VALUES (?, ?, ?, ?)").run(email, password, name, department);
      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid);
      res.json({ user });
    } catch (e) {
      res.status(400).json({ error: "Email already exists" });
    }
  });

  // KPI API
  app.get("/api/kpi", (req, res) => {
    const from = req.query.from as string;
    const to = req.query.to as string;
    const granularity = req.query.granularity as string;
    const department = req.query.department as string;
    const userId = req.query.userId as string;
    
    // Basic implementation of KPI aggregation
    // In a real app, this would be more complex SQL
    let whereClause = "WHERE created_at BETWEEN ? AND ?";
    const params: any[] = [from, to];

    if (granularity === 'department' && department) {
      whereClause += " AND user_id IN (SELECT id FROM users WHERE department = ?)";
      params.push(department);
    } else if (granularity === 'individual' && userId) {
      whereClause += " AND user_id = ?";
      params.push(userId);
    }

    const sales = db.prepare(`SELECT SUM(amount) as total FROM deals ${whereClause} AND status = 'won'`).get(...params) as { total: number };
    const proposals = db.prepare(`SELECT COUNT(*) as count FROM deals ${whereClause} AND status = 'proposal'`).get(...params) as { count: number };
    const wonCount = db.prepare(`SELECT COUNT(*) as count FROM deals ${whereClause} AND status = 'won'`).get(...params) as { count: number };
    
    const existingSales = db.prepare(`SELECT SUM(amount) as total FROM deals ${whereClause} AND status = 'won' AND is_new_client = 0`).get(...params) as { total: number };
    const newSales = db.prepare(`SELECT SUM(amount) as total FROM deals ${whereClause} AND status = 'won' AND is_new_client = 1`).get(...params) as { total: number };

    // Ranking
    const rankings = db.prepare(`
      SELECT u.name, COUNT(d.id) as count 
      FROM deals d 
      JOIN users u ON d.user_id = u.id 
      ${whereClause} AND d.status = 'won'
      GROUP BY u.id 
      ORDER BY count DESC
    `).all(...params);

    // Budget
    let budgetWhere = "WHERE period = ?";
    const budgetParams = [(from as string).substring(0, 7)];
    if (granularity === 'department') {
      budgetWhere += " AND department = ?";
      budgetParams.push(department);
    } else if (granularity === 'individual') {
      budgetWhere += " AND user_id = ?";
      budgetParams.push(userId);
    } else {
      budgetWhere += " AND user_id IS NULL AND department IS NULL"; // Global budget logic
    }
    
    const budget = db.prepare(`SELECT SUM(amount) as total FROM budgets ${budgetWhere}`).get(...budgetParams) as { total: number };

    res.json({
      sales: sales.total || 0,
      budget: budget?.total || 1000000, // fallback
      proposals: proposals.count || 0,
      wonCount: wonCount.count || 0,
      existingSales: existingSales.total || 0,
      newSales: newSales.total || 0,
      rankings
    });
  });

  // Clinics API
  app.get("/api/clinics", (req, res) => {
    const { q } = req.query;
    const clinics = db.prepare("SELECT * FROM clinics WHERE name LIKE ?").all(`%${q}%`);
    res.json(clinics);
  });

  app.post("/api/clinics", (req, res) => {
    const { name } = req.body;
    const info = db.prepare("INSERT INTO clinics (name) VALUES (?)").run(name);
    const clinic = db.prepare("SELECT * FROM clinics WHERE id = ?").get(info.lastInsertRowid);
    res.json(clinic);
  });

  // Deals API
  app.get("/api/deals", (req, res) => {
    const userId = req.query.userId as string | undefined;

    let query = `
      SELECT
        d.id,
        d.user_id,
        u.name as user_name,
        u.department,
        d.clinic_id,
        c.name as clinic_name,
        c.address as clinic_address,
        d.amount,
        d.status,
        d.is_new_client,
        d.created_at
      FROM deals d
      JOIN users u ON d.user_id = u.id
      JOIN clinics c ON d.clinic_id = c.id
    `;

    const params: Array<string | number> = [];

    if (userId) {
      query += ` WHERE d.user_id = ?`;
      params.push(userId);
    }

    query += ` ORDER BY d.created_at DESC`;

    const deals = db.prepare(query).all(...params);
    res.json(deals);
  });
  app.post("/api/deals", (req, res) => {
    const { userId, clinicId, amount, status, isNewClient } = req.body;
    db.prepare("INSERT INTO deals (user_id, clinic_id, amount, status, is_new_client) VALUES (?, ?, ?, ?, ?)").run(
      userId, clinicId, amount, status, isNewClient ? 1 : 0
    );
    res.json({ success: true });
  });

  // Users API
  app.get("/api/users", (req, res) => {
    const users = db.prepare("SELECT id, name, department FROM users").all();
    res.json(users);
  });

  // Export API
  app.get("/api/export/deals", (req, res) => {
    const deals = db.prepare(`
      SELECT 
        d.id, 
        u.name as user_name, 
        c.name as clinic_name, 
        d.amount, 
        d.status, 
        d.is_new_client, 
        d.created_at 
      FROM deals d
      JOIN users u ON d.user_id = u.id
      JOIN clinics c ON d.clinic_id = c.id
      ORDER BY d.created_at DESC
    `).all();

    const headers = ["ID", "担当者", "医院名", "金額", "ステータス", "新規/既存", "登録日時"];
    const rows = deals.map((d: any) => [
      d.id,
      d.user_name,
      d.clinic_name,
      d.amount,
      d.status === 'won' ? '受注' : '提案中',
      d.is_new_client ? '新規' : '既存',
      d.created_at
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.join(","))
    ].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=deals_export.csv");
    res.send("\uFEFF" + csvContent); // Add BOM for Excel
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
