import { useCallback, useEffect, useRef, useState } from 'react';
import type { ViewType } from '@/types';
import {
  ArrowLeft,
  Shield,
  Trash2,
  Users,
  PawPrint,
  Plus,
  Pencil,
  KeyRound,
  Calendar,
  Bell,
  FileText,
  Syringe,
  Utensils,
  Dumbbell,
  Download,
} from 'lucide-react';
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { apiJson } from '@/lib/api';

interface Overview {
  userCount: number;
  activeUserCount: number;
  petCount: number;
  healthRecordCount: number;
  vaccinationCount: number;
  appointmentCount: number;
  reminderCount: number;
  notificationCount: number;
  missedVaccinationCount: number;
  overdueReminderCount: number;
  incompleteFeedingCount: number;
  upcomingReminderWindowCount: number;
  reminderDaysBefore: number;
}

interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  isVet?: boolean;
  vetLicenseId?: string;
  isActive: boolean;
  petCount: number;
  createdAt: string;
}

interface AdminPetRow {
  id: string;
  userId: string;
  name: string;
  type: string;
  breed: string;
  age: number;
  weight: number;
  status: string;
  ownerEmail: string;
  ownerName: string;
  createdAt: string;
  healthCondition?: string;
}

interface AdminSettings {
  reminderDaysBefore: number;
}

interface AdminVaxRow {
  id: string;
  petId: string;
  petName: string;
  vaccineName: string;
  date: string;
  nextDueDate: string | null;
  status: string;
  ownerEmail: string;
  ownerName: string;
  missed: boolean;
}

interface AdminFeedRow {
  id: string;
  petId: string;
  petName: string;
  time: string;
  portionSize: string;
  foodType: string;
  completed: boolean;
  ownerEmail: string;
  ownerName: string;
  missed: boolean;
}

interface AdminExerciseRow {
  id: string;
  petId: string;
  petName: string;
  type: string;
  duration: number;
  date: string;
  ownerEmail: string;
  ownerName: string;
  stale: boolean;
}

interface AdminHealthRow {
  id: string;
  petId: string;
  petName: string;
  ownerEmail: string;
  ownerName: string;
  type: string;
  date: string;
  notes: string;
  createdAt: string;
}

interface AdminApptRow {
  id: string;
  petId: string;
  petName: string;
  reason: string;
  date: string;
  time: string;
  status: string;
  ownerEmail: string;
  ownerName: string;
}

interface AdminReminderRow {
  id: string;
  userId: string;
  petName?: string;
  ownerEmail: string;
  ownerName: string;
  type: string;
  title: string;
  date: string;
  time?: string;
  priority: string;
  completed: boolean;
  description?: string;
  overdue: boolean;
}

interface AdminNotifRow {
  id: string;
  userId: string;
  ownerEmail: string;
  ownerName: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  createdAt: string;
}

interface ReportSummary {
  period: 'range';
  startDate: string;
  endDate: string;
  newUsers: number;
  newPets: number;
  healthRecords: number;
  vaccinationsGiven: number;
  exerciseLogs: number;
  remindersDue: number;
  appointments: number;
  notifications: number;
  auditEvents: number;
  missedVaccinations: number;
}

interface TransactionHistoryRow {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  action: string;
  entityType: string;
  entityId: string;
  detail: string;
  createdAt: string;
}

interface ActivityLogRow {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  type: string;
  title: string;
  description: string;
  petName: string;
  occurredAt: string;
}

type UserRoleChoice = 'owner' | 'admin' | 'vet';

interface AdminDashboardPageProps {
  onNavigate: (view: ViewType) => void;
  currentUserId: string;
}

