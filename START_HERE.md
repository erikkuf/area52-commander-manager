# START HERE — Cómo pasar Área 52 Commander Manager a Codex

Este paquete contiene:

- `PROJECT_SPEC.md` — especificación funcional y técnica de la Alpha 0.1.
- `AGENTS.md` — instrucciones persistentes para Codex dentro del repositorio.
- `CODEX_START_PROMPT.md` — prompt exacto para iniciar el Sprint 1.
- `START_HERE.md` — esta guía.

## 1. En el computador

Crea una carpeta llamada:

```text
area52-commander-manager
```

Copia dentro de ella estos archivos:

```text
area52-commander-manager/
├── AGENTS.md
├── PROJECT_SPEC.md
├── CODEX_START_PROMPT.md
└── START_HERE.md
```

No necesitas crear `src/` manualmente. Codex podrá inicializar el proyecto.

## 2. Recomendado: iniciar Git

Desde la carpeta del proyecto:

```bash
git init
```

Git no es obligatorio para el primer minuto, pero es muy recomendable antes de empezar a iterar.

## 3. Abrir Codex

En la app de escritorio de ChatGPT:

1. Inicia sesión.
2. Selecciona **Codex**.
3. Elige/añade la carpeta `area52-commander-manager`.
4. Confirma que Codex tiene acceso a esa carpeta.

Codex puede trabajar sobre carpetas locales o repositorios Git.

## 4. Primer mensaje

Abre `CODEX_START_PROMPT.md`, copia todo su contenido y úsalo como primer prompt.

No hace falta pegar `PROJECT_SPEC.md` completo en el chat: ya está dentro del proyecto y el prompt le pide a Codex que lo lea.

## 5. Qué debería hacer Codex

En la primera tarea debería:
- inicializar Vite + React + TypeScript;
- conservar los archivos de especificación;
- crear la UI mock de Mesas/Leaderboard/Configuración;
- crear funciones de dominio;
- crear tests;
- ejecutar tests y build.

NO debería conectar Google Sheets todavía.

## 6. Después de la primera entrega

Prueba la app localmente en el navegador.

Normalmente Codex indicará el comando; con Vite suele ser algo como:

```bash
npm install
npm run dev
```

Usa el comando exacto que Codex reporte para el proyecto creado.

Revisa principalmente:
- ¿cabe bien en tablet?
- ¿registrar logros inline es cómodo?
- ¿las mesas se entienden rápido?
- ¿Leaderboard muestra demasiado o muy poco?
- ¿Configuración tiene lo necesario?
- ¿hay acciones que obligan a cambiar de pantalla innecesariamente?

## 7. Cómo pedir cambios

No pidas una reconstrucción completa.

Ejemplos:

```text
La tarjeta de cada mesa ocupa demasiado espacio en tablet.
Compacta las filas de jugadores sin eliminar ninguno de los controles.
Mantén las reglas de PROJECT_SPEC.md.
Ejecuta tests y build al terminar.
```

```text
En Leaderboard quiero que Crédito Disponible tenga mayor jerarquía visual
y que Premio Mensual se vea claramente como proyectado.
No cambies la lógica de crédito.
```

## 8. Cuándo pasar al Sprint 2

Solo cuando la interfaz del Sprint 1 sea cómoda.

El siguiente sprint será:
- creación real de torneo;
- carga/pegado de jugadores;
- generación de mesas;
- edición manual;
- persistencia local.

Google Sheets se conecta después de que la lógica local funcione.

## 9. Integración con Sheets

Antes del Sprint de Sheets conviene entregar a Codex:
- una copia o descripción exacta del Sheet actual;
- nombres de pestañas;
- columnas;
- fórmulas que deban conservarse;
- ejemplo real anonimizado o de prueba.

Así decidiremos si:
A) la app escribe en el Sheet actual; o
B) creamos pestañas `APP_*` nuevas y mantenemos el sistema antiguo intacto durante la prueba.

La recomendación inicial es B para reducir riesgo.

## 10. Regla de oro

La Alpha no necesita parecer un producto terminado.

Debe permitir correr una fecha real de Commander de forma:
- rápida;
- segura;
- corregible;
- recuperable;
- cómoda desde tablet.

Cuando eso funcione, se expande.
