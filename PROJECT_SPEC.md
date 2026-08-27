# Área 52 Commander Manager — PROJECT_SPEC

## 1. Propósito del proyecto

**Área 52 Commander Manager** es una aplicación web interna para el staff de Área 52 destinada a operar fechas y ligas de Commander.

La Alpha 0.1 no pretende ser todavía el ecosistema completo de Área 52. Su objetivo es reemplazar progresivamente la operación manual en Google Sheets mediante una interfaz rápida, clara y cómoda para tablet, manteniendo Google Sheets como almacenamiento/transición durante las primeras etapas.

El ecosistema futuro podrá incorporar perfiles persistentes, Área52 ID, sistema de socios, otros TCG, historial, inscripción online, etc. Esas funciones están fuera de alcance de la Alpha 0.1.

---

## 2. Objetivo de Alpha 0.1

La Alpha 0.1 se considera útil si permite realizar una fecha completa de Commander usando la app como interfaz principal:

1. Crear/configurar una fecha.
2. Cargar participantes.
3. Generar mesas.
4. Registrar resultados/logros directamente desde cada mesa.
5. Guardar y corregir resultados.
6. Finalizar una ronda.
7. Generar rondas posteriores.
8. Ver el Standing de la fecha y el Leaderboard de la liga/mes.
9. Calcular créditos según pozos y porcentajes.
10. Registrar crédito utilizado y actualizar el saldo disponible.
11. Recuperar el estado del torneo ante cierre accidental o pérdida temporal de conexión.
12. Sincronizar los datos con Google Sheets cuando se implemente el adaptador de Sheets.

---

## 3. Principios de producto

### 3.1 Pocas pantallas
La app tiene una capa global para organizar operación e historial:
- **Inicio**
- **Ligas**
- **Eventos**
- **Hall of Fame**
- **Configuración**

Al abrir una fecha o torneo concreto se reutiliza el Tournament Manager como consola única,
con sus modos/secciones:
- **Mesas**
- **Standing**
- **Configuración**

Acciones secundarias como jugadores, edición de mesas, movimientos de crédito y ajustes deben abrirse como paneles, drawers o modales. Los históricos de ligas y eventos sí se organizan mediante la navegación global.

### 3.2 Tablet primero
La interfaz será utilizada principalmente desde tablet y notebook.

Prioridades:
- Botones grandes.
- Controles táctiles.
- Alto contraste y lectura rápida.
- Uso vertical cómodo y buen soporte horizontal.
- Evitar tablas que requieran zoom.
- Evitar campos diminutos.
- Acciones frecuentes accesibles con pocos toques.

### 3.3 La app es la interfaz; Sheets es transición
Durante la transición:
- La app debe ser la interfaz de operación.
- Google Sheets puede actuar como almacenamiento/backup.
- La lógica de UI no debe depender directamente de Sheets.
- Debe existir una capa de servicios/adaptadores para poder reemplazar Sheets por una base de datos real en el futuro.

### 3.4 Trazabilidad
Resultados y movimientos de crédito representan información relevante para la tienda.

No borrar silenciosamente datos importantes.
Preferir:
- editar con historial;
- anular movimientos;
- registrar cuándo se hizo un cambio.

### 3.5 No sobreconstruir
La Alpha debe mantenerse pequeña.
No añadir funciones futuras solo porque sean técnicamente posibles.

---

## 4. Fuera de alcance de Alpha 0.1

No implementar todavía:
- Cuenta/login de jugadores.
- Área52 ID definitivo.
- Perfil persistente de jugador.
- Registro histórico completo por jugador.
- Sistema de socios.
- Inscripción pública online.
- Pagos online.
- Integración Shopify.
- Base completa de mazos y decklists por jugador/evento. El Hall of Fame puede conservar metadata
  opcional del mazo del campeón sin convertirse en una base de mazos.
- Logros históricos/gamificación.
- Chat.
- QR.
- Otros TCG.
- App nativa iOS/Android.
- Wallet comercial completa.
- Compras/inventario.
- Automatizaciones de premios fuera de las reglas descritas.
- Permisos/roles con autenticación real.

La Alpha es una **consola interna de staff**.

---

## 5. Arquitectura técnica propuesta

### Frontend
- React
- TypeScript
- Vite
- CSS sencillo y mantenible; evitar dependencias visuales innecesarias.

### Estado
Mantener el estado de dominio separado de los componentes visuales.

### Persistencia
Diseñar una interfaz de almacenamiento desde el principio.

Ejemplo conceptual:

```ts
interface TournamentRepository {
  getTournament(id: string): Promise<Tournament | null>;
  saveTournament(tournament: Tournament): Promise<void>;
  saveTableResults(roundId: string, tableId: string, results: PlayerResult[]): Promise<void>;
  saveCreditMovement(movement: CreditMovement): Promise<void>;
}
```

Implementaciones previstas:
1. `LocalStorageTournamentRepository` para prototipo/fallback.
2. `GoogleSheetsTournamentRepository` o cliente de Google Apps Script para la transición.
3. Futuro: backend/database real.

Los componentes React nunca deben llamar directamente a Google Sheets.

### Pruebas
Agregar pruebas unitarias, como mínimo, para:
- distribución de tamaños de mesas;
- cálculo de puntos de logro;
- cálculo de créditos;
- cálculo de saldo disponible;
- validaciones críticas.

---

## 6. Entidades de dominio

### 6.1 Tournament

```ts
type TournamentStatus = "setup" | "active" | "rounds_completed" | "finished";
type PairingMode = "balanced_random" | "swiss";

interface Tournament {
  id: string;
  type: "league_date" | "independent";
  name: string;
  date: string;
  totalRounds: number;
  pairingMode: PairingMode;
  currentRound: number;
  status: TournamentStatus;

  prizeMode: "none" | "league_auto" | "manual_credit";
  leaguePeriodId?: string;
  prizePlayerCount: number;
  prizeParticipantIds: string[];

  rotatingAchievements: RotatingAchievementConfig[];
  achievementConfig: AchievementConfig; // snapshot propio del evento

  dateCreditConfig: CreditPrizeConfig;
  monthCreditConfig?: CreditPrizeConfig;

  participants: Participant[];
  rounds: Round[];
  ghostPairingAuthorized: boolean;
  financialReviewRequired: boolean;
  financialReviewResolvedAt?: string;
  finishedAt?: string;
}
```

### 6.2 Participant

La Alpha no tiene cuentas persistentes.

