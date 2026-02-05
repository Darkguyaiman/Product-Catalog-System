const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const bcrypt = require('bcrypt');


// Middleware to check auth
router.use((req, res, next) => {
    if (!req.session.user) return res.redirect('/auth/login');
    next();
});

// Settings List
router.get('/', async (req, res) => {
    try {
        const [countries] = await pool.query("SELECT * FROM settings WHERE type = 'country'");
        const [productTypes] = await pool.query("SELECT * FROM settings WHERE type = 'product_type'");
        res.render('settings/index', { countries, productTypes });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Add Setting
router.post('/add', async (req, res) => {
    const { type, value } = req.body;
    try {
        await pool.query("INSERT INTO settings (type, value) VALUES (?, ?)", [type, value]);
        res.redirect('/admin/settings');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/settings?error=Failed to add setting');
    }
});

// Edit Setting
router.post('/edit/:id', async (req, res) => {
    const { value } = req.body;
    try {
        await pool.query("UPDATE settings SET value = ? WHERE id = ?", [value, req.params.id]);
        res.redirect('/admin/settings');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/settings?error=Failed to update');
    }
});

// Delete Setting
router.post('/delete/:id', async (req, res) => {
    if (req.session.user.role !== 'Super Admin') return res.status(403).send('Unauthorized');
    try {
        await pool.query("DELETE FROM settings WHERE id = ?", [req.params.id]);
        res.redirect('/admin/settings');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/settings?error=Failed to delete');
    }
});

// Categories Management
router.get('/categories', async (req, res) => {
    try {
        const [categories] = await pool.query("SELECT * FROM categories ORDER BY name");
        res.render('settings/categories', { categories });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.post('/categories/add', async (req, res) => {
    const { name, parent_id } = req.body;
    try {
        await pool.query("INSERT INTO categories (name, parent_id) VALUES (?, ?)", [name, parent_id || null]);
        res.redirect('/admin/settings/categories');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/settings/categories?error=Failed to add category');
    }
});

router.post('/categories/edit/:id', async (req, res) => {
    const { name, parent_id } = req.body;
    try {
        await pool.query("UPDATE categories SET name = ?, parent_id = ? WHERE id = ?", [name, parent_id || null, req.params.id]);
        res.redirect('/admin/settings/categories');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/settings/categories?error=Failed to update category');
    }
});

router.post('/categories/delete/:id', async (req, res) => {
    if (req.session.user.role !== 'Super Admin') return res.status(403).send('Unauthorized');
    try {
        await pool.query("DELETE FROM categories WHERE id = ?", [req.params.id]);
        res.redirect('/admin/settings/categories');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/settings/categories?error=Failed to delete');
    }
});

// Users Management
router.get('/users', async (req, res) => {
    const userRole = req.session.user.role;
    if (userRole !== 'Admin' && userRole !== 'Super Admin') return res.redirect('/admin/settings');

    try {
        let query = "SELECT id, email, role FROM users ORDER BY email";
        let params = [];

        // If Admin, hide Super Admin users
        if (userRole === 'Admin') {
            query = "SELECT id, email, role FROM users WHERE role != 'Super Admin' ORDER BY email";
        }

        const [users] = await pool.query(query, params);
        res.render('settings/users', { users });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.post('/users/add', async (req, res) => {
    const userRole = req.session.user.role;
    if (userRole !== 'Admin' && userRole !== 'Super Admin') return res.status(403).send('Unauthorized');

    const { email, password, role } = req.body;

    // Protection: Admin cannot create Super Admin
    if (role === 'Super Admin' && userRole !== 'Super Admin') {
        return res.status(403).send('Unauthorized to create Super Admin');
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query("INSERT INTO users (email, password, role) VALUES (?, ?, ?)", [email, hashedPassword, role]);
        res.redirect('/admin/settings/users');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/settings/users?error=Failed to add user');
    }
});

router.post('/users/edit/:id', async (req, res) => {
    const userRole = req.session.user.role;
    if (userRole !== 'Admin' && userRole !== 'Super Admin') return res.status(403).send('Unauthorized');

    const { email, role } = req.body;

    try {
        // Check target user's current role
        const [[targetUser]] = await pool.query("SELECT role FROM users WHERE id = ?", [req.params.id]);
        if (!targetUser) return res.redirect('/admin/settings/users?error=User not found');

        // Protection: Admin cannot edit Super Admin
        if (targetUser.role === 'Super Admin' && userRole !== 'Super Admin') {
            return res.status(403).send('Unauthorized to edit Super Admin');
        }

        // Protection: Admin cannot promote to Super Admin
        if (role === 'Super Admin' && userRole !== 'Super Admin') {
            return res.status(403).send('Unauthorized to promote to Super Admin');
        }

        await pool.query("UPDATE users SET email = ?, role = ? WHERE id = ?", [email, role, req.params.id]);
        res.redirect('/admin/settings/users');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/settings/users?error=Failed to update user');
    }
});

router.post('/users/delete/:id', async (req, res) => {
    const userRole = req.session.user.role;
    if (userRole !== 'Super Admin') return res.status(403).send('Unauthorized');

    try {
        // Prevent deleting self
        if (req.params.id == req.session.user.id) {
            return res.redirect('/admin/settings/users?error=Cannot delete yourself');
        }

        // Check target user's current role
        const [[targetUser]] = await pool.query("SELECT role FROM users WHERE id = ?", [req.params.id]);
        if (!targetUser) return res.redirect('/admin/settings/users?error=User not found');

        // Protection: Admin cannot delete Super Admin
        if (targetUser.role === 'Super Admin' && userRole !== 'Super Admin') {
            return res.status(403).send('Unauthorized to delete Super Admin');
        }

        await pool.query("DELETE FROM users WHERE id = ?", [req.params.id]);
        res.redirect('/admin/settings/users');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/settings/users?error=Failed to delete user');
    }
});

module.exports = router;

