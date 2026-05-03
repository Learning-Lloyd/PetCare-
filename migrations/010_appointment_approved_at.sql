-- When the veterinarian accepted the booking (Confirmed from Pending).

ALTER TABLE appointments
  ADD COLUMN approved_at DATETIME NULL AFTER created_at;

-- Approximate legacy approvals (vet accepted before this column existed).
UPDATE appointments
SET approved_at = created_at
WHERE approved_at IS NULL
  AND status IN ('Confirmed', 'Completed', 'Missed');
