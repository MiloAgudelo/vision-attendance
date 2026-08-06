# vision-attendance

Sistema de registro de asistencia mediante RFID para la **Institución Universitaria Visión de las
Américas**. Los estudiantes acercan su carnet RFID a un lector al entrar a clase y el sistema
registra la hora de entrada, la asocia a la sesión correspondiente y la muestra en vivo en una
aplicación web.

> Documentación normativa en [`docs/`](docs/): alcance, arquitectura, modelo de datos, contrato del
> dispositivo y playbook de agentes.

## Requisitos

- Node.js >= 22
- pnpm 11.18.0 (`corepack enable` o instalación global)

No hace falta Docker: la base de datos local es un PostgreSQL 17 embebido.

## Arranque

```bash
pnpm install
cp .env.example .env
```

## Estructura del monorepo

```
apps/web         aplicación Next.js (UI en español + API)
packages/shared  @va/shared — tipos, enums y contrato del dispositivo (paquete hoja)
packages/db      @va/db — esquema Drizzle, migraciones y cliente
tools/simulator  @va/simulator — CLI simulador del ESP32
firmware/        ESP32 + RC522 (track paralelo, fuera del grafo de pnpm)
```

## Scripts de la raíz

| Script            | Qué hace                                     |
| ----------------- | -------------------------------------------- |
| `pnpm dev`        | Levanta la aplicación web en modo desarrollo |
| `pnpm build`      | Compila todos los paquetes                   |
| `pnpm lint`       | ESLint sobre el repositorio                  |
| `pnpm typecheck`  | TypeScript en modo estricto                  |
| `pnpm test`       | Pruebas de todos los paquetes                |
| `pnpm db:up`      | Arranca la base de datos local               |
| `pnpm db:down`    | Detiene la base de datos local               |
| `pnpm db:migrate` | Aplica las migraciones                       |
| `pnpm db:seed`    | Carga datos de desarrollo                    |
| `pnpm db:reset`   | Recrea la base desde cero                    |

_Este README se completa en la fase de fundaciones a medida que aparecen los paquetes._
