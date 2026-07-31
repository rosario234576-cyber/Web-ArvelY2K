# Activar registro e inicio de sesión con Firebase

La web ya incluye registro, inicio de sesión, cierre de sesión, recuperación de
contraseña y verificación de correo. Para activarlos:

## 1. Crear y registrar la aplicación web

1. Entrá en https://console.firebase.google.com/
2. Creá un proyecto nuevo.
3. En la portada del proyecto, elegí el ícono Web `</>`.
4. Registrá una aplicación llamada `Arvel Web`.
5. Firebase mostrará un objeto `firebaseConfig`.

## 2. Colocar la configuración pública

Abrí `js/firebase-config.js` y reemplazá los cuatro valores:

```js
export const firebaseConfig = Object.freeze({
  apiKey: "TU_API_KEY",
  authDomain: "TU_PROJECT_ID.firebaseapp.com",
  projectId: "TU_PROJECT_ID",
  appId: "TU_APP_ID"
});
```

Esta configuración identifica la aplicación web y no contiene una contraseña
administrativa. No agregues claves privadas, cuentas de servicio ni archivos
JSON de Firebase Admin al repositorio.

## 3. Habilitar Email/Password

1. Firebase Console → Authentication.
2. Seleccioná `Get started`.
3. Entrá en `Sign-in method`.
4. Abrí `Email/Password`.
5. Activá `Email/Password` y guardá.

No es necesario habilitar `Email link`.

## 4. Autorizar GitHub Pages

En Authentication → Settings → Authorized domains agregá el dominio desde el
que se publica la web, sin `https://` ni rutas.

Ejemplo:

```text
TU-USUARIO.github.io
```

Si usás un dominio propio, agregalo también. `localhost` puede conservarse para
pruebas locales servidas mediante un servidor web.

## 5. Configurar seguridad

En Authentication → Settings:

- establecé una política de contraseña de al menos 8 caracteres;
- recomendá mayúscula, minúscula, número y símbolo;
- revisá límites y protección contra abuso;
- activá protección contra enumeración de correos desde Google Cloud Identity
  Platform si está disponible para el proyecto.

## 6. Personalizar correos

En Authentication → Templates personalizá:

- verificación de dirección de correo;
- restablecimiento de contraseña;

Configurá el nombre visible `Arvel Customs` y verificá el dominio de envío
cuando Firebase lo solicite.

## 7. Probar después de publicar

1. Abrí `registro.html`.
2. Creá una cuenta de prueba.
3. Confirmá que llegue el correo de verificación.
4. Cerrá la sesión.
5. Probá `login.html`.
6. Probá `Olvidé mi contraseña`.
7. Confirmá que el header cambie de `Ingresar` a `Mi cuenta`.

No pruebes Firebase Authentication abriendo los HTML mediante `file://`. Usá la
URL publicada de GitHub Pages o un servidor local.
