-- Fix search_path for generate_queue_number function
CREATE OR REPLACE FUNCTION public.generate_queue_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Get the highest queue number for this doctor today
  SELECT COALESCE(MAX(queue_number), 0) + 1
  INTO NEW.queue_number
  FROM public.queue_bookings
  WHERE doctor_id = NEW.doctor_id
  AND DATE(created_at) = CURRENT_DATE;
  
  RETURN NEW;
END;
$$;