# Documento inicial de alcance  
## Sistema de registro de asistencia mediante RFID  
**Institución Universitaria Visión de las Américas**

## 1. Descripción general

El proyecto consiste en diseñar e implementar un sistema de registro de asistencia basado en los carnets RFID utilizados por la Institución Universitaria Visión de las Américas.

El sistema permitirá que estudiantes y, posteriormente, profesores registren su ingreso mediante la lectura de su carnet institucional. La información se enviará automáticamente desde un dispositivo físico conectado a internet hacia una plataforma web, en la cual se podrán consultar, administrar y analizar los registros.

El desarrollo inicial se realizará en el contexto de la asignatura **Laboratorio de Desarrollo**.

---

## 2. Problema identificado

Actualmente, el control de asistencia puede requerir procesos manuales como llamados a lista, registros escritos o firmas de ingreso. Estos métodos pueden generar:

- Pérdida de tiempo durante las clases.
- Errores en el registro de asistencia.
- Dificultad para verificar la hora exacta de llegada.
- Información dispersa o difícil de consultar.
- Posibilidad de registros duplicados o inconsistentes.
- Procesos administrativos adicionales para profesores y personal universitario.

El sistema propuesto busca automatizar este proceso utilizando la infraestructura RFID ya presente en los carnets institucionales.

---

## 3. Objetivo general

Construir un sistema de hardware y software que permita registrar automáticamente la asistencia y la hora de ingreso de estudiantes y profesores mediante la lectura de sus carnets RFID.

---

## 4. Objetivos específicos

1. Conectar un lector RFID a un microcontrolador con acceso a internet.
2. Leer el identificador RFID de los carnets institucionales.
3. Enviar cada lectura a una plataforma en la nube mediante Wi-Fi.
4. Asociar cada identificador RFID con un estudiante o profesor.
5. Registrar la fecha y hora exacta de cada ingreso.
6. Permitir la consulta de los registros desde una aplicación web.
7. Administrar materias, grupos, horarios, usuarios y dispositivos.
8. Generar una base técnica que permita escalar el sistema a toda la institución.

---

## 5. Alcance inicial: producto mínimo viable

La primera versión del sistema estará enfocada exclusivamente en la materia **Laboratorio de Desarrollo**.

### Funcionalidades del MVP

El sistema deberá permitir:

- Registrar estudiantes.
- Asociar el código RFID de cada carnet con un estudiante.
- Crear o configurar la materia Laboratorio de Desarrollo.
- Registrar los horarios de la materia.
- Leer el carnet mediante un dispositivo RFID.
- Enviar la lectura desde el dispositivo hacia la plataforma.
- Registrar:
  - Estudiante.
  - Materia.
  - Fecha.
  - Hora de ingreso.
  - Dispositivo utilizado.
  - Estado del registro.
- Consultar la lista de asistencia por sesión de clase.
- Identificar estudiantes presentes, ausentes y con llegada tardía.
- Evitar registros duplicados dentro de una misma sesión.
- Permitir correcciones manuales realizadas por un usuario autorizado.
- Visualizar un historial de asistencias.

### Fuera del alcance inicial

La primera versión no contempla necesariamente:

- Control de acceso físico mediante puertas o cerraduras.
- Reconocimiento facial.
- Aplicaciones móviles nativas.
- Integración inmediata con los sistemas académicos de la universidad.
- Registro de asistencia para todas las materias.
- Registro institucional de profesores.
- Nómina o liquidación de horas trabajadas.
- Instalación masiva de dispositivos.

Estas funcionalidades podrán evaluarse en fases posteriores.

---

## 6. Alcance futuro

Después de validar el sistema en Laboratorio de Desarrollo, se propone ampliar progresivamente su uso.

### Segunda fase: múltiples materias

- Creación de diferentes materias y grupos.
- Asignación de profesores a cada materia.
- Configuración de salones y horarios.
- Registro de asistencia de estudiantes en distintas clases.
- Panel individual para cada profesor.
- Reportes por estudiante, materia, grupo y periodo académico.

### Tercera fase: registro de profesores

