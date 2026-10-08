-- Multi-sede (ADM-08): los grupos existentes quedan en la sede más antigua de su escuela.
UPDATE groups g
SET venue_id = (SELECT v.id FROM venues v WHERE v.school_id = g.school_id ORDER BY v.created_at LIMIT 1)
WHERE g.venue_id IS NULL;
