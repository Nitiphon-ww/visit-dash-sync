-- Create trigger to auto-populate patient_name from profiles
CREATE OR REPLACE FUNCTION public.populate_patient_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Get patient name from profiles table
  SELECT full_name INTO NEW.patient_name
  FROM public.profiles
  WHERE id = NEW.patient_id;
  
  -- If no name found, use default
  IF NEW.patient_name IS NULL THEN
    NEW.patient_name := 'Patient';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Attach trigger to queue_bookings table
CREATE TRIGGER set_patient_name_on_booking
BEFORE INSERT ON public.queue_bookings
FOR EACH ROW
EXECUTE FUNCTION public.populate_patient_name();