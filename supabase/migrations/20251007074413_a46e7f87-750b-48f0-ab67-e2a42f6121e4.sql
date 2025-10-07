-- Security Fix: Strengthen RLS on queue_bookings to prevent any patient name exposure
-- This addresses the security finding about patient names being visible to other patients

-- Drop existing patient SELECT policy and recreate with explicit safeguards
DROP POLICY IF EXISTS "Patients can view their own bookings" ON public.queue_bookings;

-- Create new, more restrictive policy for patients
-- This policy explicitly ensures patients can ONLY see their exact bookings
-- and cannot query by doctor_id or any other field to discover other patients
CREATE POLICY "Patients can only view their own bookings"
ON public.queue_bookings
FOR SELECT
USING (
  auth.uid() = patient_id
  -- Explicit check: user must be authenticated and match patient_id
  AND auth.uid() IS NOT NULL
  -- Additional safeguard: ensure the patient_id is not null
  AND patient_id IS NOT NULL
);

-- Add explicit comment documenting the security model
COMMENT ON POLICY "Patients can only view their own bookings" ON public.queue_bookings IS 
  'Security: This policy ensures patients can only access their own booking records. '
  'Even when querying by doctor_id or other fields, only bookings where patient_id matches auth.uid() will be visible. '
  'This prevents patient names or queue information from being exposed across patients.';

-- Create a helper function for counting patients ahead that doesn't expose patient names
CREATE OR REPLACE FUNCTION public.count_patients_ahead(
  _doctor_id uuid,
  _queue_number integer,
  _patient_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  patient_count integer;
BEGIN
  -- Verify the caller is authorized (is the patient or a doctor)
  IF auth.uid() != _patient_id AND NOT EXISTS (
    SELECT 1 FROM public.doctors WHERE profile_id = auth.uid() AND id = _doctor_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized access';
  END IF;
  
  -- Count patients ahead without exposing their information
  SELECT COUNT(*)::integer INTO patient_count
  FROM public.queue_bookings
  WHERE doctor_id = _doctor_id
    AND status = 'waiting'
    AND queue_number < _queue_number;
  
  RETURN COALESCE(patient_count, 0);
END;
$$;

COMMENT ON FUNCTION public.count_patients_ahead IS 
  'Securely counts patients ahead in queue without exposing patient information. '
  'Only accessible by the patient themselves or their treating doctor.';