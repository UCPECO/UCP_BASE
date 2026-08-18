import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import Layout from '@/components/Layout';
// Add page imports here
import Home from '@/pages/Home';
import Login from '@/pages/Login';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import AlumnoDashboard from '@/pages/alumno/AlumnoDashboard';
import AlumnoPerfil from '@/pages/alumno/AlumnoPerfil';
import AlumnoHorario from '@/pages/alumno/AlumnoHorario';
import AlumnoEvidencias from '@/pages/alumno/AlumnoEvidencias';
import AlumnoEventos from '@/pages/alumno/AlumnoEventos';
import AlumnoActividades from '@/pages/alumno/AlumnoActividades';
import Fichar from '@/pages/Fichar';
import EncargadoDashboard from '@/pages/encargado/EncargadoDashboard';
import EncargadoAlumnos from '@/pages/encargado/EncargadoAlumnos';
import EncargadoPersonal from '@/pages/encargado/EncargadoPersonal';
import EncargadoRegistros from '@/pages/encargado/EncargadoRegistros';
import EncargadoEvidencias from '@/pages/encargado/EncargadoEvidencias';
import EncargadoIncidencias from '@/pages/encargado/EncargadoIncidencias';
import EncargadoEventos from '@/pages/encargado/EncargadoEventos';
import AdminDashboard from '@/pages/admin/AdminDashboard';
import AdminPersonal from '@/pages/admin/AdminPersonal';
import AdminActividades from '@/pages/admin/AdminActividades';
import AdminRegistros from '@/pages/admin/AdminRegistros';
import AdminEvidencias from '@/pages/admin/AdminEvidencias';
import AdminIncidencias from '@/pages/admin/AdminIncidencias';
import AdminEventos from '@/pages/admin/AdminEventos';
import AdminBonos from '@/pages/admin/AdminBonos';
import AdminEstadisticas from '@/pages/admin/AdminEstadisticas';
import AdminQr from '@/pages/admin/AdminQr';
import AdminConfig from '@/pages/admin/AdminConfig';
import AdminPasesLista from '@/pages/admin/AdminPasesLista';
import AdminConstancias from '@/pages/admin/AdminConstancias';
import AdminEncuestas from '@/pages/admin/AdminEncuestas';
import AdminEvaluaciones from '@/pages/admin/AdminEvaluaciones';
import AdminInventario from '@/pages/admin/AdminInventario';
import AdminBitacora from '@/pages/admin/AdminBitacora';
import AlumnoConstancias from '@/pages/alumno/AlumnoConstancias';
import AlumnoEncuestas from '@/pages/alumno/AlumnoEncuestas';
import EncargadoEvaluaciones from '@/pages/encargado/EncargadoEvaluaciones';
import Calendario from '@/pages/Calendario';
import Disponibilidad from '@/pages/Disponibilidad';
import ChecklistBodega from '@/pages/ChecklistBodega';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-700 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<Layout />}>
          {/* Alumno */}
          <Route path="/alumno" element={<AlumnoDashboard />} />
          <Route path="/alumno/perfil" element={<AlumnoPerfil />} />
          <Route path="/alumno/horario" element={<AlumnoHorario />} />
          <Route path="/alumno/evidencias" element={<AlumnoEvidencias />} />
          <Route path="/alumno/eventos" element={<AlumnoEventos />} />
          <Route path="/alumno/actividades" element={<AlumnoActividades />} />
          <Route path="/alumno/constancias" element={<AlumnoConstancias />} />
          <Route path="/alumno/encuestas" element={<AlumnoEncuestas />} />
          <Route path="/fichar" element={<Fichar />} />
          <Route path="/checklist-bodega" element={<ChecklistBodega />} />
          {/* Encargado */}
          <Route path="/encargado" element={<EncargadoDashboard />} />
          <Route path="/encargado/personal" element={<EncargadoPersonal />} />
          <Route path="/encargado/alumnos" element={<EncargadoAlumnos />} />
          <Route path="/encargado/registros" element={<EncargadoRegistros />} />
          <Route path="/encargado/evidencias" element={<EncargadoEvidencias />} />
          <Route path="/encargado/incidencias" element={<EncargadoIncidencias />} />
          <Route path="/encargado/actividades" element={<AdminActividades />} />
          <Route path="/encargado/materiales" element={<Navigate to="/encargado/inventario?tab=bodega" replace />} />
          <Route path="/encargado/electronicos" element={<Navigate to="/encargado/inventario?tab=electronicos" replace />} />
          <Route path="/encargado/eventos" element={<EncargadoEventos />} />
          <Route path="/encargado/pases-lista" element={<AdminPasesLista />} />
          <Route path="/encargado/constancias" element={<AdminConstancias />} />
          <Route path="/encargado/evaluaciones" element={<EncargadoEvaluaciones />} />
          <Route path="/encargado/inventario" element={<AdminInventario />} />
          {/* Admin */}
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/personal" element={<AdminPersonal />} />
          <Route path="/admin/actividades" element={<AdminActividades />} />
          <Route path="/admin/registros" element={<AdminRegistros />} />
          <Route path="/admin/evidencias" element={<AdminEvidencias />} />
          <Route path="/admin/incidencias" element={<AdminIncidencias />} />
          <Route path="/admin/eventos" element={<AdminEventos />} />
          <Route path="/admin/bonos" element={<AdminBonos />} />
          <Route path="/admin/estadisticas" element={<AdminEstadisticas />} />
          <Route path="/admin/materiales" element={<Navigate to="/admin/inventario?tab=bodega" replace />} />
          <Route path="/admin/electronicos" element={<Navigate to="/admin/inventario?tab=electronicos" replace />} />
          <Route path="/admin/qr" element={<AdminQr />} />
          <Route path="/admin/pases-lista" element={<AdminPasesLista />} />
          <Route path="/admin/constancias" element={<AdminConstancias />} />
          <Route path="/admin/encuestas" element={<AdminEncuestas />} />
          <Route path="/admin/evaluaciones" element={<AdminEvaluaciones />} />
          <Route path="/admin/inventario" element={<AdminInventario />} />
          <Route path="/admin/bitacora" element={<AdminBitacora />} />
          <Route path="/admin/config" element={<AdminConfig />} />
          {/* Compartidos */}
          <Route path="/admin/calendario" element={<Calendario />} />
          <Route path="/admin/disponibilidad" element={<Disponibilidad />} />
          <Route path="/encargado/calendario" element={<Calendario />} />
          <Route path="/encargado/disponibilidad" element={<Disponibilidad />} />
        </Route>
      </Route>

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App