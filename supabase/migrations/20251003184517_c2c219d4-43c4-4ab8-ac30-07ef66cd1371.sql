-- Add is_admin field to profiles table
ALTER TABLE public.profiles 
ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false;

-- Create index for faster admin queries
CREATE INDEX idx_profiles_is_admin ON public.profiles(is_admin);

-- Add RLS policy for admins to view all profiles
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND is_admin = true
  )
);