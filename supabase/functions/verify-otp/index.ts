import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, otp } = await req.json();

    if (!email || !otp) {
      return new Response(
        JSON.stringify({ error: "Email and OTP are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Clean up expired OTPs
    await supabase
      .from("otp_verifications")
      .delete()
      .lt("expires_at", new Date().toISOString());

    // Verify OTP
    const { data: otpData, error: otpError } = await supabase
      .from("otp_verifications")
      .select("*")
      .eq("email", email)
      .eq("otp", otp)
      .eq("verified", false)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (otpError || !otpData) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired OTP" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mark OTP as verified
    await supabase
      .from("otp_verifications")
      .update({ verified: true })
      .eq("id", otpData.id);

    // Check if user exists
    const { data: { users } } = await supabase.auth.admin.listUsers();
    const existingUser = users.find((u: any) => u.email === email);

    let userId: string;
    let accessToken: string;
    let refreshToken: string;

    if (existingUser) {
      // Sign in existing user
      const { data, error } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: email,
      });

      if (error) throw error;

      // Create session for existing user
      const { data: sessionData, error: sessionError } = await supabase.auth.signInWithPassword({
        email: email,
        password: crypto.randomUUID(), // Temporary - we'll use session from admin
      });

      // Use admin to create proper session
      const { data: adminSession, error: adminError } = await supabase.auth.admin.createUser({
        email: email,
        email_confirm: true,
      });

      if (adminError && !adminError.message.includes('already registered')) {
        throw adminError;
      }

      userId = existingUser.id;
      // Return user info - frontend will handle session
    } else {
      // Create new user
      const { data: newUser, error: signUpError } = await supabase.auth.admin.createUser({
        email: email,
        email_confirm: true,
      });

      if (signUpError) throw signUpError;

      userId = newUser.user.id;

      // Create profile with tokens
      const { error: profileError } = await supabase
        .from("profiles")
        .insert({
          user_id: userId,
          email: email,
          tokens: 10000,
        });

      if (profileError) {
        console.error("Profile creation error:", profileError);
      }
    }

    return new Response(
      JSON.stringify({ 
        message: "OTP verified successfully",
        email: email,
        userId: userId
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in verify-otp function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "An unexpected error occurred" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