El sistema permitirá que los profesores registren su presencia mediante el carnet RFID al iniciar cada clase.

Este modelo reemplazaría o complementaría la firma manual de asistencia y permitiría registrar:

- Profesor.
- Materia.
- Grupo.
- Salón.
- Hora programada.
- Hora real de llegada.
- Duración estimada de la clase.
- Incumplimientos, retrasos o inconsistencias.

El objetivo no sería registrar únicamente la entrada del profesor a la universidad, sino verificar su presencia dentro del contexto de una clase programada.

### Cuarta fase: despliegue institucional

- Instalación de dispositivos en múltiples salones.
- Administración centralizada de dispositivos.
- Integración con el sistema académico institucional.
- Importación automática de estudiantes, profesores, materias y horarios.
- Reportes administrativos.
- Alertas por fallos en dispositivos o ausencias.
- Auditoría de modificaciones.
- Gestión de periodos académicos.

---

## 7. Usuarios del sistema

### Administrador

Podrá:

- Gestionar estudiantes y profesores.
- Asociar carnets RFID.
- Crear materias, grupos, salones y horarios.
- Registrar dispositivos.
- Consultar todos los registros.
- Corregir inconsistencias.
- Consultar reportes.
- Gestionar permisos.

### Profesor

Podrá:

- Consultar sus materias.
- Visualizar la asistencia de sus estudiantes.
- Revisar las horas de llegada.
- Marcar o justificar novedades.
- Exportar reportes.
- Consultar su propio historial de clases, en fases posteriores.

### Estudiante

Inicialmente, el estudiante únicamente interactuará con el lector RFID. En una fase posterior podría acceder a un portal para consultar su historial de asistencia.

---

## 8. Flujo principal de funcionamiento

1. El administrador registra al estudiante en la plataforma.
2. Se asocia el identificador RFID de su carnet con su perfil.
3. El administrador configura la materia, el grupo y el horario.
4. Al ingresar a clase, el estudiante acerca su carnet al lector RFID.
5. El lector obtiene el identificador del carnet.
6. El ESP32 envía el identificador, el dispositivo y la fecha de lectura al servicio en la nube.
7. El backend verifica:
   - Que el dispositivo esté autorizado.
   - Que el carnet esté registrado.
   - Que exista una clase activa.
   - Que el estudiante pertenezca al grupo.
   - Que no exista un registro duplicado.
8. El sistema almacena la asistencia.
9. El dispositivo muestra una respuesta visual o sonora.
10. El profesor consulta la información desde la aplicación web.

---

## 9. Comportamiento esperado del dispositivo

El dispositivo deberá ofrecer una respuesta inmediata después de leer el carnet.

### Lectura exitosa

- Luz verde.
- Sonido corto de confirmación.
- Mensaje opcional en pantalla: “Asistencia registrada”.

### Carnet no reconocido

- Luz roja.
- Sonido de error.
- Mensaje opcional: “Carnet no registrado”.

### Registro duplicado

- Luz amarilla.
- Mensaje opcional: “Asistencia registrada previamente”.

### Error de conexión

- Indicación visual de fallo.
- Reintento automático.
- Almacenamiento temporal local, si se implementa funcionamiento sin conexión.

---

## 10. Arquitectura técnica propuesta

### Hardware

Para el MVP se recomienda utilizar:

- ESP32.
- Lector RFID compatible con los carnets institucionales.
- Indicadores LED.
- Buzzer.
- Pantalla pequeña opcional.
- Fuente de alimentación.
- Caja o carcasa para proteger el dispositivo.

El **ESP32** es preferible frente a un Arduino tradicional porque incorpora conectividad Wi-Fi y ofrece mejores capacidades para comunicarse directamente con servicios web.

Antes de seleccionar definitivamente el lector RFID, será necesario identificar la tecnología exacta de los carnets institucionales, por ejemplo:

- Frecuencia utilizada.
- Tipo de tarjeta.
- Estándar RFID.
- Compatibilidad con lectores como RC522, PN532 u otros.
- Posibilidad técnica y legal de leer el identificador requerido.

### Aplicación web

Tecnologías sugeridas:

