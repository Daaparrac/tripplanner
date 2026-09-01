// Este archivo es reemplazado por env.js dinámico en el contenedor de Docker usando entrypoint.sh
// En desarrollo local (ng serve), window.__env será undefined y se usará el localhost:3002 fallback
window.__env = {
  apiUrl: 'http://localhost:3002' // Opcional, para desarrollo local
};
