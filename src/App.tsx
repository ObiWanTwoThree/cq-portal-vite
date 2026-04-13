
import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import Dashboard from './pages/Dashboard';
import NewTask from './pages/NewTask';
import TaskDetails from './pages/TaskDetails';
import MainLayout from './components/MainLayout';

function InviteRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('type=invite') || hash.includes('type=recovery')) {
      navigate('/register' + window.location.search + hash, { replace: true });
    }
  }, []);
  return null;
}

function App() {
  return (
    <BrowserRouter>
      <InviteRedirect />
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/dashboard"
          element={
            <MainLayout>
              <Dashboard />
            </MainLayout>
          }
        />
        <Route
          path="/dashboard/new-task"
          element={
            <MainLayout>
              <NewTask />
            </MainLayout>
          }
        />
        <Route
          path="/task/:id"
          element={
            <MainLayout>
              <TaskDetails />
            </MainLayout>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
