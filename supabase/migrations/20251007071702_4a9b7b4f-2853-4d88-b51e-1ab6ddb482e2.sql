-- Allow doctors to view patient profiles for patients in their queue
CREATE POLICY "Doctors can view their patients' profiles"
ON public.profiles
FOR SELECT
USING (
  auth.uid() IN (
    SELECT d.profile_id
    FROM public.doctors d
    INNER JOIN public.queue_bookings qb ON qb.doctor_id = d.id
    WHERE qb.patient_id = profiles.id
  )
);