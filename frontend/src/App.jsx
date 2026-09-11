import { BrowserRouter, Routes, Route, useParams, useNavigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage.jsx';
import UploadPage from './pages/UploadPage.jsx';

function LoginRoute() {
  const { shareToken } = useParams();
  const navigate = useNavigate();

  function handleLoginSuccess(token, redirectTo) {
    navigate(redirectTo);
  }

  return <LoginPage shareToken={shareToken} onLoginSuccess={handleLoginSuccess} />;
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
        {/* Email-gated entry point — share link lands here */}
        <Route path="/request/:shareToken" element={<LoginRoute />} />

        {/* Upload page — rendered after successful OTP verification */}
        <Route path="/upload/:requestId" element={<UploadPage />} />

        {/* Catch-all */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
