-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create medical_records table
CREATE TABLE public.medical_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES public.queue_bookings(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL,
  doctor_id UUID NOT NULL,
  diagnosis TEXT,
  prescription TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.medical_records ENABLE ROW LEVEL SECURITY;

-- Patients can view their own medical records
CREATE POLICY "Patients can view their own medical records"
ON public.medical_records
FOR SELECT
USING (auth.uid() = patient_id);

-- Doctors can view medical records for their patients
CREATE POLICY "Doctors can view their patients' medical records"
ON public.medical_records
FOR SELECT
USING (
  auth.uid() IN (
    SELECT profile_id FROM public.doctors WHERE id = doctor_id
  )
);

-- Doctors can create medical records
CREATE POLICY "Doctors can create medical records"
ON public.medical_records
FOR INSERT
WITH CHECK (
  auth.uid() IN (
    SELECT profile_id FROM public.doctors WHERE id = doctor_id
  )
);

-- Doctors can update their own medical records
CREATE POLICY "Doctors can update their medical records"
ON public.medical_records
FOR UPDATE
USING (
  auth.uid() IN (
    SELECT profile_id FROM public.doctors WHERE id = doctor_id
  )
);

-- Create trigger for updated_at
CREATE TRIGGER update_medical_records_updated_at
BEFORE UPDATE ON public.medical_records
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();