# Cali Motors Backend

API REST para Cali Motors, un marketplace de compra y venta de vehículos. Este backend gestiona autenticación, usuarios, publicaciones de vehículos y documentación Swagger.

## Tabla De Contenido

- [Descripción](#descripción)
- [Tecnologías](#tecnologías)
- [Estructura Del Proyecto](#estructura-del-proyecto)
- [Requisitos Previos](#requisitos-previos)
- [Variables De Entorno](#variables-de-entorno)
- [Instalación](#instalación)
- [Ejecución Local](#ejecución-local)
- [Endpoints Principales](#endpoints-principales)
- [Documentación Swagger](#documentación-swagger)
- [Relación Con El Frontend](#relación-con-el-frontend)
- [Notas Importantes](#notas-importantes)

## Descripción

El backend expone servicios para:

- Registro e inicio de sesión de usuarios.
- Autenticación con JWT.
- Consulta, creación, edición y eliminación de usuarios.
- Publicación, consulta, edición y eliminación de vehículos.
- Asociación de vehículos con usuarios vendedores.
- Documentación interactiva mediante Swagger.

## Tecnologías

- Node.js
- Express
- PostgreSQL
- pg
- bcrypt
- jsonwebtoken
- dotenv
- cors
- swagger-ui-express
- nodemon

## Estructura Del Proyecto

```txt
Cali_Motors_Back/
├── api/
│   ├── index.js          # Configuración principal de Express y rutas
│   └── swagger.json      # Documentación Swagger
├── index.js              # Punto de arranque del servidor
├── package.json
├── package-lock.json
├── .env                  # Variables locales, no subir con secretos reales
└── README.md
```

> Importante: el frontend está en otro repositorio/carpeta y no debe subirse dentro del repositorio del backend.

## Requisitos Previos

Antes de iniciar, asegúrate de tener instalado:

- Node.js 18 o superior.
- npm.
- Una base de datos PostgreSQL disponible.
- Variables de entorno configuradas.

## Variables De Entorno

Crea un archivo `.env` en la raíz del backend:

```env
DATABASE_URL=postgresql://usuario:password@host:puerto/database
JWT_SECRET=tu_clave_secreta_jwt
```

### Variables

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | URL de conexión a PostgreSQL. |
| `JWT_SECRET` | Clave usada para firmar y validar tokens JWT. |

## Instalación

Desde la carpeta del backend:

```bash
cd Cali_Motors_Back
npm install
```

## Ejecución Local

Modo desarrollo con recarga automática:

```bash
npm run dev
```

Modo producción/local simple:

```bash
npm start
```

El servidor queda disponible en:

```txt
http://localhost:3001
```

Puedes probar la API base en:

```txt
http://localhost:3001/
```

Respuesta esperada:

```txt
API Cali Motors funcionando
```

## Scripts Disponibles

| Comando | Descripción |
|---|---|
| `npm run dev` | Inicia el servidor con `nodemon`. |
| `npm start` | Inicia el servidor con `node index.js`. |

## Endpoints Principales

### Autenticación

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/register` | Registra un usuario nuevo. |
| `POST` | `/login` | Inicia sesión y devuelve token JWT. |

### Usuarios

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/users` | Lista usuarios. |
| `GET` | `/users/:id` | Obtiene un usuario por ID. |
| `PUT` | `/users/:id` | Actualiza completamente un usuario. |
| `PATCH` | `/users/:id` | Actualiza parcialmente un usuario. |
| `DELETE` | `/users/:id` | Elimina un usuario. |

### Vehículos

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/vehicles` | Lista todos los vehículos. |
| `GET` | `/vehicles/:id` | Obtiene el detalle de un vehículo. |
| `GET` | `/vehicles/user/:userId` | Lista vehículos de un usuario. |
| `POST` | `/vehicles` | Publica un vehículo. |
| `PUT` | `/vehicles/:id` | Actualiza un vehículo. |
| `DELETE` | `/vehicles/:id` | Elimina un vehículo. |

## Autenticación

Algunas rutas requieren token JWT en el header:

```http
Authorization: Bearer TU_TOKEN
```

Si el token no existe, es inválido o expiró, la API responde con error de autorización.

## Documentación Swagger

La documentación interactiva está disponible en:

```txt
http://localhost:3001/api-docs
```

Desde ahí puedes revisar y probar endpoints documentados.

## Relación Con El Frontend

El frontend debe apuntar a este backend usando:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

El frontend y backend se trabajan como repositorios separados.

## Git Y Repos Separados

Si el frontend existe dentro de esta carpeta durante el desarrollo, agrega esto al `.gitignore` del backend:

```gitignore
Cali_Motors_Front/
```

Si ya fue agregado al tracking de Git:

```bash
git rm -r --cached Cali_Motors_Front
git add .gitignore
git commit -m "Remove frontend from backend repository"
```

## Notas Importantes

- No subas archivos `.env` con credenciales reales.
- La base de datos debe tener las tablas esperadas por las consultas SQL del proyecto.
- Las rutas protegidas dependen del token JWT.
- El backend corre por defecto en el puerto `3001`.
- El frontend se ejecuta y despliega por separado.

