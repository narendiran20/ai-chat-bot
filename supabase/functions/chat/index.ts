import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation
const validateInput = (conversationId: string, message: string) => {
  if (!conversationId || typeof conversationId !== "string") {
    return "Invalid conversation ID";
  }
  
  // UUID format validation
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(conversationId)) {
    return "Invalid conversation ID format";
  }
  
  if (!message || typeof message !== "string") {
    return "Message is required";
  }
  
  const trimmedMessage = message.trim();
  if (trimmedMessage.length === 0) {
    return "Message cannot be empty";
  }
  
  if (trimmedMessage.length > 4000) {
    return "Message too long (max 4000 characters)";
  }
  
  return null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Extract user from JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    // Create client with anon key for auth
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
    
    if (authError || !user) {
      console.error("Auth error:", authError);
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { conversationId, message } = await req.json();

    // Validate input
    const validationError = validateInput(conversationId, message);
    if (validationError) {
      return new Response(
        JSON.stringify({ error: validationError }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create service role client for privileged operations
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify conversation ownership
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("user_id")
      .eq("id", conversationId)
      .single();

    if (convError || !conversation) {
      console.error("Conversation lookup error:", convError);
      return new Response(
        JSON.stringify({ error: "Conversation not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (conversation.user_id !== user.id) {
      console.warn(`Unauthorized access attempt: user ${user.id} tried to access conversation ${conversationId}`);
      return new Response(
        JSON.stringify({ error: "Access denied" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check and deduct tokens
    const trimmedMessage = message.trim();
    const wordCount = trimmedMessage.split(/\s+/).length;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("tokens")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile) {
      console.error("Profile lookup error:", profileError);
      return new Response(
        JSON.stringify({ error: "Unable to verify account" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (profile.tokens < wordCount) {
      return new Response(
        JSON.stringify({ error: "Insufficient tokens. Please upgrade your account." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Deduct tokens
    const { error: tokenError } = await supabase
      .from("profiles")
      .update({ tokens: profile.tokens - wordCount })
      .eq("user_id", user.id);

    if (tokenError) {
      console.error("Token deduction error:", tokenError);
      return new Response(
        JSON.stringify({ error: "Unable to process request" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get conversation history
    const { data: messages, error: messagesError } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (messagesError) {
      console.error("Error fetching messages:", messagesError);
      return new Response(
        JSON.stringify({ error: "Unable to load conversation history" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Prepare messages for AI
    const conversationHistory = messages || [];
    const allMessages = [
      {
        role: "system",
        content: "You are a helpful, friendly AI assistant. Provide clear, concise, and accurate responses."
      },
      ...conversationHistory.map((msg: any) => ({
        role: msg.role,
        content: msg.content
      }))
    ];

    // Call Lovable AI
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Service configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: allMessages,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: "AI service temporarily unavailable" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    const assistantMessage = aiData.choices[0].message.content;

    // Count AI response words and deduct additional tokens
    const aiWordCount = assistantMessage.trim().split(/\s+/).length;
    const { error: aiTokenError } = await supabase
      .from("profiles")
      .update({ tokens: profile.tokens - wordCount - aiWordCount })
      .eq("user_id", user.id);

    if (aiTokenError) {
      console.error("AI token deduction error:", aiTokenError);
    }

    // Save assistant message to database
    const { error: saveError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        role: "assistant",
        content: assistantMessage,
      });

    if (saveError) {
      console.error("Error saving message:", saveError);
      return new Response(
        JSON.stringify({ error: "Unable to save response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ 
        message: assistantMessage,
        tokensRemaining: profile.tokens - wordCount - aiWordCount
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in chat function:", error);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred. Please try again." }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
