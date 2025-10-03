import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"user" | "admin">("user");
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Check if user is already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/dashboard");
      }
    });
  }, [navigate]);

  const handleUserLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      loginSchema.parse({ email, password });
      setLoading(true);

      // Call edge function to send OTP
      const { data, error } = await supabase.functions.invoke("send-otp", {
        body: { email, password },
      });

      if (error) throw error;

      if (data?.error) {
        toast({
          title: "Error",
          description: data.error,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "OTP Sent",
        description: "Check your email for the verification code",
      });

      setShowOtpInput(true);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Validation Error",
          description: error.errors[0].message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to send OTP",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOtpVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setLoading(true);

      // Verify OTP
      const { data: verifyData, error: verifyError } = await supabase.functions.invoke("verify-otp", {
        body: { email, otp },
      });

      if (verifyError) throw verifyError;

      if (verifyData?.error) {
        toast({
          title: "Error",
          description: verifyData.error,
          variant: "destructive",
        });
        return;
      }

      // Sign in the user
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) throw signInError;

      toast({
        title: "Success",
        description: "Login successful!",
      });

      navigate("/dashboard");
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to verify OTP",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      loginSchema.parse({ email, password });
      setLoading(true);

      // Sign in with credentials
      const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) throw signInError;

      // Check if user has admin role
      const { data: roleData, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", authData.user.id)
        .eq("role", "admin")
        .single();

      if (roleError || !roleData) {
        // Sign out the user
        await supabase.auth.signOut();
        
        toast({
          title: "Access Denied",
          description: "You do not have admin privileges",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Success",
        description: "Admin login successful!",
      });

      navigate("/admin/dashboard");
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Validation Error",
          description: error.errors[0].message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Access Denied",
          description: "Invalid credentials",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/20 via-background to-secondary/20 p-4">
      <Card className="w-full max-w-md animate-fade-in">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Million Game AI
          </CardTitle>
          <CardDescription>Sign in to access your account</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "user" | "admin")} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="user" className="transition-all">User Login</TabsTrigger>
              <TabsTrigger value="admin" className="transition-all">Admin Login</TabsTrigger>
            </TabsList>

            <TabsContent value="user" className="space-y-4 animate-fade-in">
              {!showOtpInput ? (
                <form onSubmit={handleUserLogin} className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="user-email" className="text-sm font-medium">
                      Email
                    </label>
                    <Input
                      id="user-email"
                      type="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="user-password" className="text-sm font-medium">
                      Password
                    </label>
                    <Input
                      id="user-password"
                      type="password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="transition-all"
                    />
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full bg-primary hover:bg-primary/90 transition-all"
                    disabled={loading}
                  >
                    {loading ? "Sending OTP..." : "Send OTP"}
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleOtpVerification} className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="otp" className="text-sm font-medium">
                      Enter OTP
                    </label>
                    <Input
                      id="otp"
                      type="text"
                      placeholder="Enter 6-digit code"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      maxLength={6}
                      required
                      className="text-center text-2xl tracking-widest transition-all"
                    />
                    <p className="text-xs text-muted-foreground text-center">
                      Check your email for the verification code
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Button 
                      type="submit" 
                      className="w-full bg-primary hover:bg-primary/90 transition-all"
                      disabled={loading}
                    >
                      {loading ? "Verifying..." : "Verify OTP"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full transition-all"
                      onClick={() => {
                        setShowOtpInput(false);
                        setOtp("");
                      }}
                    >
                      Back to Login
                    </Button>
                  </div>
                </form>
              )}
              <div className="text-center text-sm text-muted-foreground">
                Don't have an account?{" "}
                <a href="/signup" className="text-primary hover:underline">
                  Sign up
                </a>
              </div>
            </TabsContent>

            <TabsContent value="admin" className="space-y-4 animate-fade-in">
              <form onSubmit={handleAdminLogin} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="admin-email" className="text-sm font-medium">
                    Admin Email
                  </label>
                  <Input
                    id="admin-email"
                    type="email"
                    placeholder="Enter admin email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="admin-password" className="text-sm font-medium">
                    Password
                  </label>
                  <Input
                    id="admin-password"
                    type="password"
                    placeholder="Enter admin password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="transition-all"
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full bg-primary hover:bg-primary/90 transition-all"
                  disabled={loading}
                >
                  {loading ? "Signing in..." : "Admin Login"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