export default function AdminDashboardPage({ onNavigate, currentUserId }: AdminDashboardPageProps) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [pets, setPets] = useState<AdminPetRow[]>([]);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [vaccinations, setVaccinations] = useState<AdminVaxRow[]>([]);
  const [feeding, setFeeding] = useState<AdminFeedRow[]>([]);
  const [exercises, setExercises] = useState<AdminExerciseRow[]>([]);
  const [healthRecords, setHealthRecords] = useState<AdminHealthRow[]>([]);
  const [appointments, setAppointments] = useState<AdminApptRow[]>([]);
  const [reminders, setReminders] = useState<AdminReminderRow[]>([]);
  const [notifications, setNotifications] = useState<AdminNotifRow[]>([]);
  const [report, setReport] = useState<ReportSummary | null>(null);
  const [transactionHistory, setTransactionHistory] = useState<TransactionHistoryRow[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLogRow[]>([]);
  const [reportStartDate, setReportStartDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [reportEndDate, setReportEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const reportStartRef = useRef(reportStartDate);
  const reportEndRef = useRef(reportEndDate);
  reportStartRef.current = reportStartDate;
  reportEndRef.current = reportEndDate;
  const [loading, setLoading] = useState(true);

  const [addUserOpen, setAddUserOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [addRole, setAddRole] = useState<UserRoleChoice>('owner');
  const [addVetLicense, setAddVetLicense] = useState('');

  const [editUser, setEditUser] = useState<AdminUserRow | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<UserRoleChoice>('owner');
  const [editVetLicense, setEditVetLicense] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);

  const [resetUser, setResetUser] = useState<AdminUserRow | null>(null);
  const [resetPassword, setResetPassword] = useState('');

  const [editPet, setEditPet] = useState<AdminPetRow | null>(null);
  const [petName, setPetName] = useState('');
  const [petType, setPetType] = useState('');
  const [petBreed, setPetBreed] = useState('');
  const [petAge, setPetAge] = useState('');
  const [petWeight, setPetWeight] = useState('');
  const [petStatus, setPetStatus] = useState('');
  const [petHealth, setPetHealth] = useState('');

  const fetchReport = useCallback(async (startDate: string, endDate: string) => {
    try {
      const r = await apiJson<ReportSummary>(
        `/api/admin/reports/summary?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
      );
      setReport(r);
    } catch (e) {
      toast.error('Could not load report', { description: String(e) });
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [
        o,
        u,
        p,
        s,
        v,
        f,
        e,
        h,
        a,
        r,
        n,
        rep,
        th,
        al,
      ] = await Promise.all([
        apiJson<Overview>('/api/admin/overview'),
        apiJson<AdminUserRow[]>('/api/admin/users'),
        apiJson<AdminPetRow[]>('/api/admin/pets'),
        apiJson<AdminSettings>('/api/admin/settings'),
        apiJson<AdminVaxRow[]>('/api/admin/vaccinations'),
        apiJson<AdminFeedRow[]>('/api/admin/feeding-schedules'),
        apiJson<AdminExerciseRow[]>('/api/admin/exercises'),
        apiJson<AdminHealthRow[]>('/api/admin/health-records'),
        apiJson<AdminApptRow[]>('/api/admin/appointments'),
        apiJson<AdminReminderRow[]>('/api/admin/reminders'),
        apiJson<AdminNotifRow[]>('/api/admin/notifications'),
        apiJson<ReportSummary>(
          `/api/admin/reports/summary?startDate=${encodeURIComponent(reportStartRef.current)}&endDate=${encodeURIComponent(reportEndRef.current)}`,
        ),
        apiJson<TransactionHistoryRow[]>('/api/admin/reports/transaction-history?limit=120'),
        apiJson<ActivityLogRow[]>('/api/admin/reports/activity-logs?limit=120'),
      ]);
      setOverview(o);
      setUsers(u);
      setPets(p);
      setSettings(s);
      setVaccinations(v);
      setFeeding(f);
      setExercises(e);
      setHealthRecords(h);
      setAppointments(a);
      setReminders(r);
      setNotifications(n);
      setReport(rep);
      setTransactionHistory(th);
      setActivityLogs(al);
    } catch (e) {
      toast.error('Could not load admin data', { description: String(e) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const saveReminderRule = async (days: number) => {
    try {
      const s = await apiJson<AdminSettings>('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify({ reminderDaysBefore: days }),
      });
      setSettings(s);
      toast.success('Reminder rule updated');
      loadAll();
    } catch (e) {
      toast.error('Could not save setting', { description: String(e) });
    }
  };

  const submitAddUser = async () => {
    try {
      await apiJson('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          name: addName,
          email: addEmail,
          password: addPassword,
          isAdmin: addRole === 'admin',
          isVet: addRole === 'vet',
          vetLicenseId: addVetLicense.trim() || undefined,
        }),
      });
      toast.success('User created');
      setAddUserOpen(false);
      setAddName('');
      setAddEmail('');
      setAddPassword('');
      setAddRole('owner');
      setAddVetLicense('');
      loadAll();
    } catch (e) {
      toast.error('Could not create user', { description: String(e) });
    }
  };

  const openEditUser = (row: AdminUserRow) => {
    setEditUser(row);
    setEditName(row.name);
    setEditEmail(row.email);
    setEditRole(row.isAdmin ? 'admin' : row.isVet ? 'vet' : 'owner');
    setEditVetLicense(row.vetLicenseId || '');
    setEditIsActive(row.isActive);
  };

  const submitEditUser = async () => {
    if (!editUser) return;
    try {
      await apiJson(`/api/admin/users/${editUser.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editName,
          email: editEmail,
          isAdmin: editRole === 'admin',
          isVet: editRole === 'vet',
          vetLicenseId: editVetLicense.trim() || null,
          isActive: editIsActive,
        }),
      });
      toast.success('User updated');
      setEditUser(null);
      loadAll();
    } catch (e) {
      toast.error('Could not update user', { description: String(e) });
    }
  };

  const submitResetPassword = async () => {
    if (!resetUser) return;
    try {
      await apiJson(`/api/admin/users/${resetUser.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ newPassword: resetPassword }),
      });
      toast.success('Password reset');
      setResetUser(null);
      setResetPassword('');
    } catch (e) {
      toast.error('Could not reset password', { description: String(e) });
    }
  };

  const toggleUserActive = async (row: AdminUserRow, active: boolean) => {
    if (row.id === currentUserId && !active) {
      toast.error('You cannot deactivate your own account.');
      return;
    }
    try {
      await apiJson(`/api/admin/users/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: active }),
      });
      toast.success(active ? 'Account activated' : 'Account deactivated');
      loadAll();
    } catch (e) {
      toast.error('Could not update account', { description: String(e) });
    }
  };

  const deleteUser = async (row: AdminUserRow) => {
    if (row.id === currentUserId) {
      toast.error('You cannot delete your own account from this screen.');
      return;
    }
    if (
      !confirm(
        `Delete user ${row.email} and all data tied to their account? This cannot be undone.`,
      )
    ) {
      return;
    }
    try {
      await apiJson(`/api/admin/users/${row.id}`, { method: 'DELETE' });
      toast.success('User removed');
      loadAll();
    } catch (e) {
      toast.error('Could not delete user', { description: String(e) });
    }
  };

  const openEditPet = (row: AdminPetRow) => {
    setEditPet(row);
    setPetName(row.name);
    setPetType(row.type);
    setPetBreed(row.breed);
    setPetAge(String(row.age));
    setPetWeight(String(row.weight));
    setPetStatus(row.status);
    setPetHealth(row.healthCondition ?? '');
  };

  const submitEditPet = async () => {
    if (!editPet) return;
    try {
      await apiJson(`/api/admin/pets/${editPet.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: petName,
          type: petType,
          breed: petBreed,
          age: Number(petAge),
          weight: Number(petWeight),
          status: petStatus,
          healthCondition: petHealth || null,
        }),
      });
      toast.success('Pet updated');
      setEditPet(null);
      loadAll();
    } catch (e) {
      toast.error('Could not update pet', { description: String(e) });
    }
  };

  const toggleReminderDone = async (row: AdminReminderRow) => {
    try {
      await apiJson(`/api/admin/reminders/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ completed: !row.completed }),
      });
      loadAll();
    } catch (e) {
      toast.error('Could not update reminder', { description: String(e) });
    }
  };

  const deleteReminder = async (row: AdminReminderRow) => {
    if (!confirm(`Delete reminder “${row.title}”?`)) return;
    try {
      await apiJson(`/api/admin/reminders/${row.id}`, { method: 'DELETE' });
      toast.success('Reminder removed');
      loadAll();
    } catch (e) {
      toast.error('Could not delete reminder', { description: String(e) });
    }
  };

  const fmt = (d: string) => {
    try {
      return new Date(d).toLocaleString();
    } catch {
      return d;
    }
  };

  const fmtDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString();
    } catch {
      return d;
    }
  };

  const downloadFile = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const toCsv = (headers: string[], rows: (string | number | boolean | null | undefined)[][]) => {
    const esc = (v: unknown) => `"${String(v ?? '').replaceAll('"', '""')}"`;
    return [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
  };

  const exportTransactionCsv = () => {
    const csv = toCsv(
      ['Date', 'User', 'Action', 'Entity', 'Entity ID', 'Detail'],
      transactionHistory.map((t) => [fmt(t.createdAt), t.userEmail || t.userName, t.action, t.entityType, t.entityId, t.detail]),
    );
    downloadFile(csv, 'petcare-transaction-history.csv', 'text/csv;charset=utf-8;');
  };

  const exportActivityCsv = () => {
    const csv = toCsv(
      ['When', 'User', 'Type', 'Title', 'Pet', 'Description'],
      activityLogs.map((a) => [fmt(a.occurredAt), a.userEmail || a.userName, a.type, a.title, a.petName, a.description]),
    );
    downloadFile(csv, 'petcare-activity-logs.csv', 'text/csv;charset=utf-8;');
  };

  const exportSummaryExcel = () => {
    if (!report) return;
    const periodLabel = `${report.startDate} → ${report.endDate}`;
    const html = `
      <table>
        <tr><th>Period</th><th>New Users</th><th>New Pets</th><th>Health Records</th><th>Vaccinations</th><th>Missed Vaccinations</th><th>Exercise Logs</th><th>Reminders Due</th><th>Appointments</th><th>Notifications</th><th>Audit Events</th></tr>
        <tr><td>${periodLabel}</td><td>${report.newUsers}</td><td>${report.newPets}</td><td>${report.healthRecords}</td><td>${report.vaccinationsGiven}</td><td>${report.missedVaccinations}</td><td>${report.exerciseLogs}</td><td>${report.remindersDue}</td><td>${report.appointments}</td><td>${report.notifications}</td><td>${report.auditEvents}</td></tr>
      </table>
    `.trim();
    downloadFile(
      html,
      `petcare-summary-${report.startDate}-to-${report.endDate}.xls`,
      'application/vnd.ms-excel',
    );
  };

  const exportPdf = () => {
    window.print();
  };

  const reportChartData = report
    ? [
        { name: 'Users', value: report.newUsers },
        { name: 'Pets', value: report.newPets },
        { name: 'Records', value: report.healthRecords },
        { name: 'Vaccines', value: report.vaccinationsGiven },
        { name: 'Exercise', value: report.exerciseLogs },
        { name: 'Reminders', value: report.remindersDue },
        { name: 'Appointments', value: report.appointments },
        { name: 'Notifications', value: report.notifications },
        { name: 'Audit', value: report.auditEvents },
      ]
    : [];

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <button
          type="button"
          onClick={() => onNavigate('dashboard')}
          className="flex items-center gap-2 text-sm text-[#5A6B7A] hover:text-[#1A202C] mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to dashboard
        </button>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#1A202C] flex items-center justify-center shrink-0">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-[#1A202C]">Admin — authorized access</h1>
              <p className="text-[#5A6B7A] text-sm">
                User &amp; pet management, schedules, reminders, notifications, and reports across PetCare+.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="border-[#D6E3F0]"
            onClick={() => loadAll()}
            disabled={loading}
          >
            Refresh data
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="gap-4">
        <TabsList className="flex flex-wrap h-auto gap-1 bg-[#E8EEF5] p-1 rounded-xl">
          <TabsTrigger value="overview" className="rounded-lg data-[state=active]:bg-white">
            Overview
          </TabsTrigger>
          <TabsTrigger value="users" className="rounded-lg data-[state=active]:bg-white">
            Users
          </TabsTrigger>
          <TabsTrigger value="pets" className="rounded-lg data-[state=active]:bg-white">
            Pets
          </TabsTrigger>
          <TabsTrigger value="schedules" className="rounded-lg data-[state=active]:bg-white">
            Schedules &amp; records
          </TabsTrigger>
          <TabsTrigger value="reminders" className="rounded-lg data-[state=active]:bg-white">
            Reminders
          </TabsTrigger>
          <TabsTrigger value="notifications" className="rounded-lg data-[state=active]:bg-white">
            Notifications
          </TabsTrigger>
          <TabsTrigger value="reports" className="rounded-lg data-[state=active]:bg-white">
            Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {loading && !overview ? (
            <p className="text-[#5A6B7A]">Loading…</p>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                <Card className="border-[#D6E3F0] shadow-sm">
                  <CardHeader className="pb-2">
                    <CardDescription className="flex items-center gap-1 text-xs">
                      <Users className="w-3.5 h-3.5" /> Users (active)
                    </CardDescription>
                    <CardTitle className="text-2xl">
                      {overview?.activeUserCount ?? '—'} / {overview?.userCount ?? '—'}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card className="border-[#D6E3F0] shadow-sm">
                  <CardHeader className="pb-2">
                    <CardDescription className="flex items-center gap-1 text-xs">
                      <PawPrint className="w-3.5 h-3.5" /> Pets
                    </CardDescription>
                    <CardTitle className="text-2xl">{overview?.petCount ?? '—'}</CardTitle>
                  </CardHeader>
                </Card>
                <Card className="border-amber-200 bg-amber-50/50 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-xs">Missed vaccinations</CardDescription>
                    <CardTitle className="text-2xl text-amber-900">
                      {overview?.missedVaccinationCount ?? '—'}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card className="border-red-200 bg-red-50/40 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-xs">Overdue reminders</CardDescription>
                    <CardTitle className="text-2xl text-red-900">
                      {overview?.overdueReminderCount ?? '—'}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card className="border-[#D6E3F0] shadow-sm">
                  <CardHeader className="pb-2">
                    <CardDescription className="flex items-center gap-1 text-xs">
                      <Utensils className="w-3.5 h-3.5" /> Incomplete feeding rows
                    </CardDescription>
                    <CardTitle className="text-2xl">{overview?.incompleteFeedingCount ?? '—'}</CardTitle>
                  </CardHeader>
                </Card>
                <Card className="border-[#D6E3F0] shadow-sm">
                  <CardHeader className="pb-2">
                    <CardDescription className="flex items-center gap-1 text-xs">
                      <Bell className="w-3.5 h-3.5" /> Reminders in alert window
                    </CardDescription>
                    <CardTitle className="text-2xl">{overview?.upcomingReminderWindowCount ?? '—'}</CardTitle>
                  </CardHeader>
                </Card>
                <Card className="border-[#D6E3F0] shadow-sm">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-xs">Health records</CardDescription>
                    <CardTitle className="text-2xl">{overview?.healthRecordCount ?? '—'}</CardTitle>
                  </CardHeader>
                </Card>
                <Card className="border-[#D6E3F0] shadow-sm">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-xs">Notification log size</CardDescription>
                    <CardTitle className="text-2xl">{overview?.notificationCount ?? '—'}</CardTitle>
                  </CardHeader>
                </Card>
              </div>
              <Card className="border-[#D6E3F0]">
                <CardHeader>
                  <CardTitle className="text-base">Vet &amp; shared records</CardTitle>
                  <CardDescription>
                    All health records in the system are visible here for oversight. Per-owner “share with vet” flags
                    can be added later; today, admins use health record and pet tables for coordinated care.
                  </CardDescription>
                </CardHeader>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
          <div className="flex justify-end">
            <Button
              type="button"
              className="bg-[#1A202C] hover:bg-[#2D3748]"
              onClick={() => {
                setAddName('');
                setAddEmail('');
                setAddPassword('');
                setAddRole('owner');
                setAddVetLicense('');
                setAddUserOpen(true);
              }}
            >
              <Plus className="w-4 h-4 mr-1" />
              Add user
            </Button>
          </div>
          <Card className="border-[#D6E3F0] shadow-[0_10px_30px_rgba(30,60,90,0.06)]">
            <CardHeader>
              <CardTitle className="text-lg">User management</CardTitle>
              <CardDescription>
                Add, edit, activate or deactivate accounts, reset passwords, or remove users (not yourself).
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#D6E3F0]">
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead>Pets</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id} className="border-[#D6E3F0]">
                      <TableCell className="font-medium text-[#1A202C]">{u.name}</TableCell>
                      <TableCell className="text-[#5A6B7A]">{u.email}</TableCell>
                      <TableCell>
                        {u.isAdmin ? 'Admin' : u.isVet ? 'Veterinarian' : 'Owner'}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={u.isActive}
                          disabled={u.id === currentUserId}
                          onCheckedChange={(c) => toggleUserActive(u, c)}
                        />
                      </TableCell>
                      <TableCell>{u.petCount}</TableCell>
                      <TableCell className="text-sm text-[#5A6B7A]">{fmt(u.createdAt)}</TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button type="button" variant="outline" size="sm" onClick={() => openEditUser(u)}>
                          <Pencil className="w-4 h-4 mr-1" />
                          Edit
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => setResetUser(u)}>
                          <KeyRound className="w-4 h-4 mr-1" />
                          Reset PW
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={u.id === currentUserId}
                          className="text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => deleteUser(u)}
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!users.length && !loading && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-[#5A6B7A] py-8">
                        No users found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pets" className="space-y-4">
          <Card className="border-[#D6E3F0] shadow-[0_10px_30px_rgba(30,60,90,0.06)]">
            <CardHeader>
              <CardTitle className="text-lg">Pet &amp; data oversight</CardTitle>
              <CardDescription>
                All pets system-wide. Edit core profile fields (limited). Pet removal is only available to each owner from their My Pets page.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#D6E3F0]">
                    <TableHead>Pet</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Owner email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pets.map((p) => (
                    <TableRow key={p.id} className="border-[#D6E3F0]">
                      <TableCell className="font-medium text-[#1A202C]">{p.name}</TableCell>
                      <TableCell className="text-[#5A6B7A]">
                        {p.type} · {p.breed}
                      </TableCell>
                      <TableCell>{p.ownerName || '—'}</TableCell>
                      <TableCell className="text-sm">{p.ownerEmail || '—'}</TableCell>
                      <TableCell>{p.status}</TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button type="button" variant="outline" size="sm" onClick={() => openEditPet(p)}>
                          <Pencil className="w-4 h-4 mr-1" />
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!pets.length && !loading && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-[#5A6B7A] py-8">
                        No pets yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedules" className="space-y-4">
          <Tabs defaultValue="vax" className="gap-3">
            <TabsList className="flex flex-wrap h-auto gap-1">
              <TabsTrigger value="vax" className="gap-1">
                <Syringe className="w-3.5 h-3.5" /> Vaccinations
              </TabsTrigger>
              <TabsTrigger value="feed" className="gap-1">
                <Utensils className="w-3.5 h-3.5" /> Feeding
              </TabsTrigger>
              <TabsTrigger value="ex" className="gap-1">
                <Dumbbell className="w-3.5 h-3.5" /> Exercise
              </TabsTrigger>
              <TabsTrigger value="health" className="gap-1">
                <FileText className="w-3.5 h-3.5" /> Health records
              </TabsTrigger>
              <TabsTrigger value="appt" className="gap-1">
                <Calendar className="w-3.5 h-3.5" /> Appointments
              </TabsTrigger>
            </TabsList>
            <TabsContent value="vax">
              <Card className="border-[#D6E3F0]">
                <CardHeader>
                  <CardTitle className="text-base">Vaccination schedules</CardTitle>
                  <CardDescription>
                    Rows flagged <strong>Missed</strong> are pending with a next due date in the past.
                  </CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto max-h-[480px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Pet</TableHead>
                        <TableHead>Vaccine</TableHead>
                        <TableHead>Given</TableHead>
                        <TableHead>Next due</TableHead>
                        <TableHead>Owner</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vaccinations.map((v) => (
                        <TableRow key={v.id} className={v.missed ? 'bg-amber-50/80' : ''}>
                          <TableCell>{v.petName}</TableCell>
                          <TableCell>{v.vaccineName}</TableCell>
                          <TableCell>{fmtDate(v.date)}</TableCell>
                          <TableCell>{v.nextDueDate ? fmtDate(v.nextDueDate) : '—'}</TableCell>
                          <TableCell className="text-sm">{v.ownerEmail}</TableCell>
                          <TableCell>
                            {v.missed ? 'Missed' : v.status}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="feed">
              <Card className="border-[#D6E3F0]">
                <CardHeader>
                  <CardTitle className="text-base">Feeding schedules</CardTitle>
                  <CardDescription>
                    Incomplete rows are highlighted; owners should mark completed when fed.
                  </CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto max-h-[480px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Pet</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead>Food</TableHead>
                        <TableHead>Owner</TableHead>
                        <TableHead>Done</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {feeding.map((f) => (
                        <TableRow key={f.id} className={f.missed ? 'bg-amber-50/80' : ''}>
                          <TableCell>{f.petName}</TableCell>
                          <TableCell>{f.time}</TableCell>
                          <TableCell>
                            {f.foodType} ({f.portionSize})
                          </TableCell>
                          <TableCell className="text-sm">{f.ownerEmail}</TableCell>
                          <TableCell>{f.completed ? 'Yes' : 'No'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="ex">
              <Card className="border-[#D6E3F0]">
                <CardHeader>
                  <CardTitle className="text-base">Exercise logs</CardTitle>
                  <CardDescription>
                    Past dates without a newer log may warrant follow-up with the owner.
                  </CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto max-h-[480px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Pet</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Minutes</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Owner</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {exercises.map((x) => (
                        <TableRow key={x.id} className={x.stale ? 'bg-slate-50' : ''}>
                          <TableCell>{x.petName}</TableCell>
                          <TableCell>{x.type}</TableCell>
                          <TableCell>{x.duration}</TableCell>
                          <TableCell>{fmtDate(x.date)}</TableCell>
                          <TableCell className="text-sm">{x.ownerEmail}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="health">
              <Card className="border-[#D6E3F0]">
                <CardHeader>
                  <CardTitle className="text-base">Health records (all pets)</CardTitle>
                  <CardDescription>Read-only oversight of check-ups and notes.</CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto max-h-[480px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Pet</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Owner</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {healthRecords.map((h) => (
                        <TableRow key={h.id}>
                          <TableCell>{h.petName}</TableCell>
                          <TableCell>{h.type}</TableCell>
                          <TableCell>{fmtDate(h.date)}</TableCell>
                          <TableCell className="text-sm">{h.ownerEmail}</TableCell>
                          <TableCell className="max-w-xs truncate text-sm text-[#5A6B7A]">{h.notes}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="appt">
              <Card className="border-[#D6E3F0]">
                <CardHeader>
                  <CardTitle className="text-base">Appointments</CardTitle>
                  <CardDescription>All scheduled visits across the system.</CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto max-h-[480px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Pet</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>When</TableHead>
                        <TableHead>Owner</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {appointments.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell>{a.petName}</TableCell>
                          <TableCell>{a.reason}</TableCell>
                          <TableCell>
                            {fmtDate(a.date)} {a.time}
                          </TableCell>
                          <TableCell className="text-sm">{a.ownerEmail}</TableCell>
                          <TableCell>{a.status}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="reminders" className="space-y-4">
          <Card className="border-[#D6E3F0]">
            <CardHeader>
              <CardTitle className="text-base">Reminder rule</CardTitle>
              <CardDescription>
                Days before a due date to count reminders in the “alert window” on the overview (0–30).
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end gap-4">
              <div className="space-y-2">
                <Label htmlFor="rule-days">Days before due date</Label>
                <Input
                  id="rule-days"
                  type="number"
                  min={0}
                  max={30}
                  className="w-32"
                  defaultValue={settings?.reminderDaysBefore ?? overview?.reminderDaysBefore ?? 3}
                  key={settings?.reminderDaysBefore ?? overview?.reminderDaysBefore ?? 's'}
                  onBlur={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n)) saveReminderRule(n);
                  }}
                />
              </div>
            </CardContent>
          </Card>
          <Card className="border-[#D6E3F0]">
            <CardHeader>
              <CardTitle className="text-lg">All reminders</CardTitle>
              <CardDescription>Mark complete or remove system-wide reminders.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto max-h-[520px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Done</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reminders.map((r) => (
                    <TableRow key={r.id} className={r.overdue && !r.completed ? 'bg-red-50/60' : ''}>
                      <TableCell>
                        <div className="font-medium">{r.title}</div>
                        <div className="text-xs text-[#5A6B7A]">{r.type}</div>
                      </TableCell>
                      <TableCell className="text-sm">{r.ownerEmail}</TableCell>
                      <TableCell>
                        {fmtDate(r.date)} {r.time ? `· ${r.time}` : ''}
                      </TableCell>
                      <TableCell>{r.priority}</TableCell>
                      <TableCell>
                        <Switch checked={r.completed} onCheckedChange={() => toggleReminderDone(r)} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-red-600 border-red-200"
                          onClick={() => deleteReminder(r)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4">
          <Card className="border-[#D6E3F0]">
            <CardHeader>
              <CardTitle className="text-lg">Notification log</CardTitle>
              <CardDescription>Recent in-app notifications by user (newest first).</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto max-h-[560px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Read</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notifications.map((n) => (
                    <TableRow key={n.id}>
                      <TableCell className="text-sm whitespace-nowrap">{fmt(n.createdAt)}</TableCell>
                      <TableCell className="text-sm">{n.ownerEmail}</TableCell>
                      <TableCell className="font-medium">{n.title}</TableCell>
                      <TableCell className="max-w-md text-sm text-[#5A6B7A]">{n.message}</TableCell>
                      <TableCell>{n.read ? 'Yes' : 'No'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="admin-report-start" className="text-xs text-[#5A6B7A]">
                Start Date
              </Label>
              <Input
                id="admin-report-start"
                type="date"
                value={reportStartDate}
                className="w-auto min-w-[11rem] rounded-xl border-[#D6E3F0]"
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  setReportStartDate(v);
                  const end = reportEndRef.current;
                  if (end) void fetchReport(v, end);
                }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="admin-report-end" className="text-xs text-[#5A6B7A]">
                End Date
              </Label>
              <Input
                id="admin-report-end"
                type="date"
                value={reportEndDate}
                className="w-auto min-w-[11rem] rounded-xl border-[#D6E3F0]"
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  setReportEndDate(v);
                  const start = reportStartRef.current;
                  if (start) void fetchReport(start, v);
                }}
              />
            </div>
            <Button type="button" variant="outline" onClick={exportSummaryExcel}>
              <Download className="w-4 h-4 mr-1" />
              Summary Excel
            </Button>
            <Button type="button" variant="outline" onClick={exportPdf}>
              <Download className="w-4 h-4 mr-1" />
              PDF (Print)
            </Button>
          </div>
          {report && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Card className="border-[#D6E3F0]"><CardHeader className="pb-2"><CardDescription className="text-xs">New users</CardDescription><CardTitle className="text-xl">{report.newUsers}</CardTitle></CardHeader></Card>
                <Card className="border-[#D6E3F0]"><CardHeader className="pb-2"><CardDescription className="text-xs">New pets</CardDescription><CardTitle className="text-xl">{report.newPets}</CardTitle></CardHeader></Card>
                <Card className="border-[#D6E3F0]"><CardHeader className="pb-2"><CardDescription className="text-xs">Health records</CardDescription><CardTitle className="text-xl">{report.healthRecords}</CardTitle></CardHeader></Card>
                <Card className="border-[#D6E3F0]"><CardHeader className="pb-2"><CardDescription className="text-xs">Vaccinations given</CardDescription><CardTitle className="text-xl">{report.vaccinationsGiven}</CardTitle></CardHeader></Card>
                <Card className="border-amber-200 bg-amber-50/50"><CardHeader className="pb-2"><CardDescription className="text-xs">Missed vaccinations (system)</CardDescription><CardTitle className="text-xl text-amber-900">{report.missedVaccinations}</CardTitle></CardHeader></Card>
                <Card className="border-[#D6E3F0]"><CardHeader className="pb-2"><CardDescription className="text-xs">Exercise logs</CardDescription><CardTitle className="text-xl">{report.exerciseLogs}</CardTitle></CardHeader></Card>
                <Card className="border-[#D6E3F0]"><CardHeader className="pb-2"><CardDescription className="text-xs">Reminders (due in period)</CardDescription><CardTitle className="text-xl">{report.remindersDue}</CardTitle></CardHeader></Card>
                <Card className="border-[#D6E3F0]"><CardHeader className="pb-2"><CardDescription className="text-xs">Appointments</CardDescription><CardTitle className="text-xl">{report.appointments}</CardTitle></CardHeader></Card>
                <Card className="border-[#D6E3F0]"><CardHeader className="pb-2"><CardDescription className="text-xs">Notifications sent</CardDescription><CardTitle className="text-xl">{report.notifications}</CardTitle></CardHeader></Card>
                <Card className="border-[#D6E3F0]"><CardHeader className="pb-2"><CardDescription className="text-xs">Audit events</CardDescription><CardTitle className="text-xl">{report.auditEvents}</CardTitle></CardHeader></Card>
              </div>
              <Card className="border-[#D6E3F0]">
                <CardHeader>
                  <CardTitle className="text-base">Summary chart</CardTitle>
                  <CardDescription>
                    Metrics from {report.startDate} through {report.endDate}.
                  </CardDescription>
                </CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={reportChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="value" fill="#2B6CB0" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </>
          )}
          <Card className="border-[#D6E3F0]">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Transaction history</CardTitle>
                <CardDescription>System audit trail for create/update/delete and sharing actions.</CardDescription>
              </div>
              <Button type="button" variant="outline" onClick={exportTransactionCsv}>
                <Download className="w-4 h-4 mr-1" />
                Export CSV
              </Button>
            </CardHeader>
            <CardContent className="overflow-x-auto max-h-[360px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactionHistory.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-sm whitespace-nowrap">{fmt(t.createdAt)}</TableCell>
                      <TableCell className="text-sm">{t.userEmail || t.userName || t.userId}</TableCell>
                      <TableCell>{t.action}</TableCell>
                      <TableCell>{t.entityType} {t.entityId ? `#${t.entityId}` : ''}</TableCell>
                      <TableCell className="max-w-md text-sm text-[#5A6B7A]">{t.detail || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card className="border-[#D6E3F0]">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">User activity logs</CardTitle>
                <CardDescription>Recent user-facing activities generated by the system.</CardDescription>
              </div>
              <Button type="button" variant="outline" onClick={exportActivityCsv}>
                <Download className="w-4 h-4 mr-1" />
                Export CSV
              </Button>
            </CardHeader>
            <CardContent className="overflow-x-auto max-h-[360px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Pet</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activityLogs.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="text-sm whitespace-nowrap">{fmt(a.occurredAt)}</TableCell>
                      <TableCell className="text-sm">{a.userEmail || a.userName || a.userId}</TableCell>
                      <TableCell>{a.type}</TableCell>
                      <TableCell>{a.title}</TableCell>
                      <TableCell>{a.petName || '—'}</TableCell>
                      <TableCell className="max-w-md text-sm text-[#5A6B7A]">{a.description || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog
        open={addUserOpen}
        onOpenChange={(open) => {
          setAddUserOpen(open);
          if (open) {
            setAddName('');
            setAddEmail('');
            setAddPassword('');
            setAddRole('owner');
            setAddVetLicense('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
            <DialogDescription>Create a pet owner, administrator, or veterinarian account.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="au-name">Name</Label>
              <Input id="au-name" value={addName} onChange={(e) => setAddName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="au-email">Email</Label>
              <Input id="au-email" type="email" value={addEmail} onChange={(e) => setAddEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="au-pw">Password (min 8)</Label>
              <Input
                id="au-pw"
                type="password"
                value={addPassword}
                onChange={(e) => setAddPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <RadioGroup
                value={addRole}
                onValueChange={(v) => setAddRole(v as UserRoleChoice)}
                className="grid gap-2"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="owner" id="au-role-owner" />
                  <Label htmlFor="au-role-owner" className="font-normal cursor-pointer">
                    Pet owner (default)
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="admin" id="au-role-admin" />
                  <Label htmlFor="au-role-admin" className="font-normal cursor-pointer">
                    Administrator
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="vet" id="au-role-vet" />
                  <Label htmlFor="au-role-vet" className="font-normal cursor-pointer">
                    Veterinarian
                  </Label>
                </div>
              </RadioGroup>
            </div>
            <div className="space-y-2">
              <Label htmlFor="au-lic">Vet license ID (optional)</Label>
              <Input
                id="au-lic"
                value={addVetLicense}
                onChange={(e) => setAddVetLicense(e.target.value)}
                placeholder="e.g. PRC-VET-12345"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddUserOpen(false)}>
              Cancel
            </Button>
            <Button type="button" className="bg-[#1A202C]" onClick={submitAddUser}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit user</DialogTitle>
            <DialogDescription>Update profile, role, and activation.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="eu-name">Name</Label>
              <Input id="eu-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eu-email">Email</Label>
              <Input id="eu-email" type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <RadioGroup
                value={editRole}
                onValueChange={(v) => setEditRole(v as UserRoleChoice)}
                className="grid gap-2"
                disabled={editUser?.id === currentUserId}
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="owner" id="eu-role-owner" />
                  <Label htmlFor="eu-role-owner" className="font-normal cursor-pointer">
                    Pet owner
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="admin" id="eu-role-admin" />
                  <Label htmlFor="eu-role-admin" className="font-normal cursor-pointer">
                    Administrator
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="vet" id="eu-role-vet" />
                  <Label htmlFor="eu-role-vet" className="font-normal cursor-pointer">
                    Veterinarian
                  </Label>
                </div>
              </RadioGroup>
            </div>
            <div className="space-y-2">
              <Label htmlFor="eu-lic">Vet license ID</Label>
              <Input
                id="eu-lic"
                value={editVetLicense}
                onChange={(e) => setEditVetLicense(e.target.value)}
                placeholder="Professional license / registration"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="eu-act"
                checked={editIsActive}
                disabled={editUser?.id === currentUserId}
                onCheckedChange={setEditIsActive}
              />
              <Label htmlFor="eu-act">Account active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditUser(null)}>
              Cancel
            </Button>
            <Button type="button" className="bg-[#1A202C]" onClick={submitEditUser}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetUser} onOpenChange={(o) => !o && setResetUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              Set a new password for {resetUser?.email}. The user should change it after login.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="rpw">New password</Label>
            <Input
              id="rpw"
              type="password"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setResetUser(null)}>
              Cancel
            </Button>
            <Button type="button" className="bg-[#1A202C]" onClick={submitResetPassword}>
              Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editPet} onOpenChange={(o) => !o && setEditPet(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit pet</DialogTitle>
            <DialogDescription>Limited edit of profile fields (owner unchanged).</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="ep-name">Name</Label>
              <Input id="ep-name" value={petName} onChange={(e) => setPetName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ep-type">Type</Label>
              <Input id="ep-type" value={petType} onChange={(e) => setPetType(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ep-breed">Breed</Label>
              <Input id="ep-breed" value={petBreed} onChange={(e) => setPetBreed(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label htmlFor="ep-age">Age</Label>
                <Input id="ep-age" type="number" value={petAge} onChange={(e) => setPetAge(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ep-w">Weight</Label>
                <Input id="ep-w" type="number" value={petWeight} onChange={(e) => setPetWeight(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ep-st">Status</Label>
              <Input id="ep-st" value={petStatus} onChange={(e) => setPetStatus(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ep-h">Health condition</Label>
              <Input id="ep-h" value={petHealth} onChange={(e) => setPetHealth(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditPet(null)}>
              Cancel
            </Button>
            <Button type="button" className="bg-[#1A202C]" onClick={submitEditPet}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
