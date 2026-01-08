const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// Home / Landing - Shows product listing page
router.get('/home', async (req, res) => {
    try {
        const { category, search } = req.query;
        let query = "SELECT * FROM products";
        let params = [];
        const conditions = [];

        if (search) {
            conditions.push("(model LIKE ? OR code LIKE ? OR description LIKE ? OR reg_no LIKE ?)");
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }

        if (category) {
            conditions.push("category_id = ?");
            params.push(category);
        }

        if (conditions.length > 0) {
            query += " WHERE " + conditions.join(" AND ");
        }

        query += " ORDER BY created_at DESC";

        const [products] = await pool.query(query, params);
        
        // Fetch main image for each product
        for (let product of products) {
            const [mainImage] = await pool.query(
                "SELECT image_path FROM product_images WHERE product_id = ? AND is_main = 1 LIMIT 1",
                [product.id]
            );
            product.main_image = mainImage.length > 0 ? mainImage[0].image_path : product.product_image;
        }
        
        const [categories] = await pool.query("SELECT * FROM categories");
        res.render('public/products', { products, categories, selectedCategory: category, search: search || '' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Product List
router.get('/products', async (req, res) => {
    try {
        const { category, search } = req.query;
        let query = "SELECT * FROM products";
        let params = [];
        const conditions = [];

        if (search) {
            conditions.push("(model LIKE ? OR code LIKE ? OR description LIKE ? OR reg_no LIKE ?)");
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }

        if (category) {
            conditions.push("category_id = ?");
            params.push(category);
        }

        if (conditions.length > 0) {
            query += " WHERE " + conditions.join(" AND ");
        }

        query += " ORDER BY created_at DESC";

        const [products] = await pool.query(query, params);
        
        // Fetch main image for each product
        for (let product of products) {
            const [mainImage] = await pool.query(
                "SELECT image_path FROM product_images WHERE product_id = ? AND is_main = 1 LIMIT 1",
                [product.id]
            );
            product.main_image = mainImage.length > 0 ? mainImage[0].image_path : product.product_image;
        }
        
        const [categories] = await pool.query("SELECT * FROM categories");
        res.render('public/products', { products, categories, selectedCategory: category, search: search || '' });
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

        // Fetch Categories (parent and subcategory)
        const [productCategories] = await pool.query(`
            SELECT c.* FROM categories c
            JOIN product_categories pc ON c.id = pc.category_id
            WHERE pc.product_id = ?
        `, [product.id]);

        // Separate parent categories and subcategories
        let category = null;
        let subcategory = null;
        for (let cat of productCategories) {
            if (cat.parent_id === null) {
                category = cat;
            } else {
                subcategory = cat;
                // Get parent category for subcategory
                const [parentCat] = await pool.query("SELECT * FROM categories WHERE id = ?", [cat.parent_id]);
                if (parentCat.length > 0) {
                    category = parentCat[0];
                }
            }
        }

        // Fetch Supplier information
        let supplier = null;
        // Check if products table has supplier_id column
        try {
            if (product.supplier_id) {
                const [suppliers] = await pool.query("SELECT * FROM suppliers WHERE id = ?", [product.supplier_id]);
                if (suppliers.length > 0) {
                    supplier = suppliers[0];
                }
            }
        } catch (supplierErr) {
            // If supplier_id doesn't exist, try product_suppliers junction table
            try {
                const [productSuppliers] = await pool.query(`
                    SELECT s.* FROM suppliers s
                    JOIN product_suppliers ps ON s.id = ps.supplier_id
                    WHERE ps.product_id = ?
                    LIMIT 1
                `, [product.id]);
                if (productSuppliers.length > 0) {
                    supplier = productSuppliers[0];
                }
            } catch (junctionErr) {
                // If neither exists, supplier will remain null
                console.log('Supplier relationship not found for product:', product.id);
            }
        }

        // Specs
        const [specs] = await pool.query("SELECT * FROM product_specifications WHERE product_id = ?", [product.id]);

        // Materials
        const [materials] = await pool.query(`
            SELECT m.* FROM marketing_materials m
            JOIN product_marketing pm ON m.id = pm.material_id
            WHERE pm.product_id = ?
        `, [product.id]);

        // Events with links
        const [events] = await pool.query(`
            SELECT e.* FROM events e
            JOIN product_events pe ON e.id = pe.event_id
            WHERE pe.product_id = ?
        `, [product.id]);
        
        // Fetch links for each event
        for (let event of events) {
            const [links] = await pool.query("SELECT url FROM event_links WHERE event_id = ? LIMIT 1", [event.id]);
            event.link = links.length > 0 ? links[0].url : null;
        }

        // Testimonies
        const [testimonies] = await pool.query(`
            SELECT t.* FROM testimonies t
            JOIN product_testimonies pt ON t.id = pt.testimony_id
            WHERE pt.product_id = ?
        `, [product.id]);

        // Product Images (ordered by main first, then by id)
        const [productImages] = await pool.query(
            "SELECT * FROM product_images WHERE product_id = ? ORDER BY is_main DESC, id ASC",
            [product.id]
        );

        res.render('public/product_detail', { 
            product, 
            specs, 
            materials, 
            events, 
            testimonies, 
            productImages,
            category,
            subcategory,
            supplier
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// MDA Certificate View
router.get('/product/:id/mda-cert', async (req, res) => {
    try {
        const [products] = await pool.query("SELECT mda_cert FROM products WHERE id = ?", [req.params.id]);
        if (products.length === 0 || !products[0].mda_cert) {
            return res.status(404).send('MDA Certificate not found');
        }
        
        const certPath = products[0].mda_cert;
        const isPdf = certPath.toLowerCase().endsWith('.pdf');
        
        res.render('public/mda_cert', { 
            certPath, 
            isPdf,
            productId: req.params.id
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
