-- Add INSERT policy for doctors table so doctors can create their own profile
CREATE POLICY "Doctors can create their own profile"
ON public.doctors
FOR INSERT
WITH CHECK (auth.uid() = profile_id);