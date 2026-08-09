-- Row Level Security en modo deny-all sobre TODAS las tablas del esquema.
--
-- Migración escrita a mano (drizzle-kit no la genera): activar RLS sin declarar ninguna policy
-- deja las tablas inaccesibles para cualquier rol que no las posea ni tenga BYPASSRLS. Es decir,
-- las claves `anon` y `authenticated` de Supabase no pueden leer ni escribir NADA, ni siquiera si
-- alguien filtrara la anon key en el navegador.
--
-- El servidor de la aplicación se conecta con la conexión directa de `DATABASE_URL` (rol dueño /
-- `postgres`, que no está sujeto a RLS) y hace la autorización por rol en código, como define
-- `docs/architecture.md` §4.3. Cuando alguna fase futura necesite acceso desde el navegador,
-- se añadirán policies explícitas en una migración nueva.
--
-- Deliberadamente NO se usa `FORCE ROW LEVEL SECURITY`: eso dejaría también al dueño de la tabla
-- sin acceso y, sin policies, la aplicación no podría leer sus propios datos.

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "students" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subjects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "groups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "enrollments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "schedules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "class_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "devices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rfid_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "attendances" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "attendance_corrections" ENABLE ROW LEVEL SECURITY;
