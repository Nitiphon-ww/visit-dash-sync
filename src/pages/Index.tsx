import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Stethoscope, Clock, Users, Activity } from 'lucide-react';

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user is already logged in
    const checkAuth = async () => {
      const { supabase } = await import('@/integrations/supabase/client');
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .single();
        
        if (profile?.role === 'doctor') {
          navigate('/doctor-dashboard');
        } else {
          navigate('/patient-dashboard');
        }
      }
    };
    checkAuth();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Stethoscope className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold">MediQueue</h1>
          </div>
          <Button onClick={() => navigate('/auth')} variant="default">
            Get Started
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto text-center space-y-8 animate-fade-in">
          <div className="space-y-4">
            <h2 className="text-5xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Smart Doctor Queue Management
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Say goodbye to long waits. Book your queue, track your position in real-time, and get notified when it's your turn.
            </p>
          </div>

          <div className="flex gap-4 justify-center">
            <Button onClick={() => navigate('/auth')} size="lg" className="text-lg px-8">
              Join as Patient
            </Button>
            <Button onClick={() => navigate('/auth')} size="lg" variant="outline" className="text-lg px-8">
              Doctor Login
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16">
            <div className="p-6 rounded-xl border bg-card/50 backdrop-blur-sm hover:shadow-[var(--shadow-medical)] transition-all">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Clock className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-lg mb-2">Real-Time Updates</h3>
              <p className="text-sm text-muted-foreground">
                Track your queue position and estimated wait time live
              </p>
            </div>

            <div className="p-6 rounded-xl border bg-card/50 backdrop-blur-sm hover:shadow-[var(--shadow-medical)] transition-all">
              <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
                <Users className="w-6 h-6 text-accent" />
              </div>
              <h3 className="font-semibold text-lg mb-2">Easy Booking</h3>
              <p className="text-sm text-muted-foreground">
                Choose your doctor and book queue in seconds
              </p>
            </div>

            <div className="p-6 rounded-xl border bg-card/50 backdrop-blur-sm hover:shadow-[var(--shadow-medical)] transition-all">
              <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center mx-auto mb-4">
                <Activity className="w-6 h-6 text-secondary" />
              </div>
              <h3 className="font-semibold text-lg mb-2">Instant Notifications</h3>
              <p className="text-sm text-muted-foreground">
                Get notified when your turn approaches
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t py-8 mt-16">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© 2025 MediQueue. Making healthcare queues smarter.</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
