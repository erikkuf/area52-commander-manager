# Prompt inicial para Codex

Lee `AGENTS.md` y `PROJECT_SPEC.md` completos antes de modificar archivos.

Vamos a comenzar el desarrollo de **Área 52 Commander Manager — Alpha 0.1**.

Quiero que trabajemos de forma incremental. NO intentes implementar toda la Alpha en esta tarea.

## Objetivo de esta primera tarea

Crea el **Sprint 1: shell + interfaz funcional con datos mock**.

### Requisitos

1. Inicializa, si todavía no existe, un proyecto con:
   - Vite
   - React
   - TypeScript

2. Mantén las dependencias al mínimo.

3. Crea una estructura de proyecto preparada para separar:
   - UI/components
   - features
   - domain
   - services

4. Implementa una sola consola principal responsive, optimizada para tablet.

5. La consola debe incluir:
   - Header con “Área 52 · Commander Manager”
   - Nombre ficticio de la fecha
   - Ronda actual / total
   - Cantidad de jugadores activos
   - indicador ficticio de estado de guardado/sincronización
   - navegación interna: `Mesas`, `Leaderboard`, `Configuración`

6. `Mesas` debe mostrar datos ficticios de un torneo de 12 jugadores distribuidos en 3 mesas de 4.

7. Cada mesa debe verse como una tarjeta y cada jugador debe mostrar controles inline para:
   - Rotativo 1
   - Rotativo 2
   - Rotativo 3
   - Ganar mesa
   - Eliminaciones con control 0..3
   - Sobrevivir
   - Total de logros calculado en vivo

8. Debe existir un botón `Guardar mesa`, aunque en este sprint solo actualice estado local/mock.

9. Cada mesa debe mostrar visualmente:
   - Pendiente
   - Guardada
   - Editada
   según corresponda.

10. Al final de la vista de mesas mostrar:
   - `X / Y mesas registradas`
   - botón `Finalizar ronda`
   - no es necesario implementar todavía el flujo completo de finalizar ronda.

11. `Leaderboard` debe mostrar datos ficticios con columnas/campos legibles en tablet:
   - Posición
   - Jugador
   - Puntaje/logros
   - Puntos especiales
   - Crédito acumulado de fechas
   - Premio mensual proyectado
   - Crédito utilizado
   - Crédito disponible

12. El crédito proyectado debe estar visualmente identificado como proyectado y NO debe sumarse al disponible.

13. `Configuración` puede ser una primera maqueta funcional con:
   - nombre de fecha
   - número de rondas
   - nombres de Rotativo 1/2/3
   - pozo de crédito de fecha
   - porcentajes por posición

14. No implementes todavía:
   - Google Sheets
   - Apps Script
   - login
   - perfiles persistentes
   - Área52 ID
   - algoritmo avanzado de pairing
   - backend
   - integración con Shopify
   - funcionalidades fuera de `PROJECT_SPEC.md`

15. Crea desde el inicio funciones de dominio separadas para:
   - calcular puntos de logro;
   - calcular premio por porcentaje;
   - calcular crédito disponible sin incluir crédito proyectado.

16. Agrega pruebas unitarias básicas para esas funciones.

17. La interfaz debe funcionar correctamente al menos en:
   - tablet vertical aproximada 768 px;
   - tablet horizontal aproximada 1024 px;
   - desktop.

18. No busco diseño final de marca todavía. Quiero una UI limpia, clara, usable y fácil de iterar.

## Validación antes de terminar

Ejecuta:
- tests
- build

Corrige cualquier error que aparezca.

## Al finalizar

Entrégame:
1. resumen breve de lo implementado;
2. estructura de archivos principal;
3. comandos para iniciar la app localmente;
4. tests ejecutados y resultado;
5. cualquier decisión técnica que hayas tomado y que debamos conservar;
6. qué propones como siguiente tarea, sin implementarla todavía.

No avances al Sprint 2 sin mi confirmación.