- Next.js.
- TypeScript.
- React.
- Tailwind CSS o una biblioteca de componentes.
- Autenticación por roles.
- Panel administrativo.
- Panel para profesores.
- API para recibir eventos desde los dispositivos.

### Plataforma en la nube

Para el MVP se propone utilizar **Firebase**, principalmente por la rapidez de implementación y su facilidad para construir una aplicación con autenticación, almacenamiento en la nube y actualizaciones en tiempo real.

Servicios posibles:

- Firebase Authentication.
- Cloud Firestore.
- Cloud Functions.
- Firebase Hosting o despliegue externo de Next.js.
- Firebase App Check, cuando aplique.
- Reglas de seguridad de Firestore.

Sin embargo, la arquitectura deberá evitar que el ESP32 escriba directamente y sin validación en la base de datos. El dispositivo debería comunicarse con una API o función segura que valide cada solicitud.

### Firebase frente a Supabase

Firebase es una buena opción para la primera versión cuando la prioridad es:

- Construir rápidamente.
- Recibir datos en tiempo real.
- Reducir la configuración inicial.
- Integrar autenticación y servicios administrados.

Supabase puede ser más conveniente cuando la prioridad es:

- Utilizar una base de datos relacional PostgreSQL.
- Generar consultas y reportes académicos complejos.
- Relacionar estudiantes, materias, profesores, grupos, horarios y asistencias.
- Mantener mayor control sobre el modelo de datos.

Para este proyecto, la recomendación inicial es:

> Utilizar Firebase para desarrollar y validar el MVP, pero mantener una capa de servicios y repositorios que evite acoplar toda la aplicación directamente a Firestore.

De esta manera, una migración futura hacia Supabase o PostgreSQL será más manejable si el sistema crece y requiere reportes institucionales más complejos.

---

## 11. Modelo de datos conceptual

### Usuario

- Identificador.
- Nombre.
- Correo.
- Rol.
- Estado.
- Fecha de creación.

### Estudiante

- Identificador.
- Código estudiantil.
- Nombre.
- Correo.
- Programa académico.
- Identificador RFID.
- Estado.

### Profesor

- Identificador.
- Código institucional.
- Nombre.
- Correo.
- Identificador RFID.
- Estado.

### Materia

- Identificador.
- Código.
- Nombre.
- Descripción.

### Grupo

- Identificador.
- Materia.
- Profesor.
- Periodo académico.
- Salón.
- Estado.

### Horario

- Identificador.
- Grupo.
- Día de la semana.
- Hora de inicio.
- Hora de finalización.
- Salón.

### Sesión de clase

- Identificador.
- Grupo.
- Fecha.
- Hora programada de inicio.
- Hora programada de finalización.
- Estado.

### Asistencia

- Identificador.
- Estudiante.
- Sesión.
- Fecha y hora de lectura.
- Estado de asistencia.
- Dispositivo.
- Origen del registro.
- Observaciones.
- Usuario que realizó una corrección, cuando aplique.

### Dispositivo

- Identificador.
- Nombre.
- Salón asignado.
- Clave o credencial.
- Estado.
- Última conexión.
- Versión de firmware.

### Evento RFID

- Identificador RFID leído.
- Fecha y hora de recepción.
- Dispositivo.
- Resultado de validación.
- Mensaje de respuesta.

---

## 12. Estados de asistencia sugeridos

- Presente.
- Tarde.
- Ausente.
- Justificado.
- Registro manual.
- Registro inválido.
- Pendiente de revisión.

La hora límite para determinar una llegada tardía deberá ser configurable por materia o por sesión.

---

## 13. Seguridad

El sistema manejará información académica y de identificación, por lo cual deberá contemplar:

- Autenticación de usuarios.
- Autorización basada en roles.
- Credenciales únicas por dispositivo.
- Comunicación mediante HTTPS.
- Validación de todas las solicitudes.
- Protección contra registros duplicados.
- Registro de auditoría.
- Restricción del acceso a información sensible.
- Rotación o revocación de credenciales de dispositivos.
- Copias de seguridad.
- Políticas de retención de información.
- Cumplimiento de las políticas institucionales de tratamiento de datos.

