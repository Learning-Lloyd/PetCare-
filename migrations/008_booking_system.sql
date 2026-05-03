-- Pet–vet appointment booking: vet assignment, statuses, reschedule fields, slot settings.

CREATE TABLE IF NOT EXISTS vet_booking_settings (
  vet_user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  day_start TIME NOT NULL DEFAULT '09:00:00',
  day_end TIME NOT NULL DEFAULT '17:00:00',
  slot_minutes INT UNSIGNED NOT NULL DEFAULT 30,
  CONSTRAINT fk_vbs_vet FOREIGN KEY (vet_user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO vet_booking_settings (vet_user_id)
SELECT id FROM users WHERE is_vet = 1;

ALTER TABLE appointments
  ADD COLUMN vet_user_id BIGINT UNSIGNED NULL AFTER pet_id,
  ADD COLUMN owner_user_id BIGINT UNSIGNED NULL AFTER vet_user_id,
  ADD COLUMN proposed_appt_date DATE NULL AFTER appt_time,
  ADD COLUMN proposed_appt_time VARCHAR(16) NULL AFTER proposed_appt_date,
  ADD COLUMN vet_notes TEXT NULL AFTER notes;

UPDATE appointments a
INNER JOIN pets p ON a.pet_id = p.id
SET a.owner_user_id = p.user_id
WHERE a.owner_user_id IS NULL;

UPDATE appointments SET status = 'Confirmed' WHERE status = 'Scheduled';
UPDATE appointments SET status = 'Rejected' WHERE status = 'Cancelled';

ALTER TABLE appointments
  MODIFY COLUMN status VARCHAR(24) NOT NULL DEFAULT 'Pending';

ALTER TABLE appointments
  ADD CONSTRAINT fk_appt_vet FOREIGN KEY (vet_user_id) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE appointments
  ADD CONSTRAINT fk_appt_owner FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE CASCADE;

CREATE INDEX idx_appt_vet_slot ON appointments (vet_user_id, appt_date, appt_time);
CREATE INDEX idx_appt_owner ON appointments (owner_user_id);
