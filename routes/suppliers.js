const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

router.use((req, res, next) => {
    if (!req.session.user) return res.redirect('/auth/login');
    next();
});

router.get('/', async (req, res) => {
    try {
        const { search, countries: selectedCountries, companies: selectedCompanies } = req.query;

        // Ensure they are arrays
        const countryFilters = Array.isArray(selectedCountries) ? selectedCountries : (selectedCountries ? [selectedCountries] : []);
        const companyFilters = Array.isArray(selectedCompanies) ? selectedCompanies : (selectedCompanies ? [selectedCompanies] : []);

        let query = `
            SELECT DISTINCT s.*, st.value as country_name 
            FROM suppliers s
            LEFT JOIN settings st ON s.country_id = st.id
            LEFT JOIN supplier_companies sc ON s.id = sc.supplier_id
        `;
        const params = [];
        const whereClauses = [];

        if (search) {
            whereClauses.push("(s.name LIKE ? OR st.value LIKE ?)");
            const term = `%${search}%`;
            params.push(term, term);
        }

        if (countryFilters.length > 0) {
            whereClauses.push(`s.country_id IN (${countryFilters.map(() => '?').join(',')})`);
            params.push(...countryFilters);
        }

        if (companyFilters.length > 0) {
            whereClauses.push(`sc.company_id IN (${companyFilters.map(() => '?').join(',')})`);
            params.push(...companyFilters);
        }

        if (whereClauses.length > 0) {
            query += " WHERE " + whereClauses.join(" AND ");
        }

        query += " ORDER BY s.id DESC";

        const [suppliers] = await pool.query(query, params);
        const [companies] = await pool.query("SELECT * FROM affiliated_companies");
        const [countries] = await pool.query("SELECT * FROM settings WHERE type = 'country'");

        // Fetch supplier relations
        for (let supplier of suppliers) {
            const [rels] = await pool.query("SELECT company_id FROM supplier_companies WHERE supplier_id = ?", [supplier.id]);
            supplier.company_ids = rels.map(r => r.company_id);
        }

        res.render('suppliers/index', {
            suppliers,
            companies,
            countries,
            search: search || '',
            selectedCountries: countryFilters,
            selectedCompanies: companyFilters
        });
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

        const [result] = await connection.query("INSERT INTO suppliers (name, country_id) VALUES (?, ?)", [name, country || null]);
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

        await connection.query("UPDATE suppliers SET name = ?, country_id = ? WHERE id = ?", [name, country || null, req.params.id]);

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
