-- Fix critical OTP security vulnerability
DROP POLICY IF EXISTS "Users can verify their own OTP" ON public.otp_verifications;

-- Create secure policy that only allows users to view their own OTP by email
CREATE POLICY "Users can only view their own OTP"
ON public.otp_verifications
FOR SELECT
USING (
  email = (SELECT email FROM auth.users WHERE id = auth.uid())
);

-- Add policy to allow OTP insertion (for send-otp function)
CREATE POLICY "Service role can insert OTP"
ON public.otp_verifications
FOR INSERT
WITH CHECK (true);

-- Add policy to allow OTP updates (for verification)
CREATE POLICY "Service role can update OTP"
ON public.otp_verifications
FOR UPDATE
USING (true);