```ts
interface Participant {
  id: string;
  playerKey: string;
  name: string;
  active: boolean;
  isGhost: boolean;
}
```

`playerKey` es una identidad temporal para permitir acumulación en una liga/mes.

Regla Alpha:
- Preferir un identificador estable proveniente del Sheet actual cuando exista.
- Si no existe, generar uno desde un nombre canónico y mantenerlo estable durante el mes.
- No confundir `playerKey` con un futuro Área52 ID.
- Advertir/evitar nombres duplicados.

El workspace mantiene además un registro estable local de identidades:

```ts
interface PlayerIdentity {
  playerKey: string;
  canonicalName: string;
  aliases: string[];
  createdAt: string;
  updatedAt: string;
}
```

Los alias resuelven cargas futuras al mismo `playerKey`. Unificar dos identidades es una acción
administrativa explícita que actualiza participantes y movimientos, conserva todos los alias y
marca revisión financiera en ligas finalizadas afectadas.

### 6.3 Round

```ts
type RoundStatus = "pending" | "active" | "finished";

interface Round {
  id: string;
  tournamentId: string;
  number: number;
  status: RoundStatus;
  tables: CommanderTable[];
  isCorrectionMode: boolean;
  wasEditedAfterFinish: boolean;
  lastEditedAt?: string;
}
```

### 6.4 CommanderTable

```ts
type TableStatus = "pending" | "saved" | "edited";

interface CommanderTable {
  id: string;
  roundId: string;
  tableNumber: number;
  participantIds: string[];
  status: TableStatus;
  results: PlayerResult[]; // borrador visible
  savedResults: PlayerResult[]; // última versión confirmada
  editCount: number; // indicador básico de correcciones
  lastSavedAt?: string;
}
```

### 6.5 RotatingAchievementConfig

```ts
interface RotatingAchievementConfig {
  id: "rotating1" | "rotating2" | "rotating3" | "rotating4" | "rotating5";
  label: string;
  points: number; // default Alpha: 1
}
```

### 6.6 PlayerResult

```ts
interface PlayerResult {
  participantId: string;
  rotating1: boolean;
  rotating2: boolean;
  rotating3: boolean;
  rotating4?: boolean;
  rotating5?: boolean;
  wonTable: boolean;
  eliminations: number; // 0..3
  survived: boolean;

  achievementPoints: number; // calculated
  specialLeaguePoints: number; // separate, manual/admin
}
```

### 6.7 CreditPrizeConfig

```ts
interface CreditPrizeConfig {
  prizePool: number;
  percentagesByPosition: number[];
}
```

Example:
```ts
{
  prizePool: 30000,
  percentagesByPosition: [50, 30, 20]
}
```

Validation:
- prizePool >= 0
- each percentage >= 0
- percentages must total 100 when a prize pool is active.

### 6.8 CreditMovement

```ts
type CreditMovementType =
  | "date_prize"
  | "month_prize"
  | "usage"
  | "positive_adjustment"
  | "negative_adjustment";

type CreditMovementStatus = "active" | "void";

interface CreditMovement {
  id: string;
  playerKey: string;
  tournamentId?: string;
  leagueMonthId?: string;

  type: CreditMovementType;
  amount: number;
  reason: string;
  createdAt: string;
  status: CreditMovementStatus;
  sourceReference?: string; // idempotencia para importaciones y compensaciones
}
```

Store movements, not just a mutable balance.

### 6.9 Modos de premio y período de liga

```ts
type PrizeMode = "none" | "league_auto" | "manual_credit";

interface LeaguePeriod {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: "active" | "finished";
  contributionConfig: {
    contributionPerPlayer: number;        // default 4000
    dateContributionPerPlayer: number;    // default 2000
    monthlyContributionPerPlayer: number; // default 2000
  };
  datePrizePercentages: number[];
  monthlyPrizePercentages: number[];
  defaultAchievementConfig: AchievementConfig;
  defaultRotatingAchievements: RotatingAchievementConfig[];
  finishedAt?: string;
  reviewRequired?: boolean;
  finalizedMonthlyPool?: number;
  finalizedMonthlyAwards?: LeagueMonthlyAward[];
}

interface LeaguePoolContribution {
  id: string;
  leaguePeriodId: string;
  tournamentId: string;
  playerCount: number;
  datePoolAmount: number;
  monthlyPoolContribution: number;
  status: "projected" | "finalized";
  createdAt: string;
  finalizedAt?: string;
}

interface ChampionPhotoReference {
  id: string;
  fileName: string;
  mimeType: string;
  storageKey: string;
}

interface LeagueChampionSnapshot {
  id: string;
  leaguePeriodId: string;
  leagueName: string;
  playerKey: string;
  playerName: string;
  finalPosition: 1;
  leaguePoints: number;
  achievementPoints: number;
  specialLeaguePoints: number;
  tableWins: number;
  eliminations: number;
  tournamentsPlayed: number;
  championPhoto?: ChampionPhotoReference;
  commanderName?: string;
  deckName?: string;
  deckUrl?: string;
  createdAt: string;
  sourceClosedAt?: string;
}
```

Reglas:
- una fecha con `type = "league_date"` requiere `leaguePeriodId`;
- un evento con `type = "independent"` no pertenece a un `LeaguePeriod`;
- una fecha asociada a liga siempre usa `league_auto`;
- un torneo independiente usa `none` o `manual_credit`;
- fecha + mensual por jugador debe ser igual al aporte total;
- al editar el total, el aporte de fecha o el aporte mensual, la configuración compensa automáticamente el otro valor para conservar esa igualdad;
- existe como máximo un `LeaguePoolContribution` por `tournamentId`;
- el pozo mensual se deriva de contribuciones y nunca es un monto manual acumulado;
- una contribución proyectada no aumenta el crédito disponible.
- `defaultAchievementConfig` es el default para nuevas fechas y nunca una referencia mutable para fechas existentes.
- `defaultRotatingAchievements` conserva entre 1 y 5 nombres/identificadores y se copia como snapshot a cada fecha nueva.
- Las distribuciones de pozo de fecha y mensual son arreglos variables: el administrador puede agregar o quitar posiciones y el total debe sumar 100% cuando existe pozo.
- Existe como máximo un `LeagueChampionSnapshot` oficial por `LeaguePeriod`; el snapshot conserva
  nombres y estadísticas históricas y no depende de recalcular el Leaderboard al abrir el Hall of Fame.

---

## 7. Flujo de torneo

### 7.1 Crear torneo

