-- Add tokens column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN tokens INTEGER NOT NULL DEFAULT 10000;

-- Create function to auto-create profile with tokens when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, tokens)
  VALUES (NEW.id, NEW.email, 10000);
  RETURN NEW;
END;
$$;

-- Create trigger to call the function on user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();