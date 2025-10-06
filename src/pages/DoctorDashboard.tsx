import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Stethoscope, LogOut, Activity, Clock, Users, ChevronRight, FileText, Download, History } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface QueuePatient {
  id: string;
  queue_number: number;
  status: string;
  booked_at: string;
  called_at: string | null;
  completed_at: string | null;
  patient_id: string;
  profiles: {
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
    profiles: {
      full_name: string;
    };
  };
}

const DoctorDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [queueList, setQueueList] = useState<QueuePatient[]>([]);
  const [consultationTime, setConsultationTime] = useState(15);
  const [loading, setLoading] = useState(true);
  const [doctorId, setDoctorId] = useState<string>('');
  const [medicalRecords, setMedicalRecords] = useState<MedicalRecord[]>([]);
  const [completedBookings, setCompletedBookings] = useState<QueuePatient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<QueuePatient | null>(null);
  const [diagnosis, setDiagnosis] = useState('');
  const [prescription, setPrescription] = useState('');
  const [notes, setNotes] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

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
          await fetchMedicalRecords(newDoctor.id);
          await fetchCompletedBookings(newDoctor.id);
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
        await fetchMedicalRecords(doctor.id);
        await fetchCompletedBookings(doctor.id);
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

  const fetchMedicalRecords = async (drId: string) => {
    const { data, error } = await supabase
      .from('medical_records')
      .select('*, queue_bookings(queue_number, booked_at, profiles(full_name))')
      .eq('doctor_id', drId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setMedicalRecords(data);
    }
  };

  const fetchCompletedBookings = async (drId: string) => {
    const { data, error } = await supabase
      .from('queue_bookings')
      .select('*, profiles(full_name)')
      .eq('doctor_id', drId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false });

    if (!error && data) {
      setCompletedBookings(data);
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

  const completePatient = async (bookingId: string, patient: QueuePatient) => {
    setSelectedPatient(patient);
    setDialogOpen(true);
  };

  const saveMedicalRecord = async () => {
    if (!selectedPatient) return;

    const { error: recordError } = await supabase
      .from('medical_records')
      .insert({
        booking_id: selectedPatient.id,
        patient_id: selectedPatient.patient_id,
        doctor_id: doctorId,
        diagnosis,
        prescription,
        notes
      });

    if (recordError) {
      toast({
        title: 'Error',
        description: recordError.message,
        variant: 'destructive'
      });
      return;
    }

    const { error: bookingError } = await supabase
      .from('queue_bookings')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', selectedPatient.id);

    if (bookingError) {
      toast({
        title: 'Error',
        description: bookingError.message,
        variant: 'destructive'
      });
    } else {
      toast({
        title: 'Patient completed',
        description: 'Medical record saved and patient marked as completed'
      });
      setDialogOpen(false);
      setDiagnosis('');
      setPrescription('');
      setNotes('');
      setSelectedPatient(null);
      if (doctorId) {
        await fetchMedicalRecords(doctorId);
        await fetchCompletedBookings(doctorId);
      }
    }
  };

  const exportReport = (record: MedicalRecord) => {
    const content = `
MEDICAL REPORT
=============

Patient: ${record.queue_bookings.profiles?.full_name || 'Patient'}
Queue Number: ${record.queue_bookings.queue_number}
Date: ${new Date(record.created_at).toLocaleString()}

DIAGNOSIS:
${record.diagnosis || 'N/A'}

PRESCRIPTION:
${record.prescription || 'N/A'}

NOTES:
${record.notes || 'N/A'}
    `;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `medical-report-${record.queue_bookings.queue_number}-${new Date(record.created_at).toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: 'Report exported',
      description: 'Medical report downloaded successfully'
    });
  };

  const exportAllReports = () => {
    let content = 'MEDICAL REPORTS - ALL PATIENTS\n';
    content += '================================\n\n';

    medicalRecords.forEach((record, index) => {
      content += `REPORT ${index + 1}\n`;
      content += `Patient: ${record.queue_bookings.profiles?.full_name || 'Patient'}\n`;
      content += `Queue Number: ${record.queue_bookings.queue_number}\n`;
      content += `Date: ${new Date(record.created_at).toLocaleString()}\n\n`;
      content += `DIAGNOSIS:\n${record.diagnosis || 'N/A'}\n\n`;
      content += `PRESCRIPTION:\n${record.prescription || 'N/A'}\n\n`;
      content += `NOTES:\n${record.notes || 'N/A'}\n\n`;
      content += '---\n\n';
    });

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `all-medical-reports-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: 'All reports exported',
      description: `${medicalRecords.length} medical reports downloaded successfully`
    });
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
        <Tabs defaultValue="queue" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="queue">Current Queue</TabsTrigger>
            <TabsTrigger value="history">Booking History</TabsTrigger>
            <TabsTrigger value="records">Medical Records</TabsTrigger>
          </TabsList>

          <TabsContent value="queue" className="space-y-6 mt-6">
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
                      <p className="text-lg">{currentPatient.profiles?.full_name || 'Patient'}</p>
                      <p className="text-sm text-muted-foreground">Called at {new Date(currentPatient.called_at || '').toLocaleTimeString()}</p>
                    </div>
                    <Button onClick={() => completePatient(currentPatient.id, currentPatient)} size="lg" variant="default">
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
                            <p className="font-medium">{patient.profiles?.full_name || 'Patient'}</p>
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
          </TabsContent>

          <TabsContent value="history" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="w-5 h-5" />
                  Completed Bookings
                </CardTitle>
                <CardDescription>History of completed consultations</CardDescription>
              </CardHeader>
              <CardContent>
                {completedBookings.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No completed bookings</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Queue #</TableHead>
                        <TableHead>Patient</TableHead>
                        <TableHead>Booked At</TableHead>
                        <TableHead>Completed At</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {completedBookings.map((booking) => (
                        <TableRow key={booking.id}>
                          <TableCell className="font-medium">{booking.queue_number}</TableCell>
                          <TableCell>{booking.profiles?.full_name || 'Patient'}</TableCell>
                          <TableCell>{new Date(booking.booked_at).toLocaleString()}</TableCell>
                          <TableCell>{booking.completed_at ? new Date(booking.completed_at).toLocaleString() : '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="records" className="mt-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="w-5 h-5" />
                      Medical Records
                    </CardTitle>
                    <CardDescription>Patient medical records and reports</CardDescription>
                  </div>
                  <Button onClick={exportAllReports} disabled={medicalRecords.length === 0}>
                    <Download className="w-4 h-4 mr-2" />
                    Export All
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {medicalRecords.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No medical records</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Queue #</TableHead>
                        <TableHead>Patient</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Diagnosis</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {medicalRecords.map((record) => (
                        <TableRow key={record.id}>
                          <TableCell className="font-medium">{record.queue_bookings.queue_number}</TableCell>
                          <TableCell>{record.queue_bookings.profiles?.full_name || 'Patient'}</TableCell>
                          <TableCell>{new Date(record.created_at).toLocaleString()}</TableCell>
                          <TableCell>{record.diagnosis || 'N/A'}</TableCell>
                          <TableCell>
                            <Button variant="outline" size="sm" onClick={() => exportReport(record)}>
                              <Download className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Complete Consultation - Add Medical Record</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="diagnosis">Diagnosis</Label>
                <Textarea
                  id="diagnosis"
                  placeholder="Enter diagnosis..."
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="prescription">Prescription</Label>
                <Textarea
                  id="prescription"
                  placeholder="Enter prescription..."
                  value={prescription}
                  onChange={(e) => setPrescription(e.target.value)}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Additional notes..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-2"
                />
              </div>
              <Button onClick={saveMedicalRecord} className="w-full">
                Save & Complete
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

export default DoctorDashboard;
