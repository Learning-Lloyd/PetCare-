-- Fixes demo user password if migration 002 used a bad bcrypt hash (password: password123).
UPDATE users
SET password_hash = '$2b$10$qma1fRCmWzkpUiKF2A.KqO9MsIFCDXYMSz/HFI3D.yTk29Sk9ghs.'
WHERE email = 'ken@petcare.com';