El identificador RFID no deberá considerarse por sí solo una credencial completamente segura, ya que podría ser copiado dependiendo del tipo de tarjeta. Para el alcance inicial será utilizado como mecanismo de identificación, pero deberán evaluarse medidas adicionales para escenarios institucionales.

---

## 14. Funcionamiento sin conexión

Aunque el MVP podría comenzar requiriendo conexión Wi-Fi permanente, es recomendable considerar un mecanismo básico de tolerancia a fallos.

En caso de pérdida de conexión, el ESP32 podría:

1. Guardar temporalmente las lecturas.
2. Marcar cada lectura con una fecha y hora local.
3. Reintentar el envío cuando regrese la conexión.
4. Evitar enviar el mismo evento varias veces.
5. Informar visualmente que el registro está pendiente de sincronización.

Para esto, el dispositivo deberá contar con una estrategia confiable de sincronización de hora, por ejemplo mediante NTP, y posiblemente un reloj de tiempo real en versiones posteriores.

---

## 15. Estructura propuesta del monorepo

El proyecto se desarrollará en un monorepo administrado con **pnpm workspaces**.

```text
attendance-system/
├── apps/
│   ├── web/
│   │   └── Aplicación web desarrollada con Next.js
│   └── api/
│       └── API independiente, si se decide separarla de Next.js
│
├── firmware/
│   └── esp32-rfid-reader/
│       ├── src/
│       ├── include/
│       ├── platformio.ini
│       └── README.md
│
├── packages/
│   ├── shared-types/
│   │   └── Tipos y contratos compartidos
│   ├── validation/
│   │   └── Esquemas de validación
│   ├── database/
│   │   └── Acceso y abstracción de datos
│   ├── ui/
│   │   └── Componentes visuales compartidos
│   └── config/
│       └── Configuraciones compartidas
│
├── docs/
│   ├── architecture/
│   ├── hardware/
│   ├── api/
│   ├── requirements/
│   └── decisions/
│
├── tooling/
│   ├── eslint/
│   ├── typescript/
│   └── scripts/
│
├── pnpm-workspace.yaml
├── package.json
├── README.md
└── .gitignore
```

El firmware del ESP32 puede mantenerse dentro del mismo repositorio, aunque no sea administrado directamente como un paquete de Node.js. Para el firmware se recomienda evaluar PlatformIO, ya que permite organizar dependencias, entornos y compilaciones de manera más estructurada.

---

## 16. Contrato básico de comunicación

El ESP32 podría enviar una solicitud similar a la siguiente:

```json
{
  "deviceId": "LAB-DESARROLLO-01",
  "cardUid": "A1B2C3D4",
  "scannedAt": "2026-08-06T15:30:00Z",
  "eventId": "uuid-generado-por-el-dispositivo"
}
```

La plataforma respondería:

```json
{
  "success": true,
  "status": "PRESENT",
  "message": "Asistencia registrada",
  "student": {
    "id": "student-id",
    "name": "Nombre del estudiante"
  }
}
```

Cada evento deberá tener un identificador único para garantizar idempotencia y prevenir duplicados durante los reintentos.

---

## 17. Requisitos no funcionales

El sistema deberá buscar:

- Responder rápidamente después de una lectura.
- Mantener trazabilidad de todos los registros.
- Ser fácil de utilizar.
- Poder instalarse en diferentes salones.
- Permitir la incorporación de nuevos dispositivos.
- Mantener una arquitectura modular.
- Permitir cambios futuros en la base de datos.
- Proteger la información académica.
- Facilitar las pruebas del hardware y del software.
- Contar con documentación técnica y funcional.

---

## 18. Criterios de éxito del MVP

El MVP se considerará exitoso cuando:

1. El lector reconozca correctamente los carnets seleccionados para la prueba.
2. El ESP32 pueda conectarse a la red Wi-Fi.
3. Cada lectura válida llegue a la plataforma.
4. El sistema asocie correctamente el carnet con un estudiante.
5. La fecha y la hora queden registradas.
6. El profesor pueda consultar la asistencia desde la aplicación web.
7. Los registros duplicados sean controlados.
8. Los errores de conexión y los carnets desconocidos sean identificados.
9. El sistema pueda utilizarse en una sesión real de Laboratorio de Desarrollo.
10. La información registrada pueda exportarse o consultarse posteriormente.