La navegación global usa una única acción `+ Nuevo torneo`. El flujo permite elegir `Fecha de Liga` o `Torneo Independiente` antes de mostrar sus campos específicos.

Campos:
- Nombre.
- Fecha.
- Número de rondas.
- Entre uno y cinco logros rotativos; los tres históricos conservan sus identificadores.
- Tipo de evento: fecha de liga o torneo independiente.
- Liga asociada cuando corresponda.
- Torneo independiente: sin crédito o pozo manual + porcentajes.
- Fecha de liga: pozos de fecha y mensual automáticos según jugadores inscritos.

### 7.2 Cargar jugadores
Permitir:
- añadir uno a uno;
- pegar una lista con un jugador por línea;
- detectar nombres vacíos;
- advertir nombres duplicados;
- editar nombre antes de iniciar;
- agregar jugador tardío;
- drop;
- reactivar.

### 7.3 Generar ronda
Alpha 0.1:
- prioridad mesas de 4;
- usar mesas de 3 cuando sea necesario;
- nunca generar mesa de 2 si existe una distribución válida en mesas de 3/4;
- permitir edición manual/intercambio antes de confirmar.
- seleccionar al crear cada fecha o torneo independiente uno de dos sistemas:
  - `balanced_random`: distribución aleatoria equilibrada que minimiza rivales repetidos;
  - `swiss`: sistema suizo multijugador que usa el Standing del Tournament y evita rematches;
- la primera ronda suiza se distribuye como aleatoria equilibrada porque todavía no existe puntaje;
- el modo elegido queda persistido en el Tournament y afecta únicamente rondas futuras;
- mantener edición manual/intercambio antes de confirmar cualquiera de los dos sistemas.

### 7.4 Registrar resultados
Los resultados se registran **directamente en la tarjeta de la mesa**, no en una pantalla aparte.

Cada jugador muestra:
- R1 (rotativo 1)
- R2
- R3
- Ganar mesa
- Eliminaciones con control `- / número / +`
- Sobrevivir
- Total de puntos de logro calculado en vivo

Reglas de consistencia:
- una mesa admite como máximo un ganador;
- al marcar un ganador, `Ganar mesa` queda deshabilitado para el resto;
- para cambiarlo se debe desmarcar primero al ganador actual;
- con ganador, todos los no-ganadores quedan con `survived = false` y su control se deshabilita;
- desmarcar al ganador reactiva `Sobrevivir` sin marcarlo automáticamente.

Botón:
- `Guardar mesa`

La mesa muestra:
- Pendiente
- Guardada
- Editada

### 7.5 Finalizar ronda
Mostrar:
- `X / Y mesas registradas`

Reglas:
- Si hay mesas pendientes, bloquear o exigir confirmación explícita.
- Validar datos antes de finalizar.
- Una ronda finalizada puede corregirse por admin/staff.
- Una corrección recalcula totales.
- Las rondas finalizadas se consultan en modo lectura mediante selector de rondas.
- `Corregir ronda` habilita explícitamente la edición sin cambiar `Round.status`.
- La confirmación compara el Standing anterior y nuevo; el crédito consolidado no cambia automáticamente.

### 7.6 Siguiente ronda
Usar participantes activos.
Los drops conservan resultados previos pero no entran en pairings futuros.

### 7.7 Finalizar fecha
Antes de cerrar:
- todas las mesas resueltas;
- resultados validados;
- Standing recalculado;
- crédito de fecha calculado;
- finalizar la última ronda cambia el estado a `rounds_completed`;
- la acción independiente `Finalizar evento` cambia el estado a `finished` y registra `finishedAt`.

---

## 8. Reglas de distribución de mesas

Commander:
- máximo 4 jugadores por mesa;
- objetivo: mesas de 4;
- mesas de 3 para resolver cantidades no divisibles por 4;
- no mesas de 2.

Ejemplos:
- 8 -> 4 + 4
- 9 -> 3 + 3 + 3
- 10 -> 4 + 3 + 3
- 11 -> 4 + 4 + 3
- 12 -> 4 + 4 + 4
- 13 -> 4 + 3 + 3 + 3
- 14 -> 4 + 4 + 3 + 3
- 15 -> 4 + 4 + 4 + 3
- 16 -> 4 + 4 + 4 + 4

La función debe funcionar para cantidades mayores siguiendo la misma regla.

### Regla de error
Con menos de 3 participantes activos no se puede generar una ronda válida.

### 8.1 Jugador Fantasma para exactamente cinco jugadores

- Cinco jugadores reales no forman una distribución válida de mesas de 3/4.
- Tras confirmación administrativa se agrega un único `Participant` con `isGhost = true` para producir `3 + 3`.
- El Fantasma es contexto operativo de la ronda, no una inscripción permanente ni un participante competitivo.
- No tiene `PlayerResult`, controles de logros, Standing, Leaderboard, puntos especiales, crédito, participación ni aporte a pozos.
- Aunque no tenga `PlayerResult`, el Fantasma sí es un oponente eliminable: eliminarlo aumenta en 1 el contador de eliminaciones del jugador real y otorga los puntos configurados para ese logro.
- El máximo de eliminaciones de un jugador se calcula desde los demás asientos de la mesa, incluyendo el asiento Fantasma, con límite general 0..3.
- `prizePlayerCount` considera exclusivamente jugadores reales.
- En rondas sucesivas se prioriza sentar con el Fantasma a quienes tengan menor exposición previa.
- Puede intercambiarse antes de confirmar mesas, conservando una sola instancia y mesas válidas.
- El historial preserva su mesa para reconstruir la ronda.

---

## 9. Logros y puntajes

### 9.1 Logros de cada partida
Config/default Alpha:

- Rotativo 1: booleano, +1 punto de logro.
- Rotativo 2: booleano, +1.
- Rotativo 3: booleano, +1.
- Ganar la mesa: booleano, +3.
- Eliminar oponente: contador 0..3, +1 por eliminación.
- Sobrevivir: booleano, +1.

Los valores y su disponibilidad son configurables:

```ts
interface AchievementRule {
  enabled: boolean;
  points: number; // >= 0
}

interface AchievementConfig {
  rotating1: AchievementRule;
  rotating2: AchievementRule;
  rotating3: AchievementRule;
  rotating4?: AchievementRule;
  rotating5?: AchievementRule;
  win: AchievementRule;
  elimination: AchievementRule;
  survival: AchievementRule;
}
```

