import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import { usePermissions } from './permissions';
import Layout from './Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import TeamView from './pages/TeamView';
import ProjectsList from './pages/ProjectsList';
import ProjectDetail from './pages/ProjectDetail';
import Customers from './pages/Customers';
import Tasks from './pages/Tasks';
import Reports from './pages/Reports';
import CalendarPage from './pages/CalendarPage';
import UserManagement from './pages/UserManagement';
import OwnerDashboard from './pages/OwnerDashboard';
import Payments from './pages/Payments';
import Finance from './pages/Finance';
import Inventory from './pages/Inventory';
import Store from './pages/Store';

function Protected({ children, adminOnly, tab }) {
  const { user, isAdmin } = useAuth();
  const { can } = usePermissions();
  const location = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;
  if (tab && !can(user.role, tab)) return <Navigate to="/" replace />;
  return <Layout>{children}</Layout>;
}

// Home route depends on role: admin (owner) → Owners Dashboard, everyone else → TeamView.
function Home() {
  const { isAdmin } = useAuth();
  return isAdmin ? <OwnerDashboard /> : <TeamView />;
}

export default function App() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<Protected><Home /></Protected>} />
      <Route path="/dashboard" element={<Protected tab="dashboard"><Dashboard /></Protected>} />
      <Route path="/projects" element={<Protected tab="projects"><ProjectsList /></Protected>} />
      <Route path="/projects/:id" element={<Protected><ProjectDetail /></Protected>} />
      <Route path="/calendar" element={<Protected tab="calendar"><CalendarPage /></Protected>} />
      <Route path="/customers" element={<Protected tab="customers"><Customers /></Protected>} />
      <Route path="/reports" element={<Protected tab="reports"><Reports /></Protected>} />
      <Route path="/payments" element={<Protected tab="payments"><Payments /></Protected>} />
      <Route path="/finance" element={<Protected tab="finance"><Finance /></Protected>} />
      <Route path="/inventory" element={<Protected tab="inventory"><Inventory /></Protected>} />
      <Route path="/store" element={<Protected tab="store"><Store /></Protected>} />
      <Route path="/tasks" element={<Protected tab="tasks"><Tasks /></Protected>} />
      <Route path="/users" element={<Protected adminOnly><UserManagement /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
