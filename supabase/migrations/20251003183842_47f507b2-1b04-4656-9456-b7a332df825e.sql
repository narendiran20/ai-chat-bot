-- Add DELETE policy on profiles table to allow users to delete their own profile
CREATE POLICY "Users can delete own profile"
  ON public.profiles FOR DELETE
  USING (auth.uid() = user_id);

-- Create atomic token decrement function to prevent race conditions
CREATE OR REPLACE FUNCTION public.decrement_tokens(
  _user_id uuid,
  _amount integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_balance integer;
BEGIN
  UPDATE profiles
  SET tokens = tokens - _amount
  WHERE user_id = _user_id
  AND tokens >= _amount
  RETURNING tokens INTO new_balance;
  
  IF new_balance IS NULL THEN
    RAISE EXCEPTION 'Insufficient tokens';
  END IF;
  
  RETURN new_balance;
END;
$$;