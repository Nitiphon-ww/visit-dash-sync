-- Add patient_name to queue_bookings to avoid exposing profiles table
ALTER TABLE public.queue_bookings ADD COLUMN patient_name TEXT;

-- Populate existing bookings with patient names
UPDATE public.queue_bookings qb
SET patient_name = p.full_name
FROM public.profiles p
WHERE qb.patient_id = p.id;

-- Make patient_name NOT NULL after populating
ALTER TABLE public.queue_bookings ALTER COLUMN patient_name SET DEFAULT 'Patient';
ALTER TABLE public.queue_bookings ALTER COLUMN patient_name SET NOT NULL;

-- Drop the policy that exposes patient profiles to doctors
DROP POLICY IF EXISTS "Doctors can view their patients' profiles" ON public.profiles;