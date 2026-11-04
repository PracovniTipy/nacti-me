-- Načti.me – databáze D1 na Cloudflare. Spouští se při každém nasazení (je to bezpečné opakovat).

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  email TEXT,
  stripe_customer TEXT UNIQUE,
  sub_status TEXT,
  period_end INTEGER,
  created_at INTEGER NOT NULL
);

-- Přihlášená zařízení (bez hesla: token v zařízení, tady jen jeho otisk)
CREATE TABLE IF NOT EXISTS tokens (
  hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tokens_account ON tokens (account_id);

-- Krátké kódy pro přenos přihlášení na další zařízení (naskenováním QR)
CREATE TABLE IF NOT EXISTS transfers (
  code TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  expires INTEGER NOT NULL
);

-- Zaplacené Stripe platby, které už byly použity k přihlášení
CREATE TABLE IF NOT EXISTS claims (
  session_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS codes (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  target TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS codes_account ON codes (account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS scans (
  code_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  device TEXT,
  country TEXT
);
CREATE INDEX IF NOT EXISTS scans_code_at ON scans (code_id, at DESC);

-- Denní limity verze zdarma (AI návrhy, nahrávání fotek)
CREATE TABLE IF NOT EXISTS usage (
  kind TEXT NOT NULL,
  ip TEXT NOT NULL,
  day TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (kind, ip, day)
);
