-- Admin flag: full cross-tenant visibility and deletes are limited to admins in the app.

ALTER TABLE users
  ADD COLUMN is_admin TINYINT(1) NOT NULL DEFAULT 0 AFTER bio;

-- Optional: promote the seeded demo account so you can sign in as admin (password from 002 migration).
UPDATE users SET is_admin = 1 WHERE email = 'admin@petcare.com' LIMIT 1;
