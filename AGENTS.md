# AGENTS.md — Área 52 Commander Manager

Estas instrucciones aplican a todo el repositorio.

## Fuente de verdad

Antes de implementar cambios funcionales, lee `PROJECT_SPEC.md`.

Si un prompt contradice `PROJECT_SPEC.md`, sigue el prompt más reciente del usuario, pero:
1. señala brevemente la diferencia;
2. actualiza `PROJECT_SPEC.md` si la nueva decisión es permanente.

## Objetivo actual

Construir **Alpha 0.1** de Área 52 Commander Manager.

No implementar funcionalidades marcadas como futuras en `PROJECT_SPEC.md` salvo instrucción explícita.

## Prioridades

1. Usabilidad real en tablet durante torneos.
2. Pocas pantallas.
3. Integridad de resultados y crédito.
4. Código simple y mantenible.
5. Lógica de negocio testeable.
6. Persistencia desacoplada de la UI.

## Stack inicial

- React
- TypeScript
- Vite
- CSS sencillo
- Vitest o equivalente compatible con Vite para lógica de dominio
- localStorage como prototipo/fallback
- Google Sheets se integra en una fase posterior mediante una capa de servicio/adaptador

Evita añadir frameworks o dependencias pesadas sin necesidad.

## Arquitectura

Separa, como mínimo:

- `components/` — UI reusable
- `features/` — funcionalidades/pantallas principales
- `domain/` — tipos, reglas y cálculos
- `services/` — persistencia/integraciones
- `utils/` — utilidades generales cuando sean necesarias

La lógica de:
- mesas;
- logros;
- leaderboard;
- crédito;
- validaciones

NO debe vivir exclusivamente dentro de componentes React.

## Google Sheets

No conectar Google Sheets durante el primer sprint.

Cuando se implemente:
- no llamar Sheets directamente desde componentes;
- usar un repository/service;
- guardar resultados por lotes;
- mantener fallback local;
- no perder datos ante error de red.

## Crédito

El crédito representa valor real de tienda.

Reglas:
- mantener movimientos;
- no usar un saldo mutable como única fuente de verdad;
- crédito proyectado NO forma parte del saldo disponible;
- no borrar silenciosamente movimientos;
- agregar validaciones antes de registrar uso;
- tests obligatorios para cálculos de crédito.

## Resultados

- Registrar logros directamente en la tarjeta de la mesa.
- `achievementPoints` se calcula, no se ingresa manualmente.
- eliminaciones: 0..3.
- `specialLeaguePoints` permanece separado.
- correcciones deben recalcular derivados.

## UX

- Diseñar mobile/tablet-first, con tablet como referencia principal.
- Botones/inputs táctiles.
- No crear una pantalla nueva si un modal/drawer/sección en la vista principal resuelve el problema.
- No sacrificar claridad por densidad.

## Calidad

Después de modificar lógica:
1. ejecutar tests;
2. ejecutar typecheck si existe;
3. ejecutar build;
4. corregir errores antes de finalizar.

Mantener tests para:
- distribución de mesas;
- cálculo de logros;
- créditos;
- saldo disponible;
- validaciones críticas.

## Git

Si el proyecto usa Git:
- revisar `git status` antes y después;
- hacer cambios enfocados;
- no reescribir historial ni borrar trabajo del usuario;
- no crear ramas salvo petición.

## Forma de trabajar

Para tareas grandes:
1. inspecciona el repo;
2. resume el plan en pocas líneas;
3. implementa en pasos pequeños;
4. prueba;
5. entrega un resumen de lo cambiado y cualquier decisión pendiente.

No reconstruyas toda la app cuando un cambio localizado sea suficiente.
