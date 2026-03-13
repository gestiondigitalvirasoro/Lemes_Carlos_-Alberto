# 🔐 ARQUITECTURA DE AUTENTICACIÓN - SUPABASE AS SINGLE SOURCE OF TRUTH

## Principios Fundamentales

```
┌─────────────────────────────────────────────────────────────────┐
│                  SUPABASE AUTH                                  │
│  (Única fuente de verdad para sesiones y autenticación)         │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       │ Token JWT
                       │
        ┌──────────────┴──────────────┐
        │                             │
        ▼                             ▼
   ┌─────────────┐          ┌──────────────────┐
   │   CLIENTE   │          │   BACKEND NODE   │
   │  (Browser)  │          │    + PRISMA      │
   └─────────────┘          └──────────────────┘
        │                             │
        │ Cookie: access_token        │
        │────────────────────────────→│
        │                             │
        │  GET /doctor/pacientes/:id  │
        │────────────────────────────→│
        │                             │
        │                   ┌─────────────────────┐
        │                   │ 1. Obtener token    │
        │                   │    de cookie        │
        │                   └─────────────────────┘
        │                             │
        │                   ┌─────────────────────────────┐
        │                   │ 2. Validar token CON        │
        │                   │    supabase.auth.getUser()  │
        │                   │    ← Supabase responde ✓/✗  │
        │                   └─────────────────────────────┘
        │                             │
        │      ┌─────────────────────────────────────┐
        │      │ 3. Si válido en Supabase:           │
        │      │    - Buscar en tabla medicos        │
        │      │    - Si no existe → CREAR AUTO      │
        │      │    - Proceder con request           │
        │      └─────────────────────────────────────┘
        │                             │
        │         Respuesta 200       │
        │←────────────────────────────┤
        │                             │
```

---

## Flujo de Autenticación

### 1. **LOGIN (POST /auth/login)**

```javascript
Cliente:
  email: carlos@lemes.com
  password: *****

↓

Supabase.auth.signInWithPassword()
  ✅ Retorna: access_token (JWT), refresh_token
  ❌ Retorna: error

↓

Backend:
  res.cookie('access_token', token, { httpOnly: true })
  res.json({ success: true })

↓

Cliente:
  Cookie almacenada
```

---

### 2. **SOLICITUD PROTEGIDA (GET /doctor/pacientes/1)**

```javascript
Cliente:
  GET /doctor/pacientes/1
  Cookie: access_token=eyJhbG...

↓

Backend - Middleware requireAuth:

  1. Obtener token de cookie
     const token = req.cookies.access_token
  
  2. VALIDAR CON SUPABASE (no solo decodificar local)
     const { user } = await supabase.auth.getUser(token)
     ↑ Esto verifica que el token sea real y válido EN SUPABASE
     
  3. Si inválido/expirado:
     res.clearCookie('access_token')
     res.redirect('/login')
     
  4. Si válido:
     - Obtener supabase_id del usuario
     - Buscar en tabla medicos por supabase_id
     - Si no existe → CREAR AUTOMÁTICAMENTE
     - req.user = { id, email, role, ... }
     - next()

↓

Ruta protegida:
  if (!req.user) return 401
  Proceder con las datos del usuario
```

---

### 3. **EXPIRACIÓN DE SESIÓN**

```javascript
Supabase configura:
  access_token TTL: 1 hora (por defecto)
  refresh_token: 7 días

↓

Si el usuario intenta una solicitud después de que expire:

  1. Token expirado en Supabase
  2. supabase.auth.getUser(token) → error
  3. Backend redirige a /login
  4. Cookie se limpia
  5. Usuario debe volver a autenticarse

NO hay sesión paralela que permita seguir usando el sistema
SUPABASE es la única fuente de verdad
```

---

## Cambios en la Estructura

### ❌ **QUÉ NO USAMOS**

- ❌ `express-session` (sesiones en memoria)
- ❌ `express-session-store` (sesiones en BD)
- ❌ Sesiones en archivos locales
- ❌ JWT decodificado localmente sin validar con Supabase
- ❌ Tokens guardados manualmente en BD

### ✅ **QUÉ USAMOS**

- ✅ Supabase Auth como único proveedor de autenticación
- ✅ Validación de tokens contra Supabase (`supabase.auth.getUser()`)
- ✅ Tabla `medicos` para datos adicionales del doctor
- ✅ Sincronización automática de usuarios nuevos
- ✅ Cookies httpOnly para almacenar tokens

---

## Middlewares Disponibles

