const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// Home / Landing
router.get('/home', async (req, res) => {
    try {
        // Fetch public data
        const [products] = await pool.query("SELECT * FROM products ORDER BY created_at DESC LIMIT 6");
        res.render('public/home', { products });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Product List
router.get('/products', async (req, res) => {
    try {
        const [products] = await pool.query("SELECT * FROM products");
        const [categories] = await pool.query("SELECT * FROM categories");
        res.render('public/products', { products, categories });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Product Detail
router.get('/product/:id', async (req, res) => {
    try {
        const [products] = await pool.query("SELECT * FROM products WHERE id = ?", [req.params.id]);
        if (products.length === 0) return res.status(404).send('Product not found');
        const product = products[0];

        // Specs
        const [specs] = await pool.query("SELECT * FROM product_specifications WHERE product_id = ?", [product.id]);
        
        // Materials
        const [materials] = await pool.query(`
            SELECT m.* FROM marketing_materials m
            JOIN product_marketing pm ON m.id = pm.material_id
            WHERE pm.product_id = ?
        `, [product.id]);

        // Events
        const [events] = await pool.query(`
            SELECT e.* FROM events e
            JOIN product_events pe ON e.id = pe.event_id
            WHERE pe.product_id = ?
        `, [product.id]);

        // Testimonies
        const [testimonies] = await pool.query(`
            SELECT t.* FROM testimonies t
            JOIN product_testimonies pt ON t.id = pt.testimony_id
            WHERE pt.product_id = ?
        `, [product.id]);

        res.render('public/product_detail', { product, specs, materials, events, testimonies });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
