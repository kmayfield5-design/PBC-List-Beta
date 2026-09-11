import { BrowserRouter, Routes, Route, useParams, useNavigate } from 'react-router-dom';
import AdvisorLoginPage from './pages/AdvisorLoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import CreateRequestPage from './pages/CreateRequestPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import UploadPage from './pages/UploadPage.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

function ClientLoginRoute() {
  const { shareToken } = useParams();
  const navigate = useNavigate();
  return (
    <LoginPage
      shareToken={shareToken}
      onLoginSuccess={(_token, redirectTo) => navigate(redirectTo)}
    />
  );
}

function NotFound() {
  return (
    <div style={{ textAlign: 'center', padding: '80px 24px', fontFamily: 'sans-serif' }}>
      <h2 style={{ color: '#111' }}>Page not found</h2>
      <p style={{ color: '#555' }}>This link may be invalid or expired.</p>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Advisor routes */}
        <Route path="/" element={<AdvisorLoginPage />} />
        <Route
          path="/dashboard"
          element={<ProtectedRoute><DashboardPage /></ProtectedRoute>}
        />
        <Route
          path="/dashboard/new"
          element={<ProtectedRoute><CreateRequestPage /></ProtectedRoute>}
        />
        <Route
          path="/dashboard/:requestId"
          element={<ProtectedRoute><div style={{ padding: 40, fontFamily: 'sans-serif' }}>Request detail — coming soon.</div></ProtectedRoute>}
        />

        {/* Client routes */}
        <Route path="/request/:shareToken" element={<ClientLoginRoute />} />
        <Route path="/upload/:requestId" element={<UploadPage />} />

        {/* Catch-all */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
