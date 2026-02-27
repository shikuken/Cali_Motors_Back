const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const cors = require('cors'); // <--- NUEVA LÍNEA 1

const app = express();

app.use(cors()); // <--- NUEVA LÍNEA 2: Permite que tu HTML hable con el servidor
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuración de la conexión a MySQL
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'Lorenaxd23::q',
    database: 'mi_app'
});

// Ruta para el registro de usuarios
app.post('/register', async (req, res) => {
    const { email, password, acceptTerms } = req.body;

    // 1. Validación: Aceptar términos y condiciones
    if (!acceptTerms) {
        return res.status(400).send("Debes aceptar los términos y condiciones.");
    }

    // 2. Validación: Requisitos de la contraseña (Mín 8, 1 Mayús, 1 Núm)
    const passwordRegex = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!passwordRegex.test(password)) {
        return res.status(400).send("La contraseña debe tener al menos 8 caracteres, una mayúscula y un número.");
    }

    try {
        // 3. Validación: ¿El correo ya existe?
        const [rows] = await db.promise().query('SELECT * FROM usuarios WHERE email = ?', [email]);

        if (rows.length > 0) {
            return res.status(400).send("El correo electrónico ya está registrado.");
        }

        // 4. Encriptar contraseña
        const hashedPassword = await bcrypt.hash(password, 10);

        // 5. Guardar en la base de datos
        await db.promise().query(
            'INSERT INTO usuarios (email, password) VALUES (?, ?)',
            [email, hashedPassword]
        );

        res.status(201).send("¡Usuario registrado con éxito!");

    } catch (error) {
        console.error(error);
        res.status(500).send("Error interno del servidor.");
    }
});

// Ruta para obtener todos los usuarios (para probar en Postman)
app.get('/users', async (req, res) => {
    try {
        const [rows] = await db.promise().query('SELECT id, email, creado_en FROM usuarios');
        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).send("Error interno del servidor al obtener usuarios.");
    }
});

// Ruta para actualizar completamente a un usuario (PUT)
app.put('/users/:id', async (req, res) => {
    const { id } = req.params;
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).send("Para usar PUT debes enviar todos los campos (email y password).");
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await db.promise().query(
            'UPDATE usuarios SET email = ?, password = ? WHERE id = ?',
            [email, hashedPassword, id]
        );

        if (result.affectedRows === 0) return res.status(404).send("Usuario no encontrado.");
        res.status(200).send("Usuario actualizado completamente.");
    } catch (error) {
        console.error(error);
        res.status(500).send("Error interno del servidor.");
    }
});

// Ruta para actualizar parcialmente a un usuario (PATCH)
app.patch('/users/:id', async (req, res) => {
    const { id } = req.params;
    const { email, password } = req.body;

    // Si no manda nada para cambiar, salimos
    if (!email && !password) {
        return res.status(400).send("Debes enviar al menos un campo para actualizar.");
    }

    try {
        // Construimos la consulta SQL dinámicamente dependiendo de qué datos envió
        let query = 'UPDATE usuarios SET ';
        const values = [];

        if (email) {
            query += 'email = ? ';
            values.push(email);
        }

        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            query += (email ? ', ' : '') + 'password = ? ';
            values.push(hashedPassword);
        }

        query += 'WHERE id = ?';
        values.push(id);

        const [result] = await db.promise().query(query, values);

        if (result.affectedRows === 0) return res.status(404).send("Usuario no encontrado.");
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
        const [rows] = await db.promise().query('SELECT * FROM usuarios WHERE email = ?', [email]);

        if (rows.length === 0) {
            return res.status(401).send("Correo o contraseña incorrectos.");
        }

        const user = rows[0];

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

app.listen(3001, () => console.log('Servidor corriendo en http://localhost:3001'));
