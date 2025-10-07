-- Fix email exposure by adding full_name to doctors table and removing permissive policy

-- Add full_name column to doctors table
ALTER TABLE public.doctors ADD COLUMN full_name TEXT;

-- Populate existing doctors with names from profiles
UPDATE public.doctors d
SET full_name = p.full_name
FROM public.profiles p
WHERE d.profile_id = p.id;

-- Make full_name NOT NULL after populating data
ALTER TABLE public.doctors ALTER COLUMN full_name SET DEFAULT 'Doctor';
ALTER TABLE public.doctors ALTER COLUMN full_name SET NOT NULL;

-- Drop the overly permissive policy that exposes emails
DROP POLICY IF EXISTS "Everyone can view doctor profiles" ON public.profiles;

-- Now doctors can be viewed by everyone through the doctors table (which doesn't contain emails)
-- And profiles remain private (only viewable by the owner via "Users can view their own profile" policy)