- `LeaguePeriod.defaultAchievementConfig` se copia al crear una nueva fecha.
- `Tournament.achievementConfig` es un snapshot independiente.
- Cambiar la liga no modifica fechas ya creadas.
- Deshabilitar un logro no borra el hecho histórico registrado; solo deja de otorgar puntos bajo la configuración del torneo.
- Cambiar configuración con resultados exige confirmación y recálculo explícito de los valores derivados.

### 9.2 Cálculo
El staff nunca escribe manualmente el total de logros.

```ts
achievementPoints =
  suma de los puntos de los rotativos configurados (máximo 5) +
  winPoints +
  eliminationPoints +
  survivalPoints;
```

### 9.3 Puntos especiales
Los puntos especiales de liga:
- son separados de los logros;
- son asignados por staff/admin;
- deben persistirse como movimientos, no como un total mutable;
- se usarán para el puntaje mensual de liga;
- su fórmula final de ranking mensual debe mantenerse separada y configurable.

No mezclar silenciosamente `achievementPoints` y `specialLeaguePoints`.

```ts
type SpecialPointMovementStatus = "active" | "void";

interface SpecialPointMovement {
  id: string;
  leaguePeriodId: string;
  playerKey: string;
  amount: number;
  reason?: string;
  createdAt: string;
  status: SpecialPointMovementStatus;
}
```

`specialLeaguePoints` se deriva sumando movimientos `active`. Una anulación cambia el movimiento a `void`, sin borrarlo. Estos puntos afectan exclusivamente el Leaderboard de liga, nunca el Standing individual de una fecha. Corregirlos tras un cierre requiere reapertura o acción administrativa explícita y activa `financialReviewRequired` si puede cambiar el histórico.

---

## 10. Standing de Tournament y Leaderboard de LeaguePeriod

`Standing` es la clasificación de un único `Tournament` y se deriva exclusivamente de sus rondas, mesas y resultados reales. También aplica a eventos independientes. No incluye puntos especiales ni resultados de otras fechas.

`Leaderboard` es la clasificación agregada de un `LeaguePeriod`: suma los resultados de sus fechas, logros acumulados y movimientos activos de puntos especiales.

Para estadísticas competitivas, una participación o fecha jugada se cuenta únicamente cuando el
jugador tiene al menos una mesa con resultados confirmados (`savedTables > 0`). La inscripción o un
DROP previo a jugar no aumentan `LeagueLeaderboardEntry.participations` ni
`LeagueChampionSnapshot.tournamentsPlayed`.

Campos mínimos:
- Posición.
- Jugador.
- Puntaje correspondiente a la fecha o liga según la vista.
- Puntos/logros acumulados.
- Puntos especiales.
- Crédito acumulado de fechas.
- Pozo/crédito de fin de mes proyectado o final.
- Total proyectado/final, calculado como crédito consolidado de fechas más el monto mensual correspondiente.
- Crédito ganado finalizado.
- Crédito utilizado.
- Crédito disponible.

### 10.1 Desempates
El sistema debe permitir una estrategia ordenada de desempate.

Orden competitivo Alpha 0.1:
1. puntaje principal;
2. mayor cantidad de victorias de mesa;
3. mayor cantidad/puntos de logros obtenidos;
4. mayor cantidad de eliminaciones;
5. resolución administrativa explícita cuando todos los criterios anteriores siguen empatados;
6. orden alfabético y clave estable únicamente como fallback de visualización antes de resolver.

Una liga finalizada puede conservar `finalizedLeaderboardPlayerKeys` como snapshot oficial para
representar un desempate administrativo ya resuelto (por ejemplo, sorteo). Ese snapshot no reemplaza
las métricas ni se usa automáticamente en ligas activas; las comparaciones teóricas se reconstruyen
con los criterios competitivos.

`buildLeagueLeaderboard` conserva el orden oficial/histórico de una liga finalizada mediante
`finalizedLeaderboardPlayerKeys`. `buildTheoreticalLeagueLeaderboard` reconstruye el orden deportivo
actual sin imponer ese snapshot, utilizando resultados confirmados, puntos especiales activos y los
desempates competitivos. `administrativeLeaderboardPlayerKeys` puede resolver únicamente un empate
competitivo exacto. Ninguno de estos cálculos modifica movimientos de crédito.

Antes de finalizar una liga, los empates exactos pueden ordenarse dentro de su propio grupo. La
acción no puede mover a un jugador por sobre otro con mejores métricas competitivas. El orden
elegido se conserva en `administrativeLeaderboardPlayerKeys` y el cierre oficial en
`finalizedLeaderboardPlayerKeys`.

### 10.2 Crédito proyectado
Mientras el mes no esté cerrado:
- mostrar el crédito mensual basado en la posición actual como **Proyectado**;
- no sumarlo al saldo disponible.

Cuando la liga/mes se cierre:
- el monto mensual se convierte en crédito ganado/finalizado.

---

## 11. Crédito de tienda

### 11.0 Origen del pozo

Fechas de liga:

```text
pozo fecha = prizePlayerCount × aporte fecha por jugador
aporte mensual = prizePlayerCount × aporte mensual por jugador
```

Durante setup, `prizePlayerCount` sigue a los inscritos. Al iniciar se congela.
Los DROP posteriores no reducen los pozos. Una inscripción tardía requiere confirmación
administrativa antes de aumentar `prizePlayerCount`.
Si la ronda actual ya tiene mesas generadas, la inscripción tardía no modifica ese pairing
silenciosamente y el participante se incorpora desde la siguiente ronda.

Torneos independientes:
- `none`: pozo cero;
- `manual_credit`: el pozo y porcentajes son manuales y no dependen de participantes.

### 11.1 Crédito por fecha
Fórmula:

```text
crédito posición = pozo de fecha × porcentaje de esa posición
```

Ejemplo:
- Pozo: $30.000
- 1°: 50% => $15.000
- 2°: 30% => $9.000
- 3°: 20% => $6.000

Al finalizar un Tournament con pozo activo, los créditos de sus posiciones se consolidan
inmediatamente como movimientos `date_prize`. Desde ese momento pertenecen al jugador y forman
parte de su saldo disponible, aunque el `LeaguePeriod` continúe activo. El cierre mensual no es un
requisito para utilizarlos.

La sincronización se ejecuta después de cualquier cambio del catálogo de eventos, además de la
carga e importación del estado. Si encuentra un evento `finished` sin los movimientos esperados,
crea únicamente los faltantes de manera idempotente. Si ya existe una consolidación completa, no
reasigna ni modifica el crédito aunque cambie posteriormente el Standing: esa diferencia activa o
mantiene el flujo de revisión financiera.

