import { Suspense, lazy } from "react"
import { Toaster } from "@/components/ui/toaster"
import { ConfirmadorGlobal } from "@/components/ucp/ConfirmDialog"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import RutaRol from '@/components/RutaRol';
import Layout from '@/components/Layout';
// Rutas críticas (primera pantalla): se cargan de inmediato
import Home from '@/pages/Home';
import Login from '@/pages/Login';
import AlumnoDashboard from '@/pages/alumno/AlumnoDashboard';
import Fichar from '@/pages/Fichar';
// El resto se carga bajo demanda (lazy): el paquete inicial pesa mucho menos
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));
const AlumnoPerfil = lazy(() => import('@/pages/alumno/AlumnoPerfil'));
const AlumnoHorario = lazy(() => import('@/pages/alumno/AlumnoHorario'));
const AlumnoEvidencias = lazy(() => import('@/pages/alumno/AlumnoEvidencias'));
const AlumnoEventos = lazy(() => import('@/pages/alumno/AlumnoEventos'));
const AlumnoActividades = lazy(() => import('@/pages/alumno/AlumnoActividades'));
const AlumnoConstancias = lazy(() => import('@/pages/alumno/AlumnoConstancias'));
const AlumnoEncuestas = lazy(() => import('@/pages/alumno/AlumnoEncuestas'));
const EncargadoDashboard = lazy(() => import('@/pages/encargado/EncargadoDashboard'));
const EncargadoAlumnos = lazy(() => import('@/pages/encargado/EncargadoAlumnos'));
const EncargadoPersonal = lazy(() => import('@/pages/encargado/EncargadoPersonal'));
const EncargadoRegistros = lazy(() => import('@/pages/encargado/EncargadoRegistros'));
const EncargadoEvidencias = lazy(() => import('@/pages/encargado/EncargadoEvidencias'));
const EncargadoIncidencias = lazy(() => import('@/pages/encargado/EncargadoIncidencias'));
const EncargadoEventos = lazy(() => import('@/pages/encargado/EncargadoEventos'));
const EncargadoEvaluaciones = lazy(() => import('@/pages/encargado/EncargadoEvaluaciones'));
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard'));
const AdminPersonal = lazy(() => import('@/pages/admin/AdminPersonal'));
const AdminActividades = lazy(() => import('@/pages/admin/AdminActividades'));
const AdminRegistros = lazy(() => import('@/pages/admin/AdminRegistros'));
const AdminEvidencias = lazy(() => import('@/pages/admin/AdminEvidencias'));
const AdminIncidencias = lazy(() => import('@/pages/admin/AdminIncidencias'));
const AdminEventos = lazy(() => import('@/pages/admin/AdminEventos'));
const AdminBonos = lazy(() => import('@/pages/admin/AdminBonos'));
const AdminEstadisticas = lazy(() => import('@/pages/admin/AdminEstadisticas'));
const AdminQr = lazy(() => import('@/pages/admin/AdminQr'));
const AdminConfig = lazy(() => import('@/pages/admin/AdminConfig'));
const AdminPasesLista = lazy(() => import('@/pages/admin/AdminPasesLista'));
const AdminConstancias = lazy(() => import('@/pages/admin/AdminConstancias'));
const AdminEncuestas = lazy(() => import('@/pages/admin/AdminEncuestas'));
const AdminEvaluaciones = lazy(() => import('@/pages/admin/AdminEvaluaciones'));
const AdminInventario = lazy(() => import('@/pages/admin/AdminInventario'));
const AdminBitacora = lazy(() => import('@/pages/admin/AdminBitacora'));
const AdminValidacion = lazy(() => import('@/pages/admin/AdminValidacion'));
const Calendario = lazy(() => import('@/pages/Calendario'));
const Disponibilidad = lazy(() => import('@/pages/Disponibilidad'));
const ChecklistBodega = lazy(() => import('@/pages/ChecklistBodega'));
const Comunidad = lazy(() => import('@/pages/Comunidad'));

const Cargando = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-700 rounded-full animate-spin"></div>
  </div>
);

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return <Cargando />;
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
    <Suspense fallback={<Cargando />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
          <Route element={<Layout />}>
            {/* Alumno (participantes; el admin también puede consultar) */}
            <Route element={<RutaRol roles={["admin", "servicio_social", "voluntario", "practicas_profesionales"]} />}>
              <Route path="/alumno" element={<AlumnoDashboard />} />
              <Route path="/alumno/perfil" element={<AlumnoPerfil />} />
              <Route path="/alumno/horario" element={<AlumnoHorario />} />
              <Route path="/alumno/evidencias" element={<AlumnoEvidencias />} />
              <Route path="/alumno/eventos" element={<AlumnoEventos />} />
              <Route path="/alumno/actividades" element={<AlumnoActividades />} />
              <Route path="/alumno/constancias" element={<AlumnoConstancias />} />
              <Route path="/alumno/encuestas" element={<AlumnoEncuestas />} />
            </Route>
            {/* Compartidas por todos los roles autenticados */}
            <Route path="/fichar" element={<Fichar />} />
            <Route path="/checklist-bodega" element={<ChecklistBodega />} />
            <Route path="/comunidad" element={<Comunidad />} />
            {/* Encargado (el admin también puede entrar) */}
            <Route element={<RutaRol roles={["admin", "encargado"]} />}>
              <Route path="/encargado" element={<EncargadoDashboard />} />
              <Route path="/encargado/personal" element={<EncargadoPersonal />} />
              <Route path="/encargado/alumnos" element={<EncargadoAlumnos />} />
              <Route path="/encargado/registros" element={<EncargadoRegistros />} />
              <Route path="/encargado/evidencias" element={<EncargadoEvidencias />} />
              <Route path="/encargado/incidencias" element={<EncargadoIncidencias />} />
              <Route path="/encargado/actividades" element={<AdminActividades />} />
              <Route path="/encargado/materiales" element={<Navigate to="/encargado/inventario?tab=bodega" replace />} />
              <Route path="/encargado/electronicos" element={<Navigate to="/encargado/inventario?tab=electronicos" replace />} />
              <Route path="/encargado/ventas" element={<Navigate to="/encargado/inventario?tab=ventas" replace />} />
              <Route path="/encargado/eventos" element={<EncargadoEventos />} />
              <Route path="/encargado/pases-lista" element={<AdminPasesLista />} />
              <Route path="/encargado/constancias" element={<AdminConstancias />} />
              <Route path="/encargado/evaluaciones" element={<EncargadoEvaluaciones />} />
              <Route path="/encargado/inventario" element={<AdminInventario />} />
              <Route path="/encargado/calendario" element={<Calendario />} />
              <Route path="/encargado/disponibilidad" element={<Disponibilidad />} />
            </Route>
            {/* Admin: solo administradores */}
            <Route element={<RutaRol roles={["admin"]} />}>
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/personal" element={<AdminPersonal />} />
              <Route path="/admin/actividades" element={<AdminActividades />} />
              <Route path="/admin/registros" element={<AdminRegistros />} />
              <Route path="/admin/validacion" element={<AdminValidacion />} />
              <Route path="/admin/ventas" element={<Navigate to="/admin/inventario?tab=ventas" replace />} />
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
              <Route path="/admin/calendario" element={<Calendario />} />
              <Route path="/admin/disponibilidad" element={<Disponibilidad />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </Suspense>
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
        <ConfirmadorGlobal />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
