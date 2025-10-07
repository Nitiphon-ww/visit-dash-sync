import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Stethoscope, Clock, Users, LogOut, Activity, FileText, History } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Doctor {
  id: string;
  specialization: string;
  average_consultation_minutes: number;
  full_name: string;
}

interface QueueBooking {
  id: string;
  queue_number: number;
  status: string;
  doctor_id: string;
  booked_at: string;
  called_at: string | null;
  completed_at: string | null;
  doctors: {
    specialization: string;
    average_consultation_minutes: number;
    full_name: string;
  };
}

interface MedicalRecord {
  id: string;
  diagnosis: string | null;
  prescription: string | null;
  notes: string | null;
  created_at: string;
  booking_id: string;
  queue_bookings: {
    queue_number: number;
    booked_at: string;
    doctors: {
      full_name: string;
      specialization: string;
    };
  };
}

const PatientDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [myQueue, setMyQueue] = useState<QueueBooking | null>(null);
  const [patientsAhead, setPatientsAhead] = useState(0);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string>('');
  const [bookingHistory, setBookingHistory] = useState<QueueBooking[]>([]);
  const [medicalRecords, setMedicalRecords] = useState<MedicalRecord[]>([]);

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
      
      setUserId(user.id);
      await fetchDoctors();
      await fetchMyQueue(user.id);
      await fetchBookingHistory(user.id);
      await fetchMedicalRecords(user.id);
      setLoading(false);
    };
    initDashboard();

    // Real-time subscription for queue updates
    const channel = supabase
      .channel('queue-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'queue_bookings'
        },
        async () => {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) await fetchMyQueue(user.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchDoctors = async () => {
    const { data, error } = await supabase
      .from('doctors')
      .select('*')
      .eq('is_available', true);

    if (!error && data) {
      setDoctors(data);
    }
  };

  const fetchMyQueue = async (patientId: string) => {
    const { data, error } = await supabase
      .from('queue_bookings')
      .select('*, doctors(specialization, average_consultation_minutes, full_name)')
      .eq('patient_id', patientId)
      .in('status', ['waiting', 'called'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      setMyQueue(data);
      // Use secure function to count patients ahead without exposing patient information
      const { data: count, error: countError } = await supabase
        .rpc('count_patients_ahead', {
          _doctor_id: data.doctor_id,
          _queue_number: data.queue_number,
          _patient_id: patientId
        });
      
      if (!countError) {
        setPatientsAhead(count || 0);
      } else {
        setPatientsAhead(0);
      }
    } else {
      setMyQueue(null);
      setPatientsAhead(0);
    }
  };

  const fetchBookingHistory = async (patientId: string) => {
    const { data, error } = await supabase
      .from('queue_bookings')
      .select('*, doctors(specialization, average_consultation_minutes, full_name)')
      .eq('patient_id', patientId)
      .order('booked_at', { ascending: false });

    if (!error && data) {
      setBookingHistory(data);
    }
  };

  const fetchMedicalRecords = async (patientId: string) => {
    const { data, error } = await supabase
      .from('medical_records')
      .select('*, queue_bookings(queue_number, booked_at, doctors(full_name, specialization))')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setMedicalRecords(data);
    }
  };

  const bookQueue = async (doctorId: string) => {
    try {
      const { error } = await supabase
        .from('queue_bookings')
        .insert([{
          patient_id: userId,
          doctor_id: doctorId,
          queue_number: 0 // Will be auto-generated by trigger
        }]);

      if (error) throw error;

      toast({
        title: 'Queue booked!',
        description: 'You have been added to the queue'
      });

      await fetchMyQueue(userId);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  const calculateWaitTime = () => {
    if (!myQueue) return 0;
    return patientsAhead * (myQueue.doctors.average_consultation_minutes || 15);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Activity className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10 shadow-[var(--shadow-card)]">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Stethoscope className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold">MediQueue</h1>
          </div>
          <Button variant="outline" onClick={handleLogout} size="sm">
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="current" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="current">Current Queue</TabsTrigger>
            <TabsTrigger value="history">Booking History</TabsTrigger>
            <TabsTrigger value="records">Medical Records</TabsTrigger>
          </TabsList>

          <TabsContent value="current" className="space-y-6 mt-6">
            {myQueue && (
              <Card className="border-primary/20 shadow-[var(--shadow-medical)] animate-fade-in">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className={myQueue.status === 'called' ? 'animate-pulse text-accent' : 'text-primary'} />
                    Your Queue Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="text-center p-4 bg-primary/10 rounded-lg">
                      <p className="text-sm text-muted-foreground mb-1">Queue Number</p>
                      <p className="text-3xl font-bold text-primary">{myQueue.queue_number}</p>
                    </div>
                    <div className="text-center p-4 bg-accent/10 rounded-lg">
                      <p className="text-sm text-muted-foreground mb-1">Patients Ahead</p>
                      <p className="text-3xl font-bold text-accent">{patientsAhead}</p>
                    </div>
                    <div className="text-center p-4 bg-secondary/10 rounded-lg">
                      <p className="text-sm text-muted-foreground mb-1">Est. Wait Time</p>
                      <p className="text-3xl font-bold text-secondary">{calculateWaitTime()} min</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-4 border-t">
                    <div>
                      <p className="font-medium">{myQueue.doctors.full_name || 'Doctor'}</p>
                      <p className="text-sm text-muted-foreground">{myQueue.doctors.specialization}</p>
                    </div>
                    <Badge variant={myQueue.status === 'called' ? 'default' : 'secondary'} className="animate-pulse">
                      {myQueue.status === 'called' ? 'YOUR TURN!' : 'Waiting'}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Available Doctors</CardTitle>
                <CardDescription>Choose a doctor to book your queue</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {doctors.map((doctor) => (
                  <Card key={doctor.id} className="hover:shadow-[var(--shadow-medical)] transition-all">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className="font-semibold text-lg">{doctor.full_name || 'Doctor'}</h3>
                          <p className="text-sm text-muted-foreground">{doctor.specialization}</p>
                        </div>
                        <Stethoscope className="w-8 h-8 text-primary" />
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                        <Clock className="w-4 h-4" />
                        <span>~{doctor.average_consultation_minutes} min per patient</span>
                      </div>
                      <Button
                        onClick={() => bookQueue(doctor.id)}
                        disabled={!!myQueue}
                        className="w-full"
                      >
                        {myQueue ? 'Already in Queue' : 'Book Queue'}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="w-5 h-5" />
                  Booking History
                </CardTitle>
                <CardDescription>Your past and current appointments</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {bookingHistory.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No booking history</p>
                ) : (
                  bookingHistory.map((booking) => (
                    <div key={booking.id} className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">Queue #{booking.queue_number}</p>
                          <p className="text-sm text-muted-foreground">
                            {booking.doctors.full_name || 'Doctor'} - {booking.doctors.specialization}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(booking.booked_at).toLocaleString()}
                          </p>
                        </div>
                        <Badge variant={
                          booking.status === 'completed' ? 'default' : 
                          booking.status === 'called' ? 'secondary' : 
                          'outline'
                        }>
                          {booking.status}
                        </Badge>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="records" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Medical Records
                </CardTitle>
                <CardDescription>Your medical history and prescriptions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {medicalRecords.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No medical records yet</p>
                ) : (
                  medicalRecords.map((record) => (
                    <Card key={record.id} className="border-primary/20">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium">
                              {record.queue_bookings.doctors.full_name || 'Doctor'}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {record.queue_bookings.doctors.specialization}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(record.created_at).toLocaleString()}
                            </p>
                          </div>
                          <Badge>Queue #{record.queue_bookings.queue_number}</Badge>
                        </div>
                        {record.diagnosis && (
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">Diagnosis:</p>
                            <p className="text-sm">{record.diagnosis}</p>
                          </div>
                        )}
                        {record.prescription && (
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">Prescription:</p>
                            <p className="text-sm">{record.prescription}</p>
                          </div>
                        )}
                        {record.notes && (
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">Notes:</p>
                            <p className="text-sm">{record.notes}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default PatientDashboard;
