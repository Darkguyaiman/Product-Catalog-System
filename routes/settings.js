const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

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
    try {
        await pool.query("DELETE FROM categories WHERE id = ?", [req.params.id]);
        res.redirect('/admin/settings/categories');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/settings/categories?error=Failed to delete');
    }
});

module.exports = router;
