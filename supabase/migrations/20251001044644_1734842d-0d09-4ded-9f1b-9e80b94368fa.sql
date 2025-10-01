-- Create user roles enum
CREATE TYPE public.user_role AS ENUM ('patient', 'doctor');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'patient',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Create doctors table
CREATE TABLE public.doctors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  specialization TEXT NOT NULL,
  average_consultation_minutes INTEGER NOT NULL DEFAULT 15,
  is_available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(profile_id)
);

-- Enable RLS
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;

-- Doctors policies
CREATE POLICY "Everyone can view available doctors"
  ON public.doctors FOR SELECT
  USING (true);

CREATE POLICY "Doctors can update their own profile"
  ON public.doctors FOR UPDATE
  USING (auth.uid() = profile_id);

-- Create queue status enum
CREATE TYPE public.queue_status AS ENUM ('waiting', 'called', 'completed', 'cancelled');

-- Create queue bookings table
CREATE TABLE public.queue_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  queue_number INTEGER NOT NULL,
  status queue_status NOT NULL DEFAULT 'waiting',
  booked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  called_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.queue_bookings ENABLE ROW LEVEL SECURITY;

-- Queue bookings policies
CREATE POLICY "Patients can view their own bookings"
  ON public.queue_bookings FOR SELECT
  USING (auth.uid() = patient_id);

CREATE POLICY "Doctors can view bookings for their queue"
  ON public.queue_bookings FOR SELECT
  USING (auth.uid() IN (SELECT profile_id FROM public.doctors WHERE id = queue_bookings.doctor_id));

CREATE POLICY "Patients can create bookings"
  ON public.queue_bookings FOR INSERT
  WITH CHECK (auth.uid() = patient_id);

CREATE POLICY "Doctors can update their queue bookings"
  ON public.queue_bookings FOR UPDATE
  USING (auth.uid() IN (SELECT profile_id FROM public.doctors WHERE id = queue_bookings.doctor_id));

-- Function to auto-generate queue numbers
CREATE OR REPLACE FUNCTION public.generate_queue_number()
RETURNS TRIGGER AS $$
BEGIN
  -- Get the highest queue number for this doctor today
  SELECT COALESCE(MAX(queue_number), 0) + 1
  INTO NEW.queue_number
  FROM public.queue_bookings
  WHERE doctor_id = NEW.doctor_id
  AND DATE(created_at) = CURRENT_DATE;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate queue numbers
CREATE TRIGGER set_queue_number
  BEFORE INSERT ON public.queue_bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_queue_number();

-- Function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'patient')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Enable realtime for queue bookings
ALTER PUBLICATION supabase_realtime ADD TABLE public.queue_bookings;