Una corrección histórica distingue siempre el resultado deportivo del crédito ya entregado:
- el Standing y el crédito teórico se recalculan inmediatamente;
- los movimientos originales nunca se borran ni reescriben automáticamente;
- el Centro de conciliación exige una confirmación administrativa para corregir a todos los
  jugadores afectados;
- una diferencia positiva crea un `positive_adjustment` y una diferencia negativa crea un
  `negative_adjustment`, ambos asociados al `tournamentId` corregido;
- cada corrección utiliza `sourceReference` determinística y es idempotente;
- después de confirmar, el crédito efectivo por fecha debe coincidir con el crédito teórico
  corregido para todos los jugadores;
- si un jugador ya utilizó crédito que luego debe descontarse, el ajuste se registra igualmente y
  su saldo disponible puede quedar negativo hasta regularizarse;
- la revisión financiera no puede marcarse como resuelta mientras existan diferencias pendientes.

### 11.2 Crédito de fin de mes
Misma lógica, pero con:
- pozo mensual;
- porcentajes mensuales;
- posición final del mes.

El pozo mensual no se ingresa manualmente:
- confirmado = suma de aportes de fechas finalizadas;
- proyectado = confirmado + aportes de fechas configuradas/activas;
- recalcular, finalizar o reabrir una fecha actualiza el mismo aporte por `tournamentId`.

### 11.3 Valores a mostrar
Separados:
- Crédito ganado en fechas, derivado de movimientos `date_prize` activos más ajustes activos
  asociados explícitamente a cada `tournamentId`.
- Crédito teórico corregido y diferencia pendiente cuando no coincide con lo consolidado.
- Crédito fin de mes proyectado/final.
- Total proyectado/final = crédito de fechas consolidado + crédito mensual proyectado/final.
- Crédito ganado finalizado.
- Crédito utilizado.
- Crédito disponible.

### 11.4 Saldo disponible
Solo crédito finalizado:

```text
disponible = crédito ganado finalizado - crédito utilizado
```

Nunca incluir crédito mensual proyectado en `disponible`.

El total proyectado es informativo y tampoco se utiliza como saldo. Mientras la liga esté activa,
solo el componente ya consolidado en fechas está disponible para uso.

La consolidación de `date_prize` se vuelve a ejecutar idempotentemente al recuperar el estado,
importar un respaldo y después de cualquier cambio en eventos o torneos. Si el evento quedó
`finished` pero un cierre accidental impidió guardar el ledger financiero, se crean solo los
movimientos faltantes. Un movimiento existente nunca se duplica ni se reescribe silenciosamente.

---

## 12. Uso de crédito

Desde Leaderboard, tocar un jugador abre un panel/modal.

Mostrar:
- Crédito por fechas.
- Crédito mensual finalizado/proyectado.
- Crédito ganado finalizado.
- Crédito utilizado.
- Disponible.
- Historial de movimientos.

Acción admin/staff:
- Registrar uso de crédito.
- Monto.
- Motivo.
- Confirmar.

Validaciones:
- monto > 0;
- no permitir usar más que el saldo disponible salvo ajuste administrativo explícito;
- motivo requerido para ajustes manuales.

### Correcciones
Preferir:
- anular movimiento;
- crear ajuste;
en lugar de borrar físicamente movimientos.

El Centro de conciliación permite corregir en un único lote todas las diferencias de una fecha:
genera aumentos y descuentos trazables, no duplica correcciones ya aplicadas y conserva intactos los
movimientos originales. La confirmación debe mostrar ambos totales antes de aplicarlos.

---

## 13. Interfaz principal

### Header
Mostrar:
- Área 52 · Commander Manager
- Nombre de la fecha
- Ronda actual / total
- Participantes activos
- estado de sincronización

### Navegación dentro de la misma vista
- `MESAS`
- `STANDING`
- `CONFIGURACIÓN`

No deben ser rutas/páginas separadas si no es necesario.

### Mesas
Cada tarjeta contiene todos los controles de resultado.

Ejemplo conceptual:

```text
MESA 1                                      ✓ GUARDADA

Pablo Ortega       R1 ✓ R2 ☐ R3 ✓ G ✓ KO [-] 2 [+] S ☐   5
Javier Cisternas   R1 ☐ R2 ✓ R3 ☐ G ☐ KO [-] 0 [+] S ✓   2
Kevin Arenas       ...
Erick Farfán       ...

[ GUARDAR MESA ]
```

Los nombres largos de rotativos pueden verse mediante tooltip/popover o leyenda superior.

### Footer de ronda
- `3 / 4 mesas registradas`
- `FINALIZAR RONDA`

---

## 14. Panel de jugadores

Abrir como modal/drawer.

Funciones:
- lista de participantes;
- activo/drop;
- agregar;
- pegar lista;
- editar nombre;
- drop;
- reactivar.

No crear página separada.

---

## 15. Configuración

Panel/modal o sección dentro de la misma consola.

Permitir:
- editar nombre de fecha;
- rondas mientras sea seguro;
- configuración completa de logros y activación de rotativos;
- pozo de fecha;
- porcentajes;
- pozo mensual;
- porcentajes mensuales;
- criterios de ranking/desempate cuando se implemente.

Cambios que afecten resultados ya registrados deben requerir confirmación.

Reglas para cantidad de rondas:
- aumentar está permitido en eventos no finalizados;
- reducir solo si las rondas superiores no existen;
- una ronda superior pendiente y vacía requiere confirmación explícita para eliminarse;
- nunca se eliminan rondas activas, finalizadas, mesas o resultados silenciosamente.

La configuración global administra ligas activas y finalizadas, con `+ Crear liga` siempre disponible. Los cambios sensibles en una liga finalizada no reescriben fechas, standings, créditos, campeón ni snapshots y pueden activar `reviewRequired`.

La distribución del aporte por jugador ofrece controles numéricos y un deslizador. Modificar `Fecha` recalcula `Mensual`, modificar `Mensual` recalcula `Fecha`, y modificar `Total` conserva el aporte de fecha cuando sea posible y recalcula el mensual.

Los modales de recálculo de Standing/Leaderboard y revisión de créditos deben limitar su altura al viewport y permitir desplazamiento vertical para que todas las diferencias y acciones sean accesibles en tablet.

---

## 16. Edición manual de mesas

Debe existir.

Antes de confirmar/generar la ronda:
- mover/intercambiar jugadores entre mesas.

Primera implementación:
- selector "Cambiar jugador".
- no es obligatorio drag-and-drop.

