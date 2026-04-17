const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const cors = require('cors');
require('dotenv').config();
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');

const app = express();

app.use(cors({
  origin: '*'
}));

app.use(express.json({ limit: '4mb' }))
app.use(express.urlencoded({ extended: true, limit: '4mb' }))

// Ruta para la documentación de Swagger
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
});

db.on('error', (err) => {
  console.error('Error en la conexión a Neon:', err);
});

app.get('/', (req, res) => {
  res.send('API Cali Motors funcionando');
});
// Ruta para el registro de usuarios
app.post('/register', async (req, res) => {
    const { email, password, firstName, lastName, phone, acceptTerms } = req.body;

    // 1. Validación: Aceptar términos y condiciones
    if (!acceptTerms) {
        return res.status(400).json({
            success: false,
            message: "Debes aceptar los términos y condiciones."
        });
    }

    // 2. Validación: Campos requeridos
    if (!email || !password || !firstName || !lastName || !phone) {
        return res.status(400).json({
            success: false,
            message: "Por favor completa todos los campos requeridos."
        });
    }

    // 3. Validación: Requisitos de la contraseña (Mín 8, 1 Mayús, 1 Núm)
    const passwordRegex = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!passwordRegex.test(password)) {
        return res.status(400).json({
            success: false,
            message: "La contraseña debe tener al menos 8 caracteres, una mayúscula y un número."
        });
    }

    try {
        // 4. Validación: ¿El correo ya existe?
        const result = await db.query('SELECT * FROM usuarios WHERE email = $1', [email]);

        if (result.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: "El correo electrónico ya está registrado."
            });
        }

        // 5. Encriptar contraseña
        const hashedPassword = await bcrypt.hash(password, 10);

        // 6. Guardar en la base de datos
        const insertResult = await db.query(
            'INSERT INTO usuarios (email, password, first_name, last_name, phone) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [email, hashedPassword, firstName, lastName, phone]
        );

        res.status(201).json({
            success: true,
            message: "¡Usuario registrado con éxito!",
            userId: insertResult.rows[0].id
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: "Error interno del servidor."
        });
    }
});

// Ruta para obtener todos los usuarios (para probar en Postman)
app.get('/users', async (req, res) => {
    try {
        const result = await db.query('SELECT id, email, first_name, last_name, phone, creado_en FROM usuarios');
        res.status(200).json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).send("Error interno del servidor al obtener usuarios.");
    }
});

// Ruta para actualizar completamente a un usuario (PUT)
app.put('/users/:id', async (req, res) => {
    const { id } = req.params;
    const { email, password, firstName, lastName, phone } = req.body;

    if (!email || !password || !firstName || !lastName || !phone) {
        return res.status(400).send("Para usar PUT debes enviar todos los campos (email, password, firstName, lastName, phone).");
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await db.query(
            'UPDATE usuarios SET email = $1, password = $2, first_name = $3, last_name = $4, phone = $5 WHERE id = $6',
            [email, hashedPassword, firstName, lastName, phone, id]
        );

        if (result.rowCount === 0) return res.status(404).send("Usuario no encontrado.");
        res.status(200).send("Usuario actualizado completamente.");
    } catch (error) {
        console.error(error);
        res.status(500).send("Error interno del servidor.");
    }
});

// Ruta para actualizar parcialmente a un usuario (PATCH)
app.patch('/users/:id', async (req, res) => {
    const { id } = req.params;
    const { email, password, firstName, lastName, phone } = req.body;

    // Si no manda nada para cambiar, salimos
    if (!email && !password && !firstName && !lastName && !phone) {
        return res.status(400).send("Debes enviar al menos un campo para actualizar.");
    }

    try {
        // Construimos la consulta SQL dinámicamente dependiendo de qué datos envió
        let query = 'UPDATE usuarios SET ';
        const values = [];
        const updates = [];
        let paramIndex = 1;

        if (email) {
            updates.push(`email = $${paramIndex++}`);
            values.push(email);
        }

        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            updates.push(`password = $${paramIndex++}`);
            values.push(hashedPassword);
        }

        if (firstName) {
            updates.push(`first_name = $${paramIndex++}`);
            values.push(firstName);
        }

        if (lastName) {
            updates.push(`last_name = $${paramIndex++}`);
            values.push(lastName);
        }

        if (phone) {
            updates.push(`phone = $${paramIndex++}`);
            values.push(phone);
        }

        query += updates.join(', ') + ` WHERE id = $${paramIndex}`;
        values.push(id);

        const result = await db.query(query, values);

        if (result.rowCount === 0) return res.status(404).send("Usuario no encontrado.");
        res.status(200).send("Usuario actualizado parcialmente.");
    } catch (error) {
        console.error(error);
        res.status(500).send("Error interno del servidor.");
    }
});

// Ruta para el inicio de sesión (Login)
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).send("Debes enviar email y contraseña.");
    }

    try {
        // 1. Buscar al usuario por correo
        const result = await db.query('SELECT * FROM usuarios WHERE email = $1', [email]);

        if (result.rows.length === 0) {
            return res.status(401).send("Correo o contraseña incorrectos.");
        }

        const user = result.rows[0];

        // 2. Verificar la contraseña
        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.status(401).send("Correo o contraseña incorrectos.");
        }

        // 3. Login exitoso
        // Nota: En una app real, aquí generarías un JWT o manejarías una sesión.
        // Por ahora, devolvemos los datos del usuario para simplificar.
        res.status(200).json({
            message: "¡Inicio de sesión exitoso!",
            user: {
                id: user.id,
                email: user.email
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).send("Error interno del servidor.");
    }
});

