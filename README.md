# FitPlan

App web personal (PWA) para organizar la semana de entrenamiento: gimnasio, carrera y natación,
con datos de Apple Salud recibidos mediante un atajo de iOS.

- Todo el cálculo (recuperación, planificador, fuerza) es determinista y se hace en el dispositivo.
- Los datos personales no están en este repositorio: se importan desde archivos locales.

## Desarrollo

```bash
npm install
npm run dev      # servidor local
npm test         # tests (Vitest)
npm run build    # build de producción en dist/
```

Cada push a `main` pasa los tests y publica en GitHub Pages.