Validar:
- un jugador no puede aparecer dos veces;
- solo jugadores activos;
- tamaños válidos 3/4.

---

## 17. Validaciones críticas

Implementar advertencias o bloqueos para:

- nombre de torneo vacío;
- menos de 3 participantes;
- participantes duplicados;
- jugador duplicado en una ronda;
- jugador con drop en una mesa futura;
- mesa de 2;
- mesa >4;
- eliminaciones <0 o >3;
- porcentajes de crédito que no sumen 100;
- pozo negativo;
- cerrar ronda con mesas pendientes;
- uso de crédito mayor al disponible;
- guardar resultado inconsistente;
- finalizar torneo con ronda incompleta.

---

## 18. Autosave, recuperación y sincronización

### Estado local
Mantener un snapshot local para:
- cierre accidental;
- pérdida de internet;
- reload.

Configuración ofrece exportación e importación de un respaldo JSON validado. La importación reemplaza
el workspace y ledger local solo después de confirmación, migra sus schemas y evita editar
`localStorage` manualmente.

La fuente principal local se guarda en una única instantánea transaccional que contiene `workspace`
y `LeaguePrizeLedger`. Las claves antiguas se leen solamente como fallback de migración; una vez
recuperadas se escribe la instantánea unificada sin borrar automáticamente los datos anteriores.

El Centro de conciliación compara por jugador crédito teórico, crédito consolidado, uso asociado y
diferencias. Puede reconstruir movimientos de fecha faltantes mediante operaciones idempotentes, pero
nunca altera automáticamente movimientos ya consolidados. También permite importar usos desde un
archivo `.xlsx` o `.csv` con previsualización, resolución por identidad/alias y detección de filas ya
importadas mediante `sourceReference`.

La instantánea transaccional se normaliza financieramente antes de persistir: contribuciones de liga y
premios de fechas finalizadas se sincronizan con el catálogo actual. Esta normalización también ocurre
al finalizar un evento, por lo que el crédito de fecha queda disponible sin esperar el cierre de liga.

### Sheets
Cuando se implemente:
- guardar resultados por mesa en lote;
- no escribir a Sheets por cada checkbox;
- mostrar estado:
  - `Guardado local`
  - `Sincronizando…`
  - `Sincronizado`
  - `Error de sincronización`

Si Sheets falla:
- no perder cambios locales;
- permitir reintentar.

---

## 19. Google Sheets como backend transitorio

No implementar la integración real hasta contar con la estructura/archivo de Sheets de Área 52 o una decisión explícita de crear uno nuevo.

Arquitectura prevista:

```text
React app
   ↓
storage/service layer
   ↓
Google Apps Script Web App / API
   ↓
Google Sheets
```

### Hojas sugeridas si se crea un Sheet nuevo

#### `Torneos`
- tournament_id
- name
- date
- total_rounds
- current_round
- status

#### `Participantes`
- tournament_id
- participant_id
- player_key
- name
- active

#### `Rondas`
- tournament_id
- round_id
- round_number
- status

#### `Mesas`
- round_id
- table_id
- table_number
- status

#### `Resultados`
- tournament_id
- round_id
- table_id
- participant_id
- player_key
- rotating_1
- rotating_2
- rotating_3
- won_table
- eliminations
- survived
- achievement_points
- special_league_points

#### `MovimientosCredito`
- movement_id
- player_key
- tournament_id
- league_month_id
- type
- amount
- reason
- created_at
- status

No guardar un saldo como única fuente de verdad. El saldo se deriva de movimientos activos.

---

## 20. Historial de cambios

Alpha mínima:
- guardar timestamps en cambios relevantes;
- registrar movimientos de crédito;
- marcar mesa editada si un resultado guardado se modifica.

Deseable:
- pequeño activity log:
  - resultado de Mesa 3 editado;
  - jugador dado de baja;
  - crédito utilizado;
  - movimiento anulado.

No es necesario construir una página de auditoría compleja.

---

## 21. Deshacer

Proporcionar, cuando sea razonable:
- deshacer última acción administrativa local;
- o confirmaciones claras para acciones destructivas.

No debe reemplazar la trazabilidad persistente de crédito.

---

## 22. Criterios de aceptación Alpha 0.1

La Alpha 0.1 se puede considerar lista para una prueba real cuando:

1. Se puede crear una fecha.
2. Se pueden pegar 8–40 nombres sin fricción relevante.
3. Se pueden generar mesas válidas de 3/4.
4. Se pueden editar mesas manualmente.
5. Se pueden registrar todos los logros directamente en la vista de mesas.
6. Los puntos de logro se calculan automáticamente.
7. Todas las mesas muestran su estado.
8. No se puede cerrar una ronda incompleta sin advertencia explícita.
9. Drops funcionan sin borrar historial previo.
10. Correcciones recalculan resultados.
11. El Standing del Tournament y el Leaderboard de la liga se actualizan desde resultados confirmados.
12. Los créditos por posición se calculan desde pozo + porcentajes.
13. Se muestran por separado crédito consolidado de fechas, mensual proyectado/final, total proyectado/final, utilizado y disponible.
14. Se puede registrar uso de crédito.
15. El saldo disponible no incluye crédito proyectado.
16. El estado sobrevive a reload/cierre accidental.
17. La app es cómoda en tablet.
18. `npm test` pasa.
19. `npm run build` pasa.
20. Cuando se conecte Sheets, una fecha de prueba produce los mismos resultados que el sistema actual.

---

## 23. Orden de implementación recomendado

### Sprint 1 — Shell + UI con datos mock
- Vite + React + TypeScript.
- Layout tablet-first.
- Header.
- Mesas / Standing / Configuración.
- Datos ficticios.
- Sin Sheets.
- Sin lógica completa.

### Sprint 2 — Dominio de torneo
- Crear torneo.
- Cargar jugadores.
- Estado del torneo.
- Generar mesas.
- Edición manual.
- Drops y reactivación.
- Local storage.

### Sprint 3 — Resultados
- Logros inline.
- Eliminaciones.
- Total automático.
- Guardar mesa.
- Finalizar ronda.
- Correcciones.
- Standing en vivo a partir de resultados guardados.
- Drops entre rondas y generación de la ronda siguiente.

