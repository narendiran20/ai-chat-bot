import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface UserData {
  email: string;
  tokens: number;
  isVerified: boolean;
  createdAt: string;
}

const AdminDashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    const fetchUsers = async () => {
      if (!user) return;

      try {
        setLoading(true);
        setError(null);

        const { data, error: invokeError } = await supabase.functions.invoke(
          "admin-users",
          {
            headers: {
              Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            },
          }
        );

        if (invokeError) {
          console.error("Error fetching users:", invokeError);
          setError(invokeError.message || "Failed to fetch user data");
          return;
        }

        if (data?.users) {
          setUsers(data.users);
        }
      } catch (err) {
        console.error("Unexpected error:", err);
        setError("An unexpected error occurred");
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [user]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-lg text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Button
            variant="outline"
            onClick={() => navigate("/dashboard")}
            className="mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
          <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Million Game AI - User Data
          </h1>
        </div>

        {error ? (
          <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg">
            {error}
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-12 bg-card rounded-lg shadow-elegant">
            <p className="text-muted-foreground text-lg">No users found yet.</p>
          </div>
        ) : (
          <div className="bg-card rounded-lg shadow-elegant overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-primary/10 hover:bg-primary/10">
                  <TableHead className="font-bold text-primary">Email</TableHead>
                  <TableHead className="font-bold text-primary">Tokens Left</TableHead>
                  <TableHead className="font-bold text-primary">Verified</TableHead>
                  <TableHead className="font-bold text-primary">Joined Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((userData, index) => (
                  <TableRow
                    key={index}
                    className="hover:bg-muted/50 transition-colors"
                  >
                    <TableCell className="font-medium">{userData.email}</TableCell>
                    <TableCell>{userData.tokens.toLocaleString()}</TableCell>
                    <TableCell>
                      <span className="text-2xl">
                        {userData.isVerified ? "✅" : "❌"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {format(new Date(userData.createdAt), "dd/MM/yyyy")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
