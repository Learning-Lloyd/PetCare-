-- Store health record file attachments as JSON array of URL paths (e.g. ["/uploads/health-records/..."]).
ALTER TABLE health_records
  ADD COLUMN attachments_json JSON NULL AFTER notes;