### Sprint 4 — Standing, Leaderboard y crédito
- Ranking.
- Desempates base.
- Pozos y porcentajes.
- Crédito por fecha.
- Crédito mensual proyectado/final.
- Movimientos de uso.
- Disponible.
- `PrizeMode`: liga automática, independiente manual o sin crédito.
- `LeaguePeriod` y contribuciones mensuales idempotentes por fecha.
- Navegación global: Inicio, Ligas, Eventos y Configuración.
- Catálogo persistente de fechas y torneos independientes.
- Detalle de liga con Resumen, Fechas y Leaderboard separado.
- Cierre competitivo idempotente de liga e historial permanente.
- Configuración administrativa de eventos, rondas, logros y ligas.
- Un único flujo `+ Nuevo torneo` para fechas de liga e independientes.
- `AchievementConfig` por liga como default y snapshot independiente por torneo; ganar mesa vale 3 por defecto.
- Movimientos anulables de puntos especiales que afectan solo el Leaderboard de liga.
- Hall of Fame histórico por snapshots oficiales de campeón y fotos locales desacopladas.

### Sprint 5 — Integración Sheets
- Revisar Sheet real.
- Apps Script.
- Adaptador repository.
- Sincronización por lote.
- Recuperación de errores.

### Sprint 6 — Prueba en tienda
- Ejecutar una fecha real.
- Comparar con Sheets.
- Registrar fricciones/bugs.
- Definir Alpha 0.2 desde evidencia real.

---

## 24. Decisiones para Alpha 0.2 o posteriores

No implementar en Sprint 1 salvo petición explícita:
- historial persistente completo por jugador (el archivo de ligas, fechas y eventos de Alpha sí se conserva);
- cuentas;
- Área52 ID;
- ligas multi-TCG;
- sistema de socios;
- estadísticas;
- portal de jugadores.

---

## 25. Filosofía de cambios

Cuando exista duda:

1. Priorizar operación real de una fecha.
2. Priorizar menos pantallas.
3. Priorizar controles táctiles.
4. Mantener puntajes/logros/créditos como conceptos separados.
5. Mantener lógica de negocio fuera de componentes visuales.
6. Mantener almacenamiento reemplazable.
7. No añadir funciones fuera de alcance sin confirmación.
8. Preferir una solución simple y testeable a una arquitectura prematuramente compleja.

---

## 26. Navegación e historial de Alpha 0.1

### 26.1 Estructura global

- `Inicio` resume la liga activa y los eventos en curso.
- `Ligas` separa períodos activos y finalizados.
- El detalle de liga separa `Resumen`, `Fechas` y `Leaderboard`.
- `Eventos` contiene exclusivamente torneos independientes, separados en activos y completados.
- `Configuración` permite crear y modificar períodos de liga activos y finalizados mediante flujos administrativos seguros.
- `Hall of Fame` muestra los snapshots históricos de campeones oficiales de ligas finalizadas.

### 26.2 Fuente de verdad

- El ganador y top de una fecha se derivan del Standing confirmado del `Tournament`.
- El líder o campeón se deriva mediante `buildLeagueLeaderboard` usando únicamente fechas con el mismo `leaguePeriodId`.
- Los nombres y puntajes de ganadores no se guardan como única fuente de verdad.
- Al abrir cualquier fecha o evento se usa el mismo Tournament Manager existente.

### 26.3 Cierre de liga

- `Finalizar Liga` cierra la competencia únicamente cuando todas sus fechas están finalizadas.
- El cierre guarda `finishedAt`, congela el pozo mensual y su distribución oficial, y consolida movimientos `month_prize` de forma idempotente.
- Repetir el cierre no duplica premios.
- El estado competitivo finalizado no bloquea usos, anulaciones o ajustes posteriores de crédito.
- Una corrección deportiva posterior no modifica silenciosamente premios consolidados y activa `financialReviewRequired`.

### 26.4 Persistencia y migración

- El workspace local conserva todos los torneos y el estado de navegación.
- El snapshot anterior de torneo actual se migra y se incorpora al catálogo sin eliminar la clave antigua.
- Los torneos sin `type` se migran a `league_date` si tienen liga/premio automático y a `independent` en caso contrario.
- El ledger de liga incorpora movimientos de crédito y campos de cierre sin borrar períodos ni contribuciones existentes.

### 26.5 Migración de configuración y puntos especiales

- El schema local de torneo sube a versión 6, el workspace a versión 3 y el ledger de liga a versión 4.
- Torneos `setup` o `active` sin `AchievementConfig` adoptan el default actual (`win = 3`) y recalculan derivados conservando hechos.
- Torneos finalizados antiguos sin configuración reciben una configuración histórica inferida con `win = 1` y no recalculan totales silenciosamente.
- LeaguePeriod antiguos reciben fechas administrativas seguras y `defaultAchievementConfig` sin modificar las fechas ya creadas.
- El ledger incorpora `specialPointMovements`; cualquier valor especial histórico reconstruible se migra a un movimiento determinístico e idempotente.

### 26.6 Cierre, correcciones y revisión financiera

- El flujo normal de evento es `setup -> active -> rounds_completed -> finished`.
- Solo `finished` mueve una fecha o evento a los listados finalizados.
- Una liga finalizada puede reabrirse; registra `wasReopened` y `reopenedAt` y conserva `finishedAt`, fechas, snapshots y movimientos.
- Volver a finalizar una liga es idempotente y no duplica `month_prize`.
- Corregir resultados o puntos especiales reconstruye Standing/Leaderboard desde la fuente de verdad deportiva.
- `financialReviewRequired` muestra diferencias entre crédito consolidado y teórico; solo una
  confirmación administrativa explícita crea los ajustes positivos y negativos necesarios.
- La revisión solo se cierra mediante la acción explícita `Marcar revisión como resuelta`, que registra `financialReviewResolvedAt`.
- Todo impacto deportivo posterior registra `financialReviewLastImpactAt`, limpia la resolución previa
  y reactiva la revisión. Al recuperar datos, si existen puntos especiales o correcciones posteriores a
  `financialReviewResolvedAt`, la revisión vuelve a quedar requerida.

### 26.7 Migración competitiva

- Participantes existentes reciben `isGhost = false`.
- Torneos reciben `ghostPairingAuthorized = false` y `financialReviewRequired = false`.
- Rondas reciben `isCorrectionMode = false` y `wasEditedAfterFinish = false`.
- Ligas reciben `wasReopened = false` y `financialReviewRequired` compatible con el antiguo `reviewRequired`.
- La navegación migra Tournament `Leaderboard` a `Standing` y League `Standings` a `Leaderboard` sin perder la sección abierta.

### 26.8 Migración de auditoría financiera y desempates

