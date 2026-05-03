-- Veterinarian role, pet sharing, vet-only notes, and audit trail.

ALTER TABLE users
  ADD COLUMN is_vet TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active,
  ADD COLUMN vet_license_id VARCHAR(64) NULL AFTER is_vet;

CREATE TABLE IF NOT EXISTS pet_vet_shares (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  pet_id INT UNSIGNED NOT NULL,
  owner_user_id BIGINT UNSIGNED NOT NULL,
  vet_user_id BIGINT UNSIGNED NOT NULL,
  allow_medical_notes TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pet_vet (pet_id, vet_user_id),
  CONSTRAINT fk_pvs_pet FOREIGN KEY (pet_id) REFERENCES pets (id) ON DELETE CASCADE,
  CONSTRAINT fk_pvs_owner FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_pvs_vet FOREIGN KEY (vet_user_id) REFERENCES users (id) ON DELETE CASCADE,
  KEY idx_pvs_vet (vet_user_id),
  KEY idx_pvs_owner (owner_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vet_health_notes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  pet_id INT UNSIGNED NOT NULL,
  vet_user_id BIGINT UNSIGNED NOT NULL,
  note_kind VARCHAR(32) NOT NULL DEFAULT 'observation',
  body TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_vhn_pet FOREIGN KEY (pet_id) REFERENCES pets (id) ON DELETE CASCADE,
  CONSTRAINT fk_vhn_vet FOREIGN KEY (vet_user_id) REFERENCES users (id) ON DELETE CASCADE,
  KEY idx_vhn_pet (pet_id),
  KEY idx_vhn_vet (vet_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  action VARCHAR(64) NOT NULL,
  entity_type VARCHAR(32) NOT NULL,
  entity_id VARCHAR(64) NULL,
  detail TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  KEY idx_audit_user (user_id),
  KEY idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
