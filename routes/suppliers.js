const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

router.use((req, res, next) => {
    if (!req.session.user) return res.redirect('/auth/login');
    next();
});

router.get('/', async (req, res) => {
    try {
        const { search } = req.query;
        let query = "SELECT * FROM suppliers";
        const params = [];

        if (search) {
            query += " WHERE name LIKE ? OR country LIKE ?";
            const term = `%${search}%`;
            params.push(term, term);
        }

        query += " ORDER BY id DESC";

        const [suppliers] = await pool.query(query, params);
        const [companies] = await pool.query("SELECT * FROM affiliated_companies");

        // Fetch supplier relations
        // Optimization: Could use a JOIN or GROUP_CONCAT, but keeping loop for now as per existing pattern or minimal change preference
        for (let supplier of suppliers) {
            const [rels] = await pool.query("SELECT company_id FROM supplier_companies WHERE supplier_id = ?", [supplier.id]);
            supplier.company_ids = rels.map(r => r.company_id);
        }

        res.render('suppliers/index', { suppliers, companies, search: search || '' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.get('/add', async (req, res) => {
    try {
        const [companies] = await pool.query("SELECT * FROM affiliated_companies");
        const [countries] = await pool.query("SELECT * FROM settings WHERE type = 'country'");
        res.render('suppliers/add', { companies, countries });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.post('/add', async (req, res) => {
    const { name, country, company_ids } = req.body;
    // company_ids can be array or string
    const companyIds = Array.isArray(company_ids) ? company_ids : (company_ids ? [company_ids] : []);

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [result] = await connection.query("INSERT INTO suppliers (name, country) VALUES (?, ?)", [name, country]);
        const supplierId = result.insertId;

        if (companyIds.length > 0) {
            const values = companyIds.map(cid => [supplierId, cid]);
            await connection.query("INSERT INTO supplier_companies (supplier_id, company_id) VALUES ?", [values]);
        }

        await connection.commit();
        res.redirect('/admin/suppliers');
    } catch (err) {
        if (connection) await connection.rollback();
        console.error(err);
        res.redirect('/admin/suppliers?error=Failed to add supplier');
    } finally {
        if (connection) connection.release();
    }
});

router.get('/edit/:id', async (req, res) => {
    try {
        const [suppliers] = await pool.query("SELECT * FROM suppliers WHERE id = ?", [req.params.id]);
        if (suppliers.length === 0) return res.redirect('/admin/suppliers');
        const supplier = suppliers[0];

        const [companies] = await pool.query("SELECT * FROM affiliated_companies");
        const [countries] = await pool.query("SELECT * FROM settings WHERE type = 'country'");

        const [rels] = await pool.query("SELECT company_id FROM supplier_companies WHERE supplier_id = ?", [supplier.id]);
        supplier.company_ids = rels.map(r => r.company_id);

        res.render('suppliers/edit', { supplier, companies, countries });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.post('/edit/:id', async (req, res) => {
    const { name, country, company_ids } = req.body;
    const companyIds = Array.isArray(company_ids) ? company_ids : (company_ids ? [company_ids] : []);

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        await connection.query("UPDATE suppliers SET name = ?, country = ? WHERE id = ?", [name, country, req.params.id]);

        // Update relations: delete all then insert new
        await connection.query("DELETE FROM supplier_companies WHERE supplier_id = ?", [req.params.id]);

        if (companyIds.length > 0) {
            const values = companyIds.map(cid => [req.params.id, cid]);
            await connection.query("INSERT INTO supplier_companies (supplier_id, company_id) VALUES ?", [values]);
        }

        await connection.commit();
        res.redirect('/admin/suppliers');
    } catch (err) {
        if (connection) await connection.rollback();
        console.error(err);
        res.redirect('/admin/suppliers?error=Failed to update supplier');
    } finally {
        if (connection) connection.release();
    }
});

router.post('/delete/:id', async (req, res) => {
    try {
        await pool.query("DELETE FROM suppliers WHERE id = ?", [req.params.id]);
        res.redirect('/admin/suppliers');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/suppliers?error=Failed to delete');
    }
});

module.exports = router;
