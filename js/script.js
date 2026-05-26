// =====================================================
// script.js - Lógica del login
// =====================================================

const form           = document.getElementById('login-form');
const inputUsuario   = document.getElementById('usuario');
const inputPassword  = document.getElementById('password');
const btnEntrar      = document.getElementById('btn-entrar');
const mensajeError   = document.getElementById('mensaje-error');
const togglePwdBtn   = document.getElementById('toggle-password');
const capslockWarn   = document.getElementById('capslock-warning');

const API_BASE_URL = 'https://globalmotriz-backend.onrender.com';

// =====================================================
// UTIL: mostrar / ocultar mensaje de error
// =====================================================
function mostrarError(msg) {
  mensajeError.textContent = msg;
  mensajeError.hidden = false;
}

function limpiarError() {
  mensajeError.textContent = '';
  mensajeError.hidden = true;
}

// =====================================================
// Limpiar error apenas el usuario empiece a escribir
// =====================================================
[inputUsuario, inputPassword].forEach(input => {
  input.addEventListener('input', () => {
    if (!mensajeError.hidden) limpiarError();
  });
});

// =====================================================
// Caps Lock detection (solo en el campo de contraseña)
// =====================================================
function actualizarCapsLock(e) {
  const activado = e.getModifierState && e.getModifierState('CapsLock');
  capslockWarn.hidden = !activado;
}

inputPassword.addEventListener('keydown', actualizarCapsLock);
inputPassword.addEventListener('keyup',   actualizarCapsLock);
inputPassword.addEventListener('blur',    () => { capslockWarn.hidden = true; });

// =====================================================
// Mostrar / ocultar contraseña
// =====================================================
togglePwdBtn.addEventListener('click', () => {
  const esPassword = inputPassword.type === 'password';
  inputPassword.type = esPassword ? 'text' : 'password';
  togglePwdBtn.classList.toggle('is-active', esPassword);
  togglePwdBtn.setAttribute(
    'aria-label',
    esPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'
  );
  // devolver el foco al input para no cortar el flujo
  inputPassword.focus();
});

// =====================================================
// Submit del formulario
// =====================================================
form.addEventListener('submit', async function (e) {
  e.preventDefault();

  const usuario  = inputUsuario.value.trim();
  const password = inputPassword.value;

  // Validación básica del lado del cliente
  if (!usuario || !password) {
    mostrarError('Por favor completa usuario y contraseña');
    return;
  }

  // Loading state
  const textoOriginal = btnEntrar.textContent;
  btnEntrar.disabled = true;
  btnEntrar.textContent = 'Iniciando sesión...';
  btnEntrar.setAttribute('aria-busy', 'true');
  limpiarError();

  try {
    const response = await fetch(`${API_BASE_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, password })
    });

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('Respuesta inválida del servidor');
    }

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Credenciales inválidas');
    }

    // ✅ Guardar usuario desde backend, NO desde el input
    localStorage.setItem('token',   data.token);
    localStorage.setItem('usuario', data.usuario);
    localStorage.setItem('rol',     data.rol);

    // ✅ Pre-calentar el backend y verificar el token antes de redirigir.
    // Render gratis duerme tras inactividad; al hacer /auth/me ya despierto,
    // la página destino carga rápido y el usuario no ve loaders intermedios.
    btnEntrar.textContent = 'Iniciando sesión...';
    try {
      await fetch(`${API_BASE_URL}/auth/me`, {
        headers: { 'Authorization': `Bearer ${data.token}` }
      });
    } catch (_) {
      // Si /auth/me falla por timeout, igual seguimos con la redirección.
      // La página destino re-verificará la sesión.
    }

    // Redirigir al inicio correcto según rol
    const destinos = {
      seguro:             'lpr.html',
      asistente_contable: 'finanzas.html',
      bodega:             'inventario.html',
      asesor:             'inventario.html'
    };
    window.location.href = destinos[data.rol] || 'dashboard.html';
  } catch (error) {
    console.error('❌ Error en login:', error);
    mostrarError(error.message || 'Error de conexión con el servidor');

    // Restaurar botón solo si hubo error (en éxito se va de página)
    btnEntrar.disabled = false;
    btnEntrar.textContent = textoOriginal;
    btnEntrar.removeAttribute('aria-busy');
  }
});
