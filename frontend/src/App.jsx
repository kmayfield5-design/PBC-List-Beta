import { BrowserRouter, Routes, Route, useParams, useSearchParams } from 'react-router-dom';
import AdvisorLoginPage from './pages/AdvisorLoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import CreateRequestPage from './pages/CreateRequestPage.jsx';
import RequestDetailPage from './pages/RequestDetailPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import UploadPage from './pages/UploadPage.jsx';
import AuthCallbackPage from './pages/AuthCallbackPage.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

function ClientLoginRoute() {
  const { shareToken } = useParams();
  const [searchParams] = useSearchParams();
  const errorMsg = searchParams.get('error');
  return <LoginPage shareToken={shareToken} errorMessage={errorMsg} />;
}

function NotFound() {
  return (
    <div style={{ textAlign: 'center', padding: '80px 24px' }}>
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
          element={<ProtectedRoute><RequestDetailPage /></ProtectedRoute>}
        />

        {/* Client routes */}
        <Route path="/request/:shareToken" element={<ClientLoginRoute />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/upload/:requestId" element={<UploadPage />} />

        {/* Catch-all */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