---

## 19. Riesgos iniciales

### Compatibilidad de los carnets

Los carnets podrían utilizar una tecnología no compatible con los lectores RFID económicos considerados inicialmente.

**Mitigación:** realizar una prueba técnica con varios carnets antes de comprar o diseñar el hardware definitivo.

### Dependencia de la red Wi-Fi

Una conexión inestable podría impedir el registro inmediato.

**Mitigación:** implementar reintentos y almacenamiento temporal.

### Suplantación de asistencia

Un estudiante podría entregar su carnet a otra persona.

**Mitigación:** aceptar este riesgo en el MVP y evaluar posteriormente validaciones adicionales.

### Duplicidad de registros

El dispositivo podría repetir una solicitud durante un fallo de conexión.

**Mitigación:** utilizar identificadores únicos e idempotencia en la API.

### Escalabilidad del modelo de datos

Una estructura pensada únicamente para una materia podría dificultar la expansión.

**Mitigación:** diseñar desde el inicio las entidades de materia, grupo, sesión, usuario y dispositivo, aunque el MVP solo utilice una materia.

### Seguridad de las credenciales

Una clave almacenada en el firmware podría quedar expuesta.

**Mitigación:** utilizar credenciales por dispositivo, rotación de claves y permisos limitados.

---

## 20. Decisiones pendientes

Antes de comenzar la implementación deberán confirmarse los siguientes puntos:

1. Tecnología exacta utilizada por los carnets institucionales.
2. Modelo de lector RFID compatible.
3. Acceso a una red Wi-Fi institucional.
4. Restricciones para conectar dispositivos a dicha red.
5. Fuente oficial para obtener la información de estudiantes.
6. Forma de asociar inicialmente cada carnet con un estudiante.
7. Tolerancia permitida para considerar una llegada tardía.
8. Tratamiento de estudiantes que escaneen antes o después de la clase.
9. Usuarios que podrán modificar una asistencia.
10. Necesidad de exportar información a Excel, CSV o PDF.
11. Política institucional para el tratamiento de datos.
12. Plataforma definitiva para el MVP: Firebase o Supabase.
13. Ubicación física del dispositivo durante la prueba.
14. Necesidad de una pantalla en el lector.
15. Requerimiento de funcionamiento sin conexión para la primera versión.

---

## 21. Recomendación de implementación inicial

Para reducir riesgos, el proyecto puede comenzar con la siguiente combinación:

- ESP32.
- Lector RFID definido después de probar los carnets.
- PlatformIO para el firmware.
- Next.js y TypeScript para la aplicación web.
- Firebase Authentication.
- Cloud Firestore.
- Cloud Functions o una API segura en Next.js.
- pnpm workspaces para el monorepo.
- Validación de datos mediante esquemas compartidos.
- Registro de eventos con identificadores únicos.
- Despliegue inicial en un único salón.
- Prueba piloto con los estudiantes de Laboratorio de Desarrollo.

La primera meta técnica debe ser completar un flujo vertical:

> Escanear un carnet real, enviar la lectura desde el ESP32, validarla en el backend, almacenarla y visualizarla en la aplicación web.

Después de validar este flujo, se podrán agregar autenticación, administración de usuarios, sesiones de clase, reportes y funcionamiento sin conexión.

---

## 22. Intención del proyecto

La intención del proyecto es demostrar que la tecnología RFID ya incorporada en los carnets institucionales puede aprovecharse para automatizar y mejorar los procesos de registro de asistencia.

El sistema comenzará como una solución académica para una materia, pero será diseñado con una arquitectura que permita evolucionar hacia una plataforma institucional para estudiantes y profesores.

El resultado esperado es una solución modular, segura y escalable que reduzca procesos manuales, permita conocer las horas reales de ingreso y proporcione información confiable para profesores y personal administrativo.