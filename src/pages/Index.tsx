import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sparkles, MessageSquare, Shield, Zap } from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen" style={{ background: "var(--gradient-subtle)" }}>
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="flex flex-col items-center text-center space-y-8 max-w-4xl mx-auto">
          {/* Logo */}
          <div className="w-20 h-20 rounded-full flex items-center justify-center shadow-lg" style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}>
            <Sparkles className="w-10 h-10 text-white" />
          </div>

          {/* Headline */}
          <div className="space-y-4">
            <h1 className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
              Your AI Assistant
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl">
              Experience intelligent conversations powered by advanced AI. Get instant answers, creative ideas, and helpful insights.
            </p>
          </div>

          {/* CTA Buttons */}
          <div className="flex gap-4 flex-wrap justify-center">
            <Link to="/signup">
              <Button size="lg" className="text-lg px-8">
                Get Started
              </Button>
            </Link>
            <Link to="/login">
              <Button size="lg" variant="outline" className="text-lg px-8">
                Sign In
              </Button>
            </Link>
          </div>

          {/* Features Grid */}
          <div className="grid md:grid-cols-3 gap-6 mt-16 w-full">
            <div className="p-6 rounded-2xl bg-card border shadow-sm space-y-3">
              <div className="w-12 h-12 rounded-lg bg-accent flex items-center justify-center">
                <MessageSquare className="w-6 h-6 text-accent-foreground" />
              </div>
              <h3 className="font-semibold text-lg">Natural Conversations</h3>
              <p className="text-muted-foreground">
                Chat naturally with AI that understands context and provides relevant responses.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-card border shadow-sm space-y-3">
              <div className="w-12 h-12 rounded-lg bg-accent flex items-center justify-center">
                <Shield className="w-6 h-6 text-accent-foreground" />
              </div>
              <h3 className="font-semibold text-lg">Secure & Private</h3>
              <p className="text-muted-foreground">
                Your conversations are encrypted and stored securely with your account.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-card border shadow-sm space-y-3">
              <div className="w-12 h-12 rounded-lg bg-accent flex items-center justify-center">
                <Zap className="w-6 h-6 text-accent-foreground" />
              </div>
              <h3 className="font-semibold text-lg">Lightning Fast</h3>
              <p className="text-muted-foreground">
                Get instant responses powered by the latest AI models for seamless interaction.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
