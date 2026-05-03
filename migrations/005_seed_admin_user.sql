-- Ensure an admin account exists for the admin dashboard.
-- Email: admin@petcare.com
-- Password: password123

INSERT INTO users (email, password_hash, name, avatar_url, bio, is_admin)
VALUES (
  'admin@petcare.com',
  '$2b$10$qma1fRCmWzkpUiKF2A.KqO9MsIFCDXYMSz/HFI3D.yTk29Sk9ghs.',
  'Admin',
  NULL,
  'System administrator',
  1
)
ON DUPLICATE KEY UPDATE
  is_admin = 1,
  email = email;

