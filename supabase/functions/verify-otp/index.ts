import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Rate limiting configuration
const MAX_VERIFY_ATTEMPTS = 5;
const BLOCK_DURATION_MINUTES = 30;

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

    // Check rate limiting for verification attempts
    const now = new Date();
    const windowStart = new Date(now.getTime() - 60 * 60 * 1000); // 1 hour window

    // Check if currently blocked
    const { data: blockedRecord } = await supabase
      .from("rate_limit_tracking")
      .select("*")
      .eq("identifier", email)
      .eq("endpoint", "verify-otp")
      .gt("blocked_until", now.toISOString())
      .single();

    if (blockedRecord) {
      const remainingMinutes = Math.ceil((new Date(blockedRecord.blocked_until).getTime() - now.getTime()) / 60000);
      return new Response(
        JSON.stringify({ error: `Too many failed attempts. Please try again in ${remainingMinutes} minutes.` }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check recent verification attempts
    const { data: recentAttempts } = await supabase
      .from("rate_limit_tracking")
      .select("*")
      .eq("identifier", email)
      .eq("endpoint", "verify-otp")
      .gte("last_attempt_at", windowStart.toISOString())
      .order("last_attempt_at", { ascending: false })
      .limit(1)
      .single();

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
      // Track failed attempt
      if (recentAttempts) {
        const attemptCount = recentAttempts.attempt_count + 1;
        
        if (attemptCount >= MAX_VERIFY_ATTEMPTS) {
          // Block the user
          const blockedUntil = new Date(now.getTime() + BLOCK_DURATION_MINUTES * 60 * 1000);
          await supabase
            .from("rate_limit_tracking")
            .update({
              attempt_count: attemptCount,
              last_attempt_at: now.toISOString(),
              blocked_until: blockedUntil.toISOString(),
            })
            .eq("id", recentAttempts.id);

          return new Response(
            JSON.stringify({ error: `Too many failed attempts. Please try again in ${BLOCK_DURATION_MINUTES} minutes.` }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        await supabase
          .from("rate_limit_tracking")
          .update({
            attempt_count: attemptCount,
            last_attempt_at: now.toISOString(),
          })
          .eq("id", recentAttempts.id);
      } else {
        await supabase
          .from("rate_limit_tracking")
          .insert({
            identifier: email,
            endpoint: "verify-otp",
            attempt_count: 1,
            first_attempt_at: now.toISOString(),
            last_attempt_at: now.toISOString(),
          });
      }

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

    // Clear rate limiting on successful verification
    if (recentAttempts) {
      await supabase
        .from("rate_limit_tracking")
        .delete()
        .eq("id", recentAttempts.id);
    }

    // Check if user exists
    const { data: { users } } = await supabase.auth.admin.listUsers();
    const existingUser = users.find((u: any) => u.email === email);

    let userId: string;

    if (!existingUser) {
      // Create new user with email confirmed
      const { data: newUser, error: signUpError } = await supabase.auth.admin.createUser({
        email: email,
        email_confirm: true,
      });

      if (signUpError) {
        console.error("Error creating new user:", signUpError);
        throw signUpError;
      }

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
    } else {
      userId = existingUser.id;
    }

    // Generate magic link to extract session tokens
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: email,
    });

    if (linkError) {
      console.error("Error generating auth link:", linkError);
      throw linkError;
    }

    // Extract tokens from the magic link URL
    const url = new URL(linkData.properties.action_link);
    const access_token = url.searchParams.get('access_token');
    const refresh_token = url.searchParams.get('refresh_token');

    if (!access_token || !refresh_token) {
      throw new Error('Failed to generate session tokens');
    }

    // Clean up old rate limit records
    await supabase.rpc("cleanup_old_rate_limits");

    return new Response(
      JSON.stringify({ 
        message: "OTP verified successfully",
        access_token,
        refresh_token,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in verify-otp function:", error);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
