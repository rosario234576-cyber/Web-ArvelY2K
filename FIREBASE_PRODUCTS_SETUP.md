# Activar el panel de productos

El panel está en:

`https://rosario234576-cyber.github.io/Web-ArvelY2K/admin-productos.html`

No utiliza `service_role`, claves privadas ni Firebase Admin en el navegador.

## 1. Crear Firestore

1. Abrí Firebase Console → **Bases de datos y almacenamiento** → **Firestore Database**.
2. Elegí **Crear base de datos**.
3. Seleccioná **modo Producción** y una región cercana.
4. Entrá en la pestaña **Reglas**.
5. Copiá todo el contenido de `firebase-firestore.rules`.
6. Presioná **Publicar**.

## 2. Autorizar tu cuenta administradora

1. Iniciá sesión en la web con tu cuenta administrativa.
2. Abrí `admin-productos.html`.
3. La pantalla mostrará el **UID** de tu usuario. Copialo.
4. En Firestore, elegí **Iniciar colección**.
5. Nombre de colección: `admins`.
6. ID del documento: pegá exactamente tu UID.
7. Agregá un campo:
   - Nombre: `role`
   - Tipo: string
   - Valor: `admin`
8. Guardá y actualizá el panel.

No uses el correo electrónico como ID del documento. Usá el UID completo.

## 3. Fotografías sin activar facturación

Firebase Storage exige vincular una cuenta de facturación, por lo que esta
versión no lo necesita.

1. Subí las fotografías a `assets/images/productos` dentro del repositorio.
2. En el formulario escribí una ruta por línea, por ejemplo:
   `assets/images/productos/denim-orbit-1.jpg`
3. Usá **Previsualizar fotografías** para comprobarlas.

## 4. Uso cotidiano

1. Abrí el panel e iniciá sesión.
2. Elegí **Nuevo**.
3. Completá los datos.
4. Agregá una fila por combinación de talle y color.
5. Pegá las rutas de las fotografías.
6. Usá **Guardar borrador** si la publicación todavía está incompleta.
7. Cambiá el estado a **Publicado** y guardá para mostrarla en Shop.

La tienda consulta solamente documentos con `status = "published"`. Si Firebase
no estuviera disponible, mantiene el catálogo local actual como respaldo.

## Archivos que deben subirse a GitHub

- `admin-productos.html`
- `css/admin-productos.css`
- `js/admin-productos.js`
- `js/firebase-products.js`
- `js/firebase-config.js`
- `js/tienda.js`
- `js/producto.js`
- `tienda.html`
- `producto.html`
- `firebase-firestore.rules`

El archivo de reglas de Firestore es documentación para copiar en Firebase;
GitHub Pages no lo ejecuta.
