import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Stethoscope, LogOut, Activity, Clock, Users, ChevronRight } from 'lucide-react';

interface QueuePatient {
  id: string;
  queue_number: number;
  status: string;
  booked_at: string;
  called_at: string | null;
  profiles: {
    full_name: string;
  };
}

const DoctorDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [queueList, setQueueList] = useState<QueuePatient[]>([]);
  const [consultationTime, setConsultationTime] = useState(15);
  const [loading, setLoading] = useState(true);
  const [doctorId, setDoctorId] = useState<string>('');

  useEffect(() => {
    let redirected = false;
    
    const initDashboard = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user && !redirected) {
        redirected = true;
        navigate('/auth');
        return;
      }
      if (!user) return;

      const { data: doctor, error: doctorError } = await supabase
        .from('doctors')
        .select('id, average_consultation_minutes')
        .eq('profile_id', user.id)
        .maybeSingle();

      if (!doctor && !redirected) {
        // Create doctor profile if it doesn't exist
        const { data: newDoctor, error: createError } = await supabase
          .from('doctors')
          .insert({
            profile_id: user.id,
            specialization: 'General Practice',
            average_consultation_minutes: 15,
            is_available: true
          })
          .select('id, average_consultation_minutes')
          .single();
        
        if (createError) {
          toast({
            title: 'Error',
            description: 'Failed to create doctor profile',
            variant: 'destructive'
          });
          redirected = true;
          await supabase.auth.signOut();
          navigate('/auth');
          return;
        }
        
        if (newDoctor) {
          setDoctorId(newDoctor.id);
          setConsultationTime(newDoctor.average_consultation_minutes);
          await fetchQueue(newDoctor.id);
          setLoading(false);
          toast({
            title: 'Welcome!',
            description: 'Your doctor profile has been created'
          });
        }
        return;
      }

      if (doctor) {
        setDoctorId(doctor.id);
        setConsultationTime(doctor.average_consultation_minutes);
        await fetchQueue(doctor.id);
        setLoading(false);
      }
    };

    initDashboard();

    // Real-time subscription
    const channel = supabase
      .channel('doctor-queue-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'queue_bookings'
        },
        async () => {
          if (doctorId) await fetchQueue(doctorId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [doctorId]);

  const fetchQueue = async (drId: string) => {
    const { data, error } = await supabase
      .from('queue_bookings')
      .select('*, profiles(full_name)')
      .eq('doctor_id', drId)
      .in('status', ['waiting', 'called'])
      .order('queue_number', { ascending: true });

    if (!error && data) {
      setQueueList(data);
    }
  };

  const callNextPatient = async () => {
    const nextPatient = queueList.find(p => p.status === 'waiting');
    if (!nextPatient) {
      toast({
        title: 'No patients',
        description: 'No patients in the waiting queue',
        variant: 'default'
      });
      return;
    }

    const { error } = await supabase
      .from('queue_bookings')
      .update({
        status: 'called',
        called_at: new Date().toISOString()
      })
      .eq('id', nextPatient.id);

    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    } else {
      toast({
        title: 'Patient called',
        description: `Queue #${nextPatient.queue_number} - ${nextPatient.profiles.full_name}`
      });
    }
  };

  const completePatient = async (bookingId: string) => {
    const { error } = await supabase
      .from('queue_bookings')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', bookingId);

    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    } else {
      toast({
        title: 'Patient completed',
        description: 'Patient marked as completed'
      });
    }
  };

  const updateConsultationTime = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('doctors')
      .update({ average_consultation_minutes: consultationTime })
      .eq('profile_id', user.id);

    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    } else {
      toast({
        title: 'Updated',
        description: 'Consultation time updated successfully'
      });
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Activity className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const waitingCount = queueList.filter(p => p.status === 'waiting').length;
  const currentPatient = queueList.find(p => p.status === 'called');

  return (
    <div className="min-h-screen bg-gradient-to-br from-accent/5 via-background to-primary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10 shadow-[var(--shadow-card)]">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Stethoscope className="w-6 h-6 text-accent" />
            <h1 className="text-xl font-bold">Doctor Dashboard</h1>
          </div>
          <Button variant="outline" onClick={handleLogout} size="sm">
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-primary/20">
            <CardContent className="p-6 text-center">
              <Users className="w-8 h-8 mx-auto mb-2 text-primary" />
              <p className="text-2xl font-bold text-primary">{waitingCount}</p>
              <p className="text-sm text-muted-foreground">Waiting</p>
            </CardContent>
          </Card>

          <Card className="border-accent/20">
            <CardContent className="p-6 text-center">
              <Activity className={currentPatient ? 'w-8 h-8 mx-auto mb-2 text-accent animate-pulse' : 'w-8 h-8 mx-auto mb-2 text-muted-foreground'} />
              <p className="text-2xl font-bold text-accent">{currentPatient ? currentPatient.queue_number : '-'}</p>
              <p className="text-sm text-muted-foreground">Current</p>
            </CardContent>
          </Card>

          <Card className="border-secondary/20">
            <CardContent className="p-6 text-center">
              <Clock className="w-8 h-8 mx-auto mb-2 text-secondary" />
              <p className="text-2xl font-bold text-secondary">{consultationTime}</p>
              <p className="text-sm text-muted-foreground">Min/Patient</p>
            </CardContent>
          </Card>
        </div>

        {currentPatient && (
          <Card className="border-accent/30 shadow-[var(--shadow-medical)] animate-fade-in">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="animate-pulse text-accent" />
                Current Patient
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold">Queue #{currentPatient.queue_number}</p>
                  <p className="text-lg">{currentPatient.profiles.full_name}</p>
                  <p className="text-sm text-muted-foreground">Called at {new Date(currentPatient.called_at || '').toLocaleTimeString()}</p>
                </div>
                <Button onClick={() => completePatient(currentPatient.id)} size="lg" variant="default">
                  Complete
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Queue List</CardTitle>
              <CardDescription>{waitingCount} patients waiting</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {queueList.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No patients in queue</p>
              ) : (
                queueList.map((patient) => (
                  <div
                    key={patient.id}
                    className={`flex items-center justify-between p-4 rounded-lg border transition-all ${
                      patient.status === 'called'
                        ? 'border-accent/50 bg-accent/10'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-lg font-bold text-primary">{patient.queue_number}</span>
                      </div>
                      <div>
                        <p className="font-medium">{patient.profiles.full_name}</p>
                        <p className="text-sm text-muted-foreground">
                          Booked at {new Date(patient.booked_at).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                    <Badge variant={patient.status === 'called' ? 'default' : 'secondary'}>
                      {patient.status}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  onClick={callNextPatient}
                  className="w-full"
                  size="lg"
                  disabled={waitingCount === 0 || !!currentPatient}
                >
                  <ChevronRight className="w-4 h-4 mr-2" />
                  Call Next Patient
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="consultation-time">Avg Consultation Time (min)</Label>
                  <Input
                    id="consultation-time"
                    type="number"
                    min="5"
                    max="120"
                    value={consultationTime}
                    onChange={(e) => setConsultationTime(Number(e.target.value))}
                  />
                </div>
                <Button onClick={updateConsultationTime} variant="outline" className="w-full">
                  Update Time
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default DoctorDashboard;
