const express = require('express');
const router = express.Router();
const multer = require('multer');
const xlsx = require('xlsx');
const { pool } = require('../config/database');

// Middleware to check auth
router.use((req, res, next) => {
    if (!req.session.user) return res.redirect('/auth/login');
    next();
});

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const TEMPLATES = {
    country: process.env.LINK_TEMPLATE_COUNTRY || 'https://docs.google.com/spreadsheets/d/1Z5YX-KwK9UlplEV4l884WX5fu3pl21slR6Ds3wbCglM/edit?usp=sharing',
    product_type: process.env.LINK_TEMPLATE_PRODUCT_TYPE || 'https://docs.google.com/spreadsheets/d/1KLMLkfl45CuUjhCz_fn4XmRr3_nNVTLBZHPur7aihZA/edit?usp=sharing',
    category: process.env.LINK_TEMPLATE_CATEGORY || 'https://docs.google.com/spreadsheets/d/1dgpEkZbMPKc1_WyV8BqVq1_B6DtFbvaQz1H48pXya6o/edit?usp=sharing'
};

// Import Index (Selection)
router.get('/', async (req, res) => {
    res.render('import/index', { templates: TEMPLATES });
});

// Dedicated Import Pages
router.get('/countries', (req, res) => {
    const results = req.session.importResults;
    delete req.session.importResults;
    res.render('import/upload', {
        type: 'Countries',
        icon: 'fa-globe-americas',
        color: '#005b96',
        templateUrl: TEMPLATES.country,
        action: '/admin/import/countries',
        error: req.query.error,
        success: req.query.success,
        results
    });
});

router.get('/product-types', (req, res) => {
    const results = req.session.importResults;
    delete req.session.importResults;
    res.render('import/upload', {
        type: 'Product Types',
        icon: 'fa-tags',
        color: '#009688',
        templateUrl: TEMPLATES.product_type,
        action: '/admin/import/product-types',
        error: req.query.error,
        success: req.query.success,
        results
    });
});

router.get('/categories', (req, res) => {
    const results = req.session.importResults;
    delete req.session.importResults;
    res.render('import/upload', {
        type: 'Categories',
        icon: 'fa-folder-tree',
        color: '#7b1fa2',
        templateUrl: TEMPLATES.category,
        action: '/admin/import/categories',
        error: req.query.error,
        success: req.query.success,
        results
    });
});

// Bulk Import Country
router.post('/countries', upload.single('file'), async (req, res) => {
    if (!req.file) return res.redirect('/admin/import/countries?error=No file uploaded');
    try {
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
        const countries = rows.slice(1).map(row => row[0]).filter(val => val && val.toString().trim() !== '');

        let addedCount = 0;
        let skippedItems = [];

        for (let country of countries) {
            const val = country.toString().trim();
            const [existing] = await pool.query("SELECT id FROM settings WHERE type = 'country' AND value = ?", [val]);
            if (existing.length === 0) {
                await pool.query("INSERT INTO settings (type, value) VALUES ('country', ?)", [val]);
                addedCount++;
            } else {
                skippedItems.push({ item: val, reason: 'Duplicate entry' });
            }
        }

        req.session.importResults = {
            success: true,
            type: 'Countries',
            addedCount,
            skipCount: skippedItems.length,
            skippedItems
        };
        res.redirect('/admin/import/countries');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/import/countries?error=Failed to process country import');
    }
});

// Bulk Import Product Type
router.post('/product-types', upload.single('file'), async (req, res) => {
    if (!req.file) return res.redirect('/admin/import/product-types?error=No file uploaded');
    try {
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
        const types = rows.slice(1).map(row => row[0]).filter(val => val && val.toString().trim() !== '');

        let addedCount = 0;
        let skippedItems = [];

        for (let type of types) {
            const val = type.toString().trim();
            const [existing] = await pool.query("SELECT id FROM settings WHERE type = 'product_type' AND value = ?", [val]);
            if (existing.length === 0) {
                await pool.query("INSERT INTO settings (type, value) VALUES ('product_type', ?)", [val]);
                addedCount++;
            } else {
                skippedItems.push({ item: val, reason: 'Duplicate entry' });
            }
        }

        req.session.importResults = {
            success: true,
            type: 'Product Types',
            addedCount,
            skipCount: skippedItems.length,
            skippedItems
        };
        res.redirect('/admin/import/product-types');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/import/product-types?error=Failed to process product type import');
    }
});

// Bulk Import Categories
router.post('/categories', upload.single('file'), async (req, res) => {
    if (!req.file) return res.redirect('/admin/import/categories?error=No file uploaded');
    try {
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
        const data = rows.slice(1).filter(row => row[0] && row[0].toString().trim() !== '');

        let addedCount = 0;
        let skippedItems = [];

        for (let row of data) {
            const name = row[0].toString().trim();
            const parentName = row[1] ? row[1].toString().trim() : null;
            const [existing] = await pool.query("SELECT id FROM categories WHERE name = ?", [name]);
            if (existing.length > 0) {
                skippedItems.push({ item: name, reason: 'Duplicate entry' });
                continue;
            }
            let parentId = null;
            if (parentName) {
                const [parent] = await pool.query("SELECT id FROM categories WHERE name = ? AND parent_id IS NULL", [parentName]);
                if (parent.length > 0) {
                    parentId = parent[0].id;
                } else {
                    skippedItems.push({ item: name, reason: `Parent category "${parentName}" not found` });
                    continue;
                }
            }
            await pool.query("INSERT INTO categories (name, parent_id) VALUES (?, ?)", [name, parentId]);
            addedCount++;
        }

        req.session.importResults = {
            success: true,
            type: 'Categories',
            addedCount,
            skipCount: skippedItems.length,
            skippedItems
        };
        res.redirect('/admin/import/categories');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/import/categories?error=Failed to process category import');
    }
});

module.exports = router;