// Ruta para eliminar a un usuario (DELETE)
app.delete('/users/:id', async (req, res) => {
    const { id } = req.params;

    // Validación: Verificar que el ID sea válido
    if (!id || isNaN(id)) {
        return res.status(400).send("ID inválido. Debe ser un número.");
    }

    try {
        // Verificar que el usuario existe antes de eliminarlo
        const checkResult = await db.query('SELECT * FROM usuarios WHERE id = $1', [id]);

        if (checkResult.rows.length === 0) {
            return res.status(404).send("Usuario no encontrado.");
        }

        // Eliminar el usuario
        const deleteResult = await db.query(
            'DELETE FROM usuarios WHERE id = $1',
            [id]
        );

        if (deleteResult.rowCount === 0) {
            return res.status(404).send("No se pudo eliminar el usuario.");
        }

        res.status(200).send("Usuario eliminado exitosamente.");

    } catch (error) {
        console.error(error);
        res.status(500).send("Error interno del servidor.");
    }
});

// Ruta para publicar un nuevo vehículo (POST)
app.post('/vehicles', async (req, res) => {
    const { userId, marca, modelo, año, precio, kilometraje, descripcion, imagen } = req.body;

    // Validación: Campos requeridos
    if (!userId || !marca || !modelo || !año || !precio) {
        return res.status(400).json({
            success: false,
            message: "Completa todos los campos obligatorios (userId, marca, modelo, año, precio)."
        });
    }

    try {
        // Verificar que el usuario existe
        const userCheck = await db.query('SELECT * FROM usuarios WHERE id = $1', [userId]);
        if (userCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Usuario no encontrado."
            });
        }

        // Insertar el vehículo en la base de datos
        const result = await db.query(
            'INSERT INTO vehiculos (user_id, marca, modelo, año, precio, kilometraje, descripcion, imagen, estado) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id',
            [userId, marca, modelo, año, precio, kilometraje || 0, descripcion || '', imagen || null, 'Activo']
        );

        res.status(201).json({
            success: true,
            message: "¡Vehículo publicado exitosamente!",
            vehicleId: result.rows[0].id
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: "Error interno del servidor."
        });
    }
});

// Ruta para obtener todos los vehículos (GET)
app.get('/vehicles', async (req, res) => {
    try {
        const result = await db.query(
            'SELECT v.id, v.user_id, u.email, u.first_name, u.last_name, u.phone, v.marca, v.modelo, v.año, v.precio, v.kilometraje, v.descripcion, v.estado, v.imagen, v.creado_en FROM vehiculos v JOIN usuarios u ON v.user_id = u.id ORDER BY v.creado_en DESC'
        );
        res.status(200).json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: "Error interno del servidor."
        });
    }
});

// Ruta para obtener un vehículo específico (GET)
app.get('/vehicles/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.query(
            'SELECT v.id, v.user_id, u.email, u.first_name, u.last_name, u.phone, v.marca, v.modelo, v.año, v.precio, v.kilometraje, v.descripcion, v.estado, v.imagen, v.creado_en FROM vehiculos v JOIN usuarios u ON v.user_id = u.id WHERE v.id = $1',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Vehículo no encontrado." });
        }
        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Error interno del servidor." });
    }
});

// Ruta para obtener vehículos de un usuario específico (GET)
app.get('/vehicles/user/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
        const result = await db.query(
            'SELECT id, user_id, marca, modelo, año, precio, kilometraje, descripcion, imagen, estado, creado_en FROM vehiculos WHERE user_id = $1 ORDER BY creado_en DESC',
            [userId]
        );
        res.status(200).json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: "Error interno del servidor."
        });
    }
});

// Ruta para actualizar un vehículo (PUT)
app.put('/vehicles/:id', async (req, res) => {
    const { id } = req.params;
    const { userId, marca, modelo, año, precio, kilometraje, descripcion, estado, imagen } = req.body;

    if (!userId) {
        return res.status(401).json({ success: false, message: "No autorizado. Falta userId." });
    }

    try {
        const vehicleCheck = await db.query('SELECT user_id FROM vehiculos WHERE id = $1', [id]);
        if (vehicleCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Vehículo no encontrado." });
        }
        if (vehicleCheck.rows[0].user_id !== userId) {
            return res.status(403).json({ success: false, message: "No tienes permiso para editar este vehículo." });
        }

        const result = await db.query(
            'UPDATE vehiculos SET marca = $1, modelo = $2, año = $3, precio = $4, kilometraje = $5, descripcion = $6, estado = $7, imagen = $8, actualizado_en = CURRENT_TIMESTAMP WHERE id = $9 AND user_id = $10',
            [marca, modelo, año, precio, kilometraje || 0, descripcion || '', estado || 'Activo', imagen || null, id, userId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({
                success: false,
                message: "Vehículo no encontrado."
            });
        }

        res.status(200).json({
            success: true,
            message: "Vehículo actualizado correctamente."
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: "Error interno del servidor."
        });
    }
});

// Ruta para eliminar un vehículo (DELETE)
app.delete('/vehicles/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const result = await db.query('DELETE FROM vehiculos WHERE id = $1', [id]);

        if (result.rowCount === 0) {
            return res.status(404).json({
                success: false,
                message: "Vehículo no encontrado."
            });
        }

        res.status(200).json({
            success: true,
            message: "Vehículo eliminado correctamente."
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: "Error interno del servidor."
        });
    }
});

module.exports = app;
