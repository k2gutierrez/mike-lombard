# Manual de administración · Mike Lombard

Guía corta para mantener el portafolio sin tocar código.

## 1. Entrar

1. Abre `https://TU-DOMINIO/admin` (en local, `http://localhost:3000/admin`).
2. Escribe tu correo y pulsa **Continue**.
3. Si tu correo está autorizado, entras directamente. Si no llega nada, avisa:
   significa que tu correo aún no está en la lista de administradores.

Arriba siempre ves dos indicadores:

- **Live backend** → estás trabajando contra Supabase de verdad.
- **Demo mode** → no hay backend configurado; lo que hagas se pierde al recargar.

## 2. Las dos ideas que hay que entender

**Borrador y publicado.** Guardar *no* publica. Puedes guardar todo lo que
quieras y nadie lo verá hasta que pulses **Publish**.

- **Save draft** → guarda tu trabajo en privado.
- **Publish** → publica de golpe todo lo que estaba en borrador.
- **Revert** → descarta los cambios no publicados y vuelve a la última versión
  publicada. No borra nada.
- **Preview** → abre la web con tus borradores incluidos, en otra pestaña.
  Solo tú puedes verlo.

**Todo se guarda en Supabase.** No hay archivos que editar ni código que tocar.
También hay historial de cambios (quién hizo qué y cuándo).

## 3. Publicar una obra

1. Pestaña **Works** → **New**.
2. Rellena **Title** (obligatorio). El **Slug** es la dirección web
   (`/works/mi-obra`); si lo dejas vacío se genera solo.
3. Añade **Year**, **Category** (texto libre, se usa para los filtros; sé
   constante: `illustration`, `character`, `process`, `collaboration`),
   **Subtitle**, **Client**, **Location** y un **External link** si aplica.
4. **Excerpt** es la frase que aparece en las tarjetas y en las vistas previas
   al compartir el enlace. **Description** es el texto largo: deja una **línea en
   blanco** entre párrafos.
5. **Save draft**. A partir de aquí ya puedes subir archivos.
6. En **Project media**, pulsa **Add files** y elige varias imágenes y vídeos a
   la vez. Verás una barra de progreso por archivo; si uno falla, el motivo
   aparece al lado (tamaño o formato).
7. Arrastra las miniaturas por el asa `⋮⋮` para ordenarlas. El orden es el que
   verá el público.
8. Pulsa la **estrella** de la imagen que quieras como portada.
9. **Edit** en cada archivo para cambiar el **texto alternativo** (importante
   para accesibilidad), el **pie de foto** y el **año**.
10. **Save draft** y luego **Publish** cuando la obra esté lista.

Para quitar una obra: selecciónala y pulsa el icono de papelera. Se borran
también sus archivos. Confirmación previa, pero no se puede deshacer.

## 4. La sección de NFTs

Pestaña **NFTs**. Sirve para mostrar obra digital.

- **Arriba**: el título, el antetítulo y el texto de introducción de la sección.
- **Pieces**: cada pieza lleva **título**, **imagen**, descripción, año, edición
  (por ejemplo `1/1`) y un enlace opcional. Se ordenan con ↑ ↓ y se borran con
  **Remove**.
- **Abajo**: sube aquí las imágenes y luego elígelas en cada pieza.

Aparece en la portada (las tres primeras) y en su propia página, `/nfts`.

**No añadas precio, dirección de contrato ni fecha de mint** hasta que sean
reales. La sección no promete nada por sí sola.

## 5. Cambiar la portada y el vídeo de inicio

Pestaña **Landing & featured**.

- **Hero artwork**: sube primero una **imagen** (se usa como póster) y, si
  quieres, un **vídeo**. Los vídeos se reproducen **sin sonido y en bucle**, así
  que no deben depender del audio.
- En **Hero media** elige qué se ve de fondo; en **Hero poster**, la imagen fija
  que aparece antes de que arranque el vídeo.
- Ahí mismo editas el título, el subtítulo, los botones y las etiquetas.
- **Selected works**: marca hasta 4 obras y ordena con ↑ ↓. Ese es el orden de la
  portada.

## 6. Biografía, trayectoria y mint

- **Biography**: dos imágenes independientes — **Photo of the artist** (su foto)
  y **One of his works** (una obra). Además: historia, sección de visión, sección
  de colaboraciones, datos clave y enlaces. Si todavía no hay datos verificados,
  deja las listas vacías: es mejor una página honesta que una inventada.
- **Career**: **New entry** por cada hito. Solo aparecen en la web las entradas
  marcadas como **Published**. Arrastra para ordenar.
- **Mint**: textos de la página de registro. **No añadas precio, contrato ni
  fecha** hasta que sean reales y estén aprobados.

## 7. Registros del mint

Pestaña **Registrations**: lista privada de correos y wallets, con buscador y
botón **Export CSV** para abrirlo en Excel o Sheets.

Cosas importantes:

- Solo los administradores pueden verla. Nunca es pública.
- Una dirección de wallet introducida o conectada **no demuestra propiedad**.
  La columna lo indica como *unverified*.
- Se guarda la fecha exacta y el texto de consentimiento que aceptó cada
  persona.
- El formulario avisa claramente de que registra interés y **no garantiza
  asignación**. Nunca pide pagos, aprobaciones ni transacciones.

## 8. Cuando algo no sale bien

| Mensaje | Qué significa |
| --- | --- |
| *That file is larger than the 20 MB limit* | Imagen demasiado grande. Exporta a WebP o reduce resolución. |
| *Unrecognised file* | El archivo no es realmente JPEG/PNG/WebP/AVIF/GIF/MP4/WebM/MOV. |
| *Storage rejected the file* | Formato o tamaño fuera de la política del bucket. |
| *Not authorized* | La sesión caducó: vuelve a entrar en `/admin/login`. |
| *File missing* en una miniatura | El archivo no está en el servidor aunque el registro sí. Borra esa entrada y vuélvela a subir. |
| *value out of range for type integer* | Corregido en octubre de 2026. Si reaparece, avisa. |
| *Demo mode* | No hay backend configurado; avisa antes de trabajar en serio. |
| *Too many attempts* | Límite de intentos de acceso. Espera unos minutos. |

## 9. Antes de lanzar

1. Revisa que ningún texto siga diciendo "provisional".
2. Cuando el artista apruebe todos los textos, desmarca **Provisional flag** en
   la pestaña **Biography** y publica. Eso quita el aviso de la portada y permite
   que los buscadores indexen el sitio.
3. Revisa tu propia ficha en **Registrations** para comprobar que todo funciona,
   y borra esa fila de prueba si quieres hacerlo desde Supabase.
