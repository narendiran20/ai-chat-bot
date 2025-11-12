import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Resend } from "https://esm.sh/resend@4.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Rate limiting configuration
const RATE_LIMIT_WINDOW_HOURS = 1;
const MAX_ATTEMPTS_PER_WINDOW = 3;
const BLOCK_DURATION_MINUTES = 15;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();

    if (!email || typeof email !== "string") {
      return new Response(
        JSON.stringify({ error: "Valid email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check rate limiting
    const now = new Date();
    const windowStart = new Date(now.getTime() - RATE_LIMIT_WINDOW_HOURS * 60 * 60 * 1000);

    // Check if currently blocked
    const { data: blockedRecord } = await supabase
      .from("rate_limit_tracking")
      .select("*")
      .eq("identifier", email)
      .eq("endpoint", "send-otp")
      .gt("blocked_until", now.toISOString())
      .single();

    if (blockedRecord) {
      const remainingMinutes = Math.ceil((new Date(blockedRecord.blocked_until).getTime() - now.getTime()) / 60000);
      return new Response(
        JSON.stringify({ error: `Too many attempts. Please try again in ${remainingMinutes} minutes.` }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check recent attempts in the window
    const { data: recentAttempts } = await supabase
      .from("rate_limit_tracking")
      .select("*")
      .eq("identifier", email)
      .eq("endpoint", "send-otp")
      .gte("last_attempt_at", windowStart.toISOString())
      .order("last_attempt_at", { ascending: false })
      .limit(1)
      .single();

    if (recentAttempts) {
      const attemptCount = recentAttempts.attempt_count + 1;
      
      if (attemptCount > MAX_ATTEMPTS_PER_WINDOW) {
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
          JSON.stringify({ error: `Too many attempts. Please try again in ${BLOCK_DURATION_MINUTES} minutes.` }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update attempt count
      await supabase
        .from("rate_limit_tracking")
        .update({
          attempt_count: attemptCount,
          last_attempt_at: now.toISOString(),
        })
        .eq("id", recentAttempts.id);
    } else {
      // Create new rate limit record
      await supabase
        .from("rate_limit_tracking")
        .insert({
          identifier: email,
          endpoint: "send-otp",
          attempt_count: 1,
          first_attempt_at: now.toISOString(),
          last_attempt_at: now.toISOString(),
        });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Clean up old OTPs for this email
    await supabase
      .from("otp_verifications")
      .delete()
      .eq("email", email);

    // Store OTP
    const { error: dbError } = await supabase
      .from("otp_verifications")
      .insert({
        email,
        otp,
        expires_at: expiresAt.toISOString(),
        verified: false,
      });

    if (dbError) {
      console.error("Database error:", dbError);
      return new Response(
        JSON.stringify({ error: "Failed to generate OTP" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send OTP via email using Resend
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resend = new Resend(resendApiKey);

    const emailResponse = await resend.emails.send({
      from: "Million Game AI <onboarding@resend.dev>",
      to: [email],
      subject: "Your Login Verification Code",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #333; text-align: center;">Million Game AI</h1>
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px; text-align: center; margin: 20px 0;">
            <h2 style="color: white; margin: 0 0 10px 0;">Your Verification Code</h2>
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <span style="font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 5px;">${otp}</span>
            </div>
            <p style="color: white; margin: 10px 0;">This code will expire in 5 minutes</p>
          </div>
          <p style="color: #666; text-align: center; font-size: 14px;">
            If you didn't request this code, please ignore this email.
          </p>
        </div>
      `,
    });

    console.log("OTP sent to email:", email);

    // Clean up old rate limit records
    await supabase.rpc("cleanup_old_rate_limits");

    return new Response(
      JSON.stringify({ message: "OTP sent successfully to your email" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in send-otp function:", error);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
