-- Auth, sessions, password reset, and full app domain (matches src/types).

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(120) NOT NULL,
  avatar_url VARCHAR(512) NULL,
  bio TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  token_sha256 CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_auth_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  UNIQUE KEY uq_auth_sessions_token (token_sha256),
  KEY idx_auth_sessions_user (user_id),
  KEY idx_auth_sessions_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  token_sha256 CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pwd_reset_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  KEY idx_pwd_reset_token (token_sha256)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE pets
  ADD COLUMN user_id BIGINT UNSIGNED NULL AFTER id,
  ADD COLUMN pet_type VARCHAR(32) NULL AFTER name,
  ADD COLUMN breed VARCHAR(120) NULL AFTER pet_type,
  ADD COLUMN age_years TINYINT UNSIGNED NULL AFTER breed,
  ADD COLUMN weight_kg DECIMAL(6, 2) NULL AFTER age_years,
  ADD COLUMN health_condition VARCHAR(200) NULL AFTER weight_kg,
  ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT 'Active' AFTER health_condition,
  ADD COLUMN photo_url VARCHAR(512) NULL AFTER status,
  ADD COLUMN last_checkup DATE NULL AFTER photo_url,
  ADD COLUMN next_vaccine DATE NULL AFTER last_checkup;

ALTER TABLE pets
  ADD CONSTRAINT fk_pets_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  ADD KEY idx_pets_user_id (user_id);

ALTER TABLE health_records
  ADD COLUMN record_type VARCHAR(40) NOT NULL DEFAULT 'Check-up' AFTER pet_id,
  ADD COLUMN pet_name VARCHAR(120) NULL AFTER record_type;

CREATE TABLE IF NOT EXISTS vaccinations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  pet_id INT UNSIGNED NOT NULL,
  pet_name VARCHAR(120) NOT NULL,
  vaccine_name VARCHAR(160) NOT NULL,
  date_given DATE NOT NULL,
  next_due_date DATE NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'Pending',
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_vaccinations_pet FOREIGN KEY (pet_id) REFERENCES pets (id) ON DELETE CASCADE,
  KEY idx_vaccinations_pet (pet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS feeding_schedules (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  pet_id INT UNSIGNED NOT NULL,
  pet_name VARCHAR(120) NOT NULL,
  time_of_day VARCHAR(16) NOT NULL,
  portion_size VARCHAR(64) NOT NULL,
  food_type VARCHAR(160) NOT NULL,
  completed TINYINT(1) NOT NULL DEFAULT 0,
  days_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_feeding_pet FOREIGN KEY (pet_id) REFERENCES pets (id) ON DELETE CASCADE,
  KEY idx_feeding_pet (pet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS exercise_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  pet_id INT UNSIGNED NOT NULL,
  pet_name VARCHAR(120) NOT NULL,
  exercise_type VARCHAR(32) NOT NULL,
  duration_minutes SMALLINT UNSIGNED NOT NULL,
  calories_burned SMALLINT UNSIGNED NULL,
  log_date DATE NOT NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_exercise_pet FOREIGN KEY (pet_id) REFERENCES pets (id) ON DELETE CASCADE,
  KEY idx_exercise_pet (pet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reminders (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  pet_id INT UNSIGNED NULL,
  pet_name VARCHAR(120) NULL,
  reminder_type VARCHAR(32) NOT NULL,
  title VARCHAR(200) NOT NULL,
  reminder_date DATE NOT NULL,
  reminder_time VARCHAR(16) NULL,
  priority VARCHAR(16) NOT NULL DEFAULT 'Routine',
  completed TINYINT(1) NOT NULL DEFAULT 0,
  description TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reminders_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_reminders_pet FOREIGN KEY (pet_id) REFERENCES pets (id) ON DELETE SET NULL,
  KEY idx_reminders_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS appointments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  pet_id INT UNSIGNED NOT NULL,
  pet_name VARCHAR(120) NOT NULL,
  reason VARCHAR(255) NOT NULL,
  appt_date DATE NOT NULL,
  appt_time VARCHAR(16) NOT NULL,
  notes TEXT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'Scheduled',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_appointments_pet FOREIGN KEY (pet_id) REFERENCES pets (id) ON DELETE CASCADE,
  KEY idx_appointments_pet (pet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS activities (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  activity_type VARCHAR(32) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  pet_name VARCHAR(120) NOT NULL,
  occurred_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_activities_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  KEY idx_activities_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  notif_type VARCHAR(16) NOT NULL DEFAULT 'info',
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  KEY idx_notifications_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Demo account (password: password123) — same as former mock login; register other users via API.
INSERT INTO users (email, password_hash, name, avatar_url, bio)
VALUES (
  'ken@petcare.com',
  '$2b$10$qma1fRCmWzkpUiKF2A.KqO9MsIFCDXYMSz/HFI3D.yTk29Sk9ghs.',
  'Ken',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Ken',
  'Pet lover and dedicated owner'
)
ON DUPLICATE KEY UPDATE email = email;
