const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');
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

const initializeChatTables = async () => {
    await db.query(`
        CREATE TABLE IF NOT EXISTS conversaciones (
            id SERIAL PRIMARY KEY,
            vehicle_id INTEGER NOT NULL,
            buyer_id INTEGER NOT NULL,
            seller_id INTEGER NOT NULL,
            creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(vehicle_id, buyer_id, seller_id)
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS mensajes (
            id SERIAL PRIMARY KEY,
            conversation_id INTEGER NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
            sender_id INTEGER NOT NULL,
            body TEXT NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'sent',
            read_at TIMESTAMP NULL,
            creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await db.query('CREATE INDEX IF NOT EXISTS idx_conversaciones_users ON conversaciones (buyer_id, seller_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_mensajes_conversation ON mensajes (conversation_id, creado_en)');
};

initializeChatTables().catch((error) => {
    console.error('Error inicializando tablas de chat:', error);
});

app.get('/', (req, res) => {
    res.send('API Cali Motors funcionando');
});

// Middleware para verificar token JWT
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ success: false, message: "Acceso denegado. Se requiere un token." });

    jwt.verify(token, process.env.JWT_SECRET || 'calimotors_secret_key', (err, user) => {
        if (err) return res.status(403).json({ success: false, message: "Token inválido o expirado." });
        req.user = user;
        next();
    });
};

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
            'INSERT INTO usuarios (email, password, first_name, last_name, phone, rol) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, rol',
            [email, hashedPassword, firstName, lastName, phone, 'cliente']
        );

        const newUser = insertResult.rows[0];

        // 7. Login automático tras registro
        const token = jwt.sign(
            { id: newUser.id, email: email, rol: newUser.rol },
            process.env.JWT_SECRET || 'calimotors_secret_key',
            { expiresIn: '12h' }
        );

        res.status(201).json({
            success: true,
            message: "¡Usuario registrado con éxito!",
            user: {
                id: newUser.id,
                email: email,
                rol: newUser.rol,
                firstName: firstName,
                lastName: lastName
            },
            token: token
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
        const result = await db.query('SELECT id, email, first_name, last_name, phone, rol, creado_en FROM usuarios');
        res.status(200).json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).send("Error interno del servidor al obtener usuarios.");
    }
});

// Ruta para obtener un usuario específico (GET)
app.get('/users/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.query('SELECT id, email, first_name, last_name, phone, rol, creado_en FROM usuarios WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).send("Usuario no encontrado.");
        }
        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).send("Error interno del servidor al obtener el usuario.");
    }
});

// Ruta para actualizar completamente a un usuario (PUT)
app.put('/users/:id', authenticateToken, async (req, res) => {
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
app.patch('/users/:id', authenticateToken, async (req, res) => {
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

        // 3. Login exitoso con JWT (30 minutos)
        const token = jwt.sign(
            { id: user.id, email: user.email, rol: user.rol },
            process.env.JWT_SECRET || 'calimotors_secret_key',
            { expiresIn: '12h' }
        );

        res.status(200).json({
            message: "¡Inicio de sesión exitoso!",
            user: {
                id: user.id,
                email: user.email,
                rol: user.rol
            },
            token
        });

    } catch (error) {
        console.error(error);
        res.status(500).send("Error interno del servidor.");
    }
});

// Ruta para eliminar a un usuario (DELETE)
app.delete('/users/:id', authenticateToken, async (req, res) => {
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
app.post('/vehicles', authenticateToken, async (req, res) => {
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
app.put('/vehicles/:id', authenticateToken, async (req, res) => {
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

        const isAdmin = req.user && req.user.rol === 'admin';
        const isOwner = vehicleCheck.rows[0].user_id === userId;

        if (!isOwner && !isAdmin) {
            return res.status(403).json({ success: false, message: "No tienes permiso para editar este vehículo." });
        }

        const result = await db.query(
            'UPDATE vehiculos SET marca = $1, modelo = $2, año = $3, precio = $4, kilometraje = $5, descripcion = $6, estado = $7, imagen = $8, actualizado_en = CURRENT_TIMESTAMP WHERE id = $9',
            [marca, modelo, año, precio, kilometraje || 0, descripcion || '', estado || 'Activo', imagen || null, id]
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
app.delete('/vehicles/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;

    try {
        const vehicleCheck = await db.query('SELECT user_id FROM vehiculos WHERE id = $1', [id]);
        if (vehicleCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Vehículo no encontrado." });
        }

        const isAdmin = req.user && req.user.rol === 'admin';
        const isOwner = req.user && vehicleCheck.rows[0].user_id === req.user.id;

        if (!isOwner && !isAdmin) {
            return res.status(403).json({ success: false, message: "No tienes permiso para eliminar este vehículo." });
        }

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

const getConversationForUser = async (conversationId, userId) => {
    const result = await db.query(
        `SELECT c.*
         FROM conversaciones c
         WHERE c.id = $1 AND (c.buyer_id = $2 OR c.seller_id = $2)`,
        [conversationId, userId]
    );

    return result.rows[0];
};

app.get('/notifications', authenticateToken, async (req, res) => {
    try {
        const result = await db.query(
            `SELECT COUNT(*)::int AS unread_messages
             FROM mensajes m
             JOIN conversaciones c ON c.id = m.conversation_id
             WHERE (c.buyer_id = $1 OR c.seller_id = $1)
               AND m.sender_id <> $1
               AND m.status <> 'read'`,
            [req.user.id]
        );

        res.status(200).json({
            unreadMessages: result.rows[0]?.unread_messages || 0
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Error interno del servidor." });
    }
});

app.get('/conversations', authenticateToken, async (req, res) => {
    try {
        const result = await db.query(
            `SELECT
                c.id,
                c.vehicle_id,
                c.buyer_id,
                c.seller_id,
                c.creado_en,
                c.actualizado_en,
                v.marca,
                v.modelo,
                v.precio,
                v.imagen,
                v.estado,
                buyer.first_name AS buyer_first_name,
                buyer.last_name AS buyer_last_name,
                buyer.email AS buyer_email,
                seller.first_name AS seller_first_name,
                seller.last_name AS seller_last_name,
                seller.email AS seller_email,
                seller.phone AS seller_phone,
                last_msg.body AS last_message,
                last_msg.sender_id AS last_sender_id,
                last_msg.status AS last_status,
                last_msg.creado_en AS last_message_at,
                COALESCE(unread.unread_count, 0)::int AS unread_count
             FROM conversaciones c
             LEFT JOIN vehiculos v ON v.id = c.vehicle_id
             LEFT JOIN usuarios buyer ON buyer.id = c.buyer_id
             LEFT JOIN usuarios seller ON seller.id = c.seller_id
             LEFT JOIN LATERAL (
                SELECT m.body, m.sender_id, m.status, m.creado_en
                FROM mensajes m
                WHERE m.conversation_id = c.id
                ORDER BY m.creado_en DESC
                LIMIT 1
             ) last_msg ON TRUE
             LEFT JOIN LATERAL (
                SELECT COUNT(*)::int AS unread_count
                FROM mensajes m
                WHERE m.conversation_id = c.id
                  AND m.sender_id <> $1
                  AND m.status <> 'read'
             ) unread ON TRUE
             WHERE c.buyer_id = $1 OR c.seller_id = $1
             ORDER BY COALESCE(last_msg.creado_en, c.actualizado_en) DESC`,
            [req.user.id]
        );

        res.status(200).json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Error interno del servidor." });
    }
});

app.post('/conversations', authenticateToken, async (req, res) => {
    const { vehicleId, sellerId, message } = req.body;
    const buyerId = req.user.id;

    if (!vehicleId || !sellerId) {
        return res.status(400).json({ success: false, message: "Faltan datos para iniciar el chat." });
    }

    if (Number(sellerId) === Number(buyerId)) {
        return res.status(400).json({ success: false, message: "No puedes iniciar un chat contigo mismo." });
    }

    try {
        const vehicleCheck = await db.query('SELECT id, user_id FROM vehiculos WHERE id = $1', [vehicleId]);
        if (vehicleCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Vehiculo no encontrado." });
        }

        if (Number(vehicleCheck.rows[0].user_id) !== Number(sellerId)) {
            return res.status(400).json({ success: false, message: "El vendedor no coincide con el vehiculo." });
        }

        const conversationResult = await db.query(
            `INSERT INTO conversaciones (vehicle_id, buyer_id, seller_id)
             VALUES ($1, $2, $3)
             ON CONFLICT (vehicle_id, buyer_id, seller_id)
             DO UPDATE SET actualizado_en = CURRENT_TIMESTAMP
             RETURNING *`,
            [vehicleId, buyerId, sellerId]
        );

        const conversation = conversationResult.rows[0];
        const cleanMessage = typeof message === 'string' ? message.trim() : '';

        if (cleanMessage) {
            await db.query(
                `INSERT INTO mensajes (conversation_id, sender_id, body, status)
                 VALUES ($1, $2, $3, 'sent')`,
                [conversation.id, buyerId, cleanMessage]
            );

            await db.query(
                'UPDATE conversaciones SET actualizado_en = CURRENT_TIMESTAMP WHERE id = $1',
                [conversation.id]
            );
        }

        res.status(201).json({ success: true, conversation });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Error interno del servidor." });
    }
});

app.get('/conversations/:id/messages', authenticateToken, async (req, res) => {
    const { id } = req.params;

    try {
        const conversation = await getConversationForUser(id, req.user.id);
        if (!conversation) {
            return res.status(404).json({ success: false, message: "Chat no encontrado." });
        }

        await db.query(
            `UPDATE mensajes
             SET status = 'read', read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
             WHERE conversation_id = $1 AND sender_id <> $2 AND status <> 'read'`,
            [id, req.user.id]
        );

        const messages = await db.query(
            `SELECT
                m.id,
                m.conversation_id,
                m.sender_id,
                m.body,
                m.status,
                m.read_at,
                m.creado_en,
                u.first_name,
                u.last_name,
                u.email
             FROM mensajes m
             LEFT JOIN usuarios u ON u.id = m.sender_id
             WHERE m.conversation_id = $1
             ORDER BY m.creado_en ASC`,
            [id]
        );

        res.status(200).json({ conversation, messages: messages.rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Error interno del servidor." });
    }
});

app.post('/conversations/:id/messages', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { body } = req.body;
    const cleanBody = typeof body === 'string' ? body.trim() : '';

    if (!cleanBody) {
        return res.status(400).json({ success: false, message: "El mensaje no puede estar vacio." });
    }

    try {
        const conversation = await getConversationForUser(id, req.user.id);
        if (!conversation) {
            return res.status(404).json({ success: false, message: "Chat no encontrado." });
        }

        const result = await db.query(
            `INSERT INTO mensajes (conversation_id, sender_id, body, status)
             VALUES ($1, $2, $3, 'sent')
             RETURNING id, conversation_id, sender_id, body, status, read_at, creado_en`,
            [id, req.user.id, cleanBody]
        );

        await db.query(
            'UPDATE conversaciones SET actualizado_en = CURRENT_TIMESTAMP WHERE id = $1',
            [id]
        );

        res.status(201).json({ success: true, message: result.rows[0] });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Error interno del servidor." });
    }
});

app.patch('/conversations/:id/read', authenticateToken, async (req, res) => {
    const { id } = req.params;

    try {
        const conversation = await getConversationForUser(id, req.user.id);
        if (!conversation) {
            return res.status(404).json({ success: false, message: "Chat no encontrado." });
        }

        await db.query(
            `UPDATE mensajes
             SET status = 'read', read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
             WHERE conversation_id = $1 AND sender_id <> $2 AND status <> 'read'`,
            [id, req.user.id]
        );

        res.status(200).json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Error interno del servidor." });
    }
});

module.exports = app;
