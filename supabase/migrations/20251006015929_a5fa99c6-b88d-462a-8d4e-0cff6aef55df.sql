-- Allow everyone to view profiles of doctors (for displaying doctor names)
CREATE POLICY "Everyone can view doctor profiles"
ON public.profiles
FOR SELECT
USING (
  id IN (
    SELECT profile_id FROM public.doctors
  )
);