### `requireAuth` (para rutas Frontend/HTML)
```javascript
app.get('/doctor/pacientes/:id', requireAuth, requireRole(['doctor']), handler)

// Si falla: redirige a /login
// Si pasa: adjunta req.user
```

### `requireAuthAPI` (para rutas API/JSON)
```javascript
app.get('/api/pacientes/:id', requireAuthAPI, requireRole(['doctor']), handler)

// Si falla: devuelve 401 JSON
// Si pasa: adjunta req.user
```

### `requireRole` (para validar roles)
```javascript
requireRole(['doctor']) // Solo si req.user.role === 'doctor'
requireRole(['admin', 'doctor']) // Si es admin O doctor
```

---

## Propiedades de `req.user`

Después de pasar `requireAuth` o `requireAuthAPI`, req.user contiene:

```javascript
req.user = {
  id: '1',                              // ID en tabla medicos
  medicoId: '1',                        // Alias para id
  supabaseId: 'uuid-from-supabase',     // UUID de Supabase Auth
  supabaseUser: { ... },                // Todos los datos de Supabase
  email: 'carlos@lemes.com',
  nombre: 'Carlos',
  apellido: 'Lemes',
  role: 'doctor'                        // 'admin', 'doctor', 'secretaria'
}
```

---

## Sincronización Automática de Usuarios

**Cuando se autentica un usuario nuevo:**

1. Supabase autentica al usuario ✓
2. Backend obtiene acceso_token
3. Usuario hace una solicitud protegida
4. Middleware valida token con Supabase ✓
5. **Si es la primera vez → Crear registro en tabla `medicos` AUTOMÁTICAMENTE**
6. Los datos se toman de `supabase.user_metadata`

```javascript
// En user_metadata de Supabase, se espera:
{
  nombre: 'Carlos',
  apellido: 'Lemes',
  role: 'doctor',
  especialidad: 'Cardiología',
  telefono: '+56912345678'
}

// Se crea el registro:
INSERT INTO medicos (
  supabase_id,
  email,
  nombre,
  apellido,
  role,
  especialidad,
  telefono,
  activo
) VALUES (...)
```

---

## Seguridad

### Token en Cookie httpOnly
```javascript
res.cookie('access_token', token, {
  httpOnly: true,        // ✅ No accesible desde JavaScript
  secure: true,          // ✅ Solo HTTPS en producción
  sameSite: 'lax',       // ✅ Protección contra CSRF
  maxAge: 7 * 24 * 60... // Expiración
})
```

### Validación en Supabase
```javascript
// Cada request valida el token con Supabase
// Si expira en Supabase, es inválido aquí INMEDIATAMENTE
// No hay almacenamiento local de estado de sesión
```

### No hay estado paralelo
```javascript
// Todo estado de sesión está EN SUPABASE
// Si cambias el usuario en Supabase (desactivas, cambias role) → 
// Los cambios se reflejan INMEDIATAMENTE en el siguiente request
```

---

## Refrescar Token (Cuando Caduca)

Si el `access_token` caduca, el cliente debe:

```javascript
// En el frontend (si usa API):
const response = await fetch('/api/protected', {
  headers: { 'Authorization': `Bearer ${accessToken}` }
})

if (response.status === 401) {
  // Token expirado
  const refreshResponse = await fetch('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: ... })
  })
  
  const { access_token } = await refreshResponse.json()
  // Reintentar con nuevo token
}
```

Para navegación tradicional (servidor renderiza HTML):
```javascript
// El middleware automaticamente redirige a /login
// No se requiere refresh manual
```

---

## Prueba de Flujo

```bash
# 1. Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{ "email": "carlos@lemes.com", "password": "..." }'

# Cookie se asigna automáticamente

# 2. Solicitud protegida
curl -X GET http://localhost:3000/doctor/pacientes/1 \
  -H "Cookie: access_token=..."

# Middleware valida con Supabase ✓
# Si expiró → 302 /login ❌
```

---

## Tabla medicos

La tabla `medicos` mantiene información adicional del doctor, pero:

- ✅ El único sistema de autenticación es **Supabase**
- ✅ `supabase_id` es la relación hacia Supabase User
- ✅ Se sincroniza automáticamente
- ✅ **No es necesario crear medicos manualmente**

---

## Conclusión

**Supabase Auth es la única fuente de verdad.**

- ✅ Login = Supabase crea sesión
- ✅ Validación = Supabase verifica token
- ✅ Expiración = Supabase invalida token
- ✅ Cambios = Se aplican inmediatamente desde Supabase
- ✅ Sincronización = Automática con tabla medicos

Sin sesiones paralelas, sin estado local, sin complejidad innecesaria.