- El schema del ledger de liga sube a versión 5.
- `LeaguePeriod` incorpora `financialReviewLastImpactAt` y el snapshot opcional
  `finalizedLeaderboardPlayerKeys` sin modificar ligas anteriores.
- `SpecialPointMovement` puede registrar `voidedAt` para detectar correcciones posteriores al cierre.
- Los respaldos versión 4 siguen siendo compatibles y conservan períodos, aportes, premios y movimientos.

### 26.9 Migración de estabilización previa a Sheets

- El schema local de torneo sube a versión 7, el workspace a versión 4 y el ledger de liga a versión 6.
- Se agrega la instantánea unificada `area52.commander-manager.app-state` versión 1 para guardar
  catálogo, navegación, identidades y finanzas en una sola operación local.
- `PlayerResult.rotating4/rotating5` migran a `false`; `AchievementConfig.rotating4/rotating5` siguen
  ausentes hasta que el evento los configure, por lo que no se recalculan históricos.
- Ligas antiguas reciben `defaultRotatingAchievements` con los tres rotativos históricos; las fechas
  ya creadas mantienen su propia lista.
- El workspace reconstruye `playerRegistry` desde participantes reales sin fusionar identidades de
  forma silenciosa.
- `CreditMovement.sourceReference` es opcional y permite importaciones idempotentes; movimientos
  anteriores permanecen intactos.
- Los porcentajes ya almacenados se conservan sin cambios y los editores permiten una cantidad
  variable de posiciones.

### 26.10 Migración de Hall of Fame

- El schema del ledger de liga sube a versión 7 e incorpora `championSnapshots` con default `[]`.
- Respaldos y snapshots de ledger versiones 1–6 siguen siendo compatibles; no se borran ligas,
  fechas, standings, movimientos de crédito, puntos especiales ni configuración existentes.
- El schema del workspace permanece en versión 4 porque `hall_of_fame` es una opción aditiva de
  navegación y los valores anteriores siguen siendo válidos.
- Las imágenes no forman parte del respaldo JSON ni de `localStorage`: solo se persiste
  `ChampionPhotoReference`; el archivo binario queda encapsulado en `ChampionPhotoStorage`.

### 26.11 Migración de emparejamiento

- El schema local de torneo sube a versión 8 y el workspace a versión 5.
- Los torneos y respaldos anteriores reciben `pairingMode = "balanced_random"` para conservar una
  operación segura y mejorar las rondas futuras sin modificar mesas históricas.
- Los snapshots de torneo versiones 1–7 y workspaces versiones 1–4 siguen siendo compatibles.

---

## 27. Hall of Fame

### 27.1 Fuente de verdad histórica

- El Hall of Fame contiene un `LeagueChampionSnapshot` por liga finalizada.
- Al finalizar oficialmente una liga se toma la posición 1 del Leaderboard final y se copian:
  nombre del jugador, nombre de liga, puntaje, logros, puntos especiales, victorias de mesa,
  eliminaciones y fechas jugadas.
- El cierre repetido es idempotente y no duplica el snapshot.
- El Jugador Fantasma se filtra explícitamente y nunca puede aparecer como campeón ni aportar
  estadísticas.
- Una liga histórica sin snapshot ofrece una acción administrativa para generarlo. Una revisión
  pendiente, un campeón indeterminable o un empate exacto sin orden oficial bloquean esa generación.

### 27.2 Correcciones posteriores

- Reabrir o corregir una liga no reemplaza automáticamente el campeón registrado.
- Si el líder teórico actual difiere del snapshot se muestra una advertencia con ambos nombres.
- El líder teórico se calcula mediante `buildTheoreticalLeagueLeaderboard`, sin imponer el orden
  histórico de `finalizedLeaderboardPlayerKeys`.
- Solo `Actualizar campeón oficial`, con confirmación explícita, reemplaza las estadísticas
  deportivas del snapshot.
- Un empate competitivo exacto sin resolución administrativa válida bloquea la actualización; el
  fallback alfabético nunca define silenciosamente un nuevo campeón oficial.
- Esta actualización no modifica `CreditMovement` ni resuelve revisiones financieras.
- Si cambia la identidad del campeón, la foto y metadata del campeón anterior no se asignan al
  nuevo: el staff decide si elimina el archivo local o lo conserva sin asociación.

### 27.3 Foto y metadata opcional

```ts
interface ChampionPhotoStorage {
  save(snapshotId: string, file: File): Promise<ChampionPhotoReference>;
  remove(reference: ChampionPhotoReference): Promise<void>;
  getPreview(reference: ChampionPhotoReference): Promise<string | null>;
}
```

- La implementación local usa IndexedDB y mantiene la UI desacoplada del almacenamiento futuro.
- Se aceptan JPEG, PNG y WebP de hasta 5 MB; existe vista previa antes de guardar.
- Los blobs/base64 grandes no se guardan en `localStorage`.
- La foto puede agregarse al cerrar la liga o después, reemplazarse y eliminarse.
- `commanderName`, `deckName` y `deckUrl` son metadata opcional del registro; editarlos no cambia
  Leaderboard, Standing, resultados ni crédito.
- Si no existen snapshots se muestra un estado vacío real, sin fixtures de producción.

---

## 28. Emparejamiento de Commander

### 28.1 Aleatorio equilibrado

- Mezcla los participantes reales activos y conserva la distribución válida de mesas de 3 o 4.
- Construye el historial de parejas que ya compartieron mesa y minimiza, en orden: cantidad de
  rematches, repetición reiterada de la misma pareja y carga individual de rivales repetidos.
- Los empates entre distribuciones equivalentes conservan el componente aleatorio.

### 28.2 Suizo multijugador

- La primera ronda usa el algoritmo aleatorio equilibrado.
- Desde la segunda ronda toma el Standing del Tournament actual como única fuente de puntaje.
- Prioriza evitar rematches; luego minimiza la dispersión de puntajes y posiciones dentro de cada
  mesa. Los jugadores pueden subir o bajar de grupo cuando sea necesario para formar mesas de 3/4.
- No usa resultados de otras fechas, puntos especiales de liga ni Leaderboard mensual.

### 28.3 Reglas comunes

- Ambos modos excluyen participantes DROP de las rondas futuras.
- El Jugador Fantasma no aporta puntaje ni historial competitivo; su ubicación prioriza rotar la
  exposición entre jugadores reales y solo se usa con exactamente cinco jugadores reales activos.
- Las mesas generadas siempre se pueden revisar e intercambiar manualmente antes de confirmarlas.
- El algoritmo vive en dominio, no en React, y nunca reescribe rondas ya creadas.
