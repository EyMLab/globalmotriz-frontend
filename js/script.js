document.getElementById('login-form').addEventListener('submit', function (e) {
  e.preventDefault();

  const usuario = document.getElementById('usuario').value;
  const password = document.getElementById('password').value;
  const mensajeError = document.getElementById('mensaje-error');

  const API_BASE_URL = 'https://globalmotriz-backend.onrender.com';

  fetch(`${API_BASE_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario, password })
  })
    .then(async response => {
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Respuesta inválida del servidor');
      }

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Credenciales inválidas');
      }

      // ✅ Guardar usuario desde backend, NO desde el input
      localStorage.setItem('token', data.token);
      localStorage.setItem('usuario', data.usuario);
      localStorage.setItem('rol', data.rol);

      window.location.href = 'dashboard.html';
    })
    .catch(error => {
      console.error('❌ Error en login:', error);
      mensajeError.textContent = error.message || 'Error de conexión con el servidor';
    });
});
