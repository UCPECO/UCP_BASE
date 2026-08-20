// Cliente API self-hosted que emula la interfaz de @base44/sdk
// Reemplaza todas las llamadas a base44 con llamadas al backend local

// En desarrollo local usa localhost:3001, en producción usa ruta relativa /api
const API_BASE = import.meta.env.VITE_API_URL || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:3001/api' : '/api');

function getToken() {
  return localStorage.getItem('ucp_token') || localStorage.getItem('token') || '';
}

function setToken(token) {
  localStorage.setItem('ucp_token', token);
  localStorage.setItem('token', token);
}

function removeToken() {
  localStorage.removeItem('ucp_token');
  localStorage.removeItem('token');
}

async function apiFetch(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(url, {
    ...options,
    headers,
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Error desconocido' }));
    const err = new Error(error.error || `HTTP ${response.status}`);
    err.status = response.status;
    err.data = error;
    throw err;
  }
  
  if (response.status === 204) return null;
  return response.json();
}

// Helper para convertir filtros a query params
function buildQueryString(filters, sort, limit) {
  const params = new URLSearchParams();
  if (sort) params.set('sort', sort);
  if (limit) params.set('limit', String(limit));
  if (filters) {
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null) params.set(k, String(v));
    });
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

// ===== AUTH =====
const auth = {
  me: async () => {
    return apiFetch('/auth/me');
  },
  
  loginViaEmailPassword: async (email, password) => {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (data.token) setToken(data.token);
    return data.user;
  },
  
  register: async ({ email, password, full_name }) => {
    const data = await apiFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, full_name }),
    });
    if (data.token) setToken(data.token);
    return data.user;
  },
  
  logout: (redirectUrl) => {
    removeToken();
    if (redirectUrl) {
      window.location.href = redirectUrl;
    }
  },
  
  redirectToLogin: (returnUrl) => {
    const url = new URL('/login', window.location.origin);
    // Debe llamarse 'returnTo': es el parámetro que safeReturnTo() lee en Login.
    // (Antes se enviaba 'from' y al volver del login se perdía la URL del QR.)
    if (returnUrl) url.searchParams.set('returnTo', returnUrl);
    window.location.href = url.toString();
  },
  
  resetPasswordRequest: async (email) => {
    return apiFetch('/auth/reset-password-request', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },
  
  resetPassword: async ({ resetToken, newPassword }) => {
    return apiFetch('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ resetToken, newPassword }),
    });
  },
  
  verifyOtp: async ({ email, otpCode }) => {
    const data = await apiFetch('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ email, otpCode }),
    });
    if (data.token) setToken(data.token);
    return data.user;
  },
  
  resendOtp: async (email) => {
    return apiFetch('/auth/resend-otp', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },
  
  updateMe: async (updates) => {
    return apiFetch('/auth/me', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },
  
  // Admin: cambiar password de cualquier usuario
  adminResetPassword: async (userId, newPassword) => {
    return apiFetch('/auth/admin-reset-password', {
      method: 'POST',
      body: JSON.stringify({ userId, newPassword }),
    });
  },

  // Admin: crear usuario con credenciales (el admin no pierde su sesión)
  adminCreateUser: async (userData) => {
    const data = await apiFetch('/auth/admin-create-user', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
    return data.user;
  },
};

// ===== ENTITIES =====
function createEntityAPI(entityName) {
  const basePath = `/entities/${entityName}`;
  
  return {
    list: async (sort, limit) => {
      const qs = buildQueryString(null, sort, limit);
      return apiFetch(`${basePath}${qs}`);
    },
    
    get: async (id) => {
      return apiFetch(`${basePath}/${id}`);
    },
    
    create: async (data) => {
      return apiFetch(basePath, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    
    update: async (id, data) => {
      return apiFetch(`${basePath}/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    
    delete: async (id) => {
      return apiFetch(`${basePath}/${id}`, {
        method: 'DELETE',
      });
    },
    
    filter: async (filters, sort, limit) => {
      const qs = buildQueryString(filters, sort, limit);
      return apiFetch(`${basePath}${qs}`);
    },
    
    // Subscribe simulado con polling cada 5s
    subscribe: (callback) => {
      let running = true;
      const poll = async () => {
        if (!running) return;
        try {
          const data = await apiFetch(basePath);
          callback({ type: 'update', data });
        } catch (e) {
          // Ignorar errores de polling
        }
        if (running) setTimeout(poll, 5000);
      };
      poll();
      return () => { running = false; };
    },
    
    bulkCreate: async (items) => {
      return apiFetch(`${basePath}/bulk`, {
        method: 'POST',
        body: JSON.stringify(items),
      });
    },
    
    updateMany: async (filter, $set) => {
      return apiFetch(`${basePath}/bulk`, {
        method: 'PUT',
        body: JSON.stringify({ filter, $set }),
      });
    },
  };
}

const entities = {
  User: createEntityAPI('User'),
  Actividades: createEntityAPI('Actividades'),
  Asignaciones: createEntityAPI('Asignaciones'),
  Registros_QR: createEntityAPI('Registros_QR'),
  Evidencias: createEntityAPI('Evidencias'),
  Bonos: createEntityAPI('Bonos'),
  Incidencias: createEntityAPI('Incidencias'),
  Horarios_Clase: createEntityAPI('Horarios_Clase'),
  Eventos: createEntityAPI('Eventos'),
  Constancias: createEntityAPI('Constancias'),
  Encuestas: createEntityAPI('Encuestas'),
  Respuestas_Encuesta: createEntityAPI('Respuestas_Encuesta'),
  Evaluaciones_Alumno: createEntityAPI('Evaluaciones_Alumno'),
  Materiales_Recibidos: createEntityAPI('Materiales_Recibidos'),
  Electronicos_Reciclados: createEntityAPI('Electronicos_Reciclados'),
  Salidas_Materiales: createEntityAPI('Salidas_Materiales'),
  Stock_Minimo: createEntityAPI('Stock_Minimo'),
  Codigos_QR: createEntityAPI('Codigos_QR'),
  Pases_Lista: createEntityAPI('Pases_Lista'),
  Respuestas_Pases_Lista: createEntityAPI('Respuestas_Pases_Lista'),
  Invitaciones: createEntityAPI('Invitaciones'),
  Configuracion_Sistema: createEntityAPI('Configuracion_Sistema'),
  Bitacora_Auditoria: createEntityAPI('Bitacora_Auditoria'),
  Comentarios_Evidencia: createEntityAPI('Comentarios_Evidencia'),
  Notificaciones: createEntityAPI('Notificaciones'),
  Historial_Areas: createEntityAPI('Historial_Areas'),
};

// ===== FUNCTIONS =====
const functions = {
  invoke: async (name, payload = {}) => {
    // Devuelve { data } para coincidir con la forma del SDK original
    const body = await apiFetch(`/functions/${name}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return { data: body };
  },
};

// ===== INTEGRATIONS =====
const integrations = {
  Core: {
    UploadFile: async ({ file }) => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
        },
        body: formData,
      });
      if (!response.ok) throw new Error('Upload failed');
      return response.json();
    },
    SendEmail: async (params) => {
      console.log('Email simulado (self-hosted):', params);
      return { ok: true };
    },
    SendPushNotification: async (params) => {
      console.log('Push notif simulada (self-hosted):', params);
      return { ok: true };
    },
  },
};

// ===== asServiceRole =====
// En self-hosted, asServiceRole es lo mismo que la API normal
// (los permisos se manejan en el backend)
const asServiceRole = {
  entities,
  integrations,
};

// ===== CLIENTE PRINCIPAL =====
export const base44 = {
  auth,
  entities,
  functions,
  integrations,
  asServiceRole,
};

// Crear cliente (compatibilidad con createClient)
export function createClient(config) {
  if (config?.token) setToken(config.token);
  return base44;
}

export default base44;
