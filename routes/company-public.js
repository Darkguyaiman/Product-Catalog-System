const express = require('express');
const router = express.Router({ mergeParams: true }); // Important: mergeParams to access :shortname
const { pool } = require('../config/database');

// Middleware to load company branding for all routes
router.use(async (req, res, next) => {
    const shortname = req.params.shortname;

    try {
        const [companies] = await pool.query(
            "SELECT id, name, logo, shortname, reg_no, address, email, contact_number FROM affiliated_companies WHERE shortname = ?",
            [shortname]
        );

        if (companies.length === 0) {
            return res.status(404).render('error', { layout: false });
        }

        // Set branding for all views
        res.locals.currentCompany = companies[0];
        res.locals.brandName = companies[0].name;
        res.locals.brandLogo = companies[0].logo || '/QSS Healthcare.png';
        res.locals.companyShortname = shortname;
        res.locals.companyBasePath = `/${shortname}`;

        next();
    } catch (err) {
        console.error('Company lookup failed:', err);
        return res.status(500).send('Server Error');
    }
});

// Helper to get all child category IDs recursively
function getCategoryChildIds(allCategories, parentId) {
    let ids = [parseInt(parentId)];
    const children = allCategories.filter(c => c.parent_id === parseInt(parentId));
    for (const child of children) {
        ids = ids.concat(getCategoryChildIds(allCategories, child.id));
    }
    return ids;
}

// Home / Landing - Shows product listing page
router.get('/home', async (req, res) => {
    try {
        const { category, search } = req.query;
        let query = "SELECT p.* FROM products p JOIN supplier_companies sc ON p.supplier_id = sc.supplier_id";
        let params = [res.locals.currentCompany.id];
        const conditions = ["sc.company_id = ?"];

        // Fetch all categories for filter and recursion logic
        const [allCategories] = await pool.query("SELECT * FROM categories ORDER BY name ASC");

        if (search) {
            conditions.push("(p.model LIKE ? OR p.code LIKE ? OR p.description LIKE ? OR p.mda_reg_no LIKE ?)");
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }

        if (category) {
            // Recursive category filter
            const familyIds = getCategoryChildIds(allCategories, category);
            if (familyIds.length > 0) {
                conditions.push(`p.id IN (SELECT product_id FROM product_categories WHERE category_id IN (${familyIds.join(',')}))`);
            }
        }

        if (conditions.length > 0) {
            query += " WHERE " + conditions.join(" AND ");
        }

        query += " ORDER BY p.created_at DESC";

        const [products] = await pool.query(query, params);

        // Fetch main image for each product
        for (let product of products) {
            const [mainImage] = await pool.query(
                "SELECT image_path FROM product_images WHERE product_id = ? AND is_main = 1 LIMIT 1",
                [product.id]
            );
            product.main_image = mainImage.length > 0 ? mainImage[0].image_path : product.product_image;
        }

        res.render('public/products', { products, categories: allCategories, selectedCategory: category, search: search || '' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Product List
router.get('/products', async (req, res) => {
    try {
        const { category, search } = req.query;
        let query = "SELECT p.* FROM products p JOIN supplier_companies sc ON p.supplier_id = sc.supplier_id";
        let params = [res.locals.currentCompany.id];
        const conditions = ["sc.company_id = ?"];

        const [allCategories] = await pool.query("SELECT * FROM categories ORDER BY name ASC");

        if (search) {
            conditions.push("(p.model LIKE ? OR p.code LIKE ? OR p.description LIKE ? OR p.mda_reg_no LIKE ?)");
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }

        if (category) {
            const familyIds = getCategoryChildIds(allCategories, category);
            if (familyIds.length > 0) {
                conditions.push(`p.id IN (SELECT product_id FROM product_categories WHERE category_id IN (${familyIds.join(',')}))`);
            }
        }

        if (conditions.length > 0) {
            query += " WHERE " + conditions.join(" AND ");
        }

        query += " ORDER BY p.created_at DESC";

        const [products] = await pool.query(query, params);

        for (let product of products) {
            const [mainImage] = await pool.query(
                "SELECT image_path FROM product_images WHERE product_id = ? AND is_main = 1 LIMIT 1",
                [product.id]
            );
            product.main_image = mainImage.length > 0 ? mainImage[0].image_path : product.product_image;
        }

        res.render('public/products', { products, categories: allCategories, selectedCategory: category, search: search || '' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Product Detail
router.get('/product/:id', async (req, res) => {
    try {
        const [products] = await pool.query(`
            SELECT p.* FROM products p
            JOIN supplier_companies sc ON p.supplier_id = sc.supplier_id
            WHERE p.id = ? AND sc.company_id = ?
        `, [req.params.id, res.locals.currentCompany.id]);
        if (products.length === 0) return res.status(404).send('Product not found');
        const product = products[0];

        // Fetch All Categories for the product (for chips)
        const [productCategories] = await pool.query(`
            SELECT c.* FROM categories c
            JOIN product_categories pc ON c.id = pc.category_id
            WHERE pc.product_id = ?
        `, [product.id]);

        // Fetch Supplier
        let supplier = null;
        try {
            if (product.supplier_id) {
                const [suppliers] = await pool.query(`
                    SELECT s.*, st.value as country_name 
                    FROM suppliers s
                    LEFT JOIN settings st ON s.country_id = st.id
                    WHERE s.id = ?
                `, [product.supplier_id]);
                if (suppliers.length > 0) {
                    supplier = suppliers[0];
                }
            }
        } catch (supplierErr) {
            console.log('Supplier lookup failed');
        }

        // Specs
        const [specs] = await pool.query("SELECT * FROM product_specifications WHERE product_id = ?", [product.id]);

        // Materials (categorized)
        const [allMaterials] = await pool.query(`
            SELECT m.* FROM marketing_materials m
            JOIN product_marketing pm ON m.id = pm.material_id
            WHERE pm.product_id = ?
        `, [product.id]);

        const materials = {
            flyers: allMaterials.filter(m => m.category === 'FLIERS'),
            backdrops: allMaterials.filter(m => m.category === 'BACK-DROP'),
            posters: allMaterials.filter(m => m.category === 'POSTER'),
            rollups: allMaterials.filter(m => m.category === 'ROLL-UP'),
            others: allMaterials.filter(m => !['FLIERS', 'BACK-DROP', 'POSTER', 'ROLL-UP', 'BROCHURE'].includes(m.category)),
            brochures: allMaterials.filter(m => m.category === 'BROCHURE')
        };

        // Events with links
        const [events] = await pool.query(`
            SELECT e.* FROM events e
            JOIN product_events pe ON e.id = pe.event_id
            WHERE pe.product_id = ?
        `, [product.id]);

        for (let event of events) {
            const [links] = await pool.query("SELECT * FROM event_links WHERE event_id = ?", [event.id]);
            event.links = links;
            event.video_link = links.find(l => l.url && (l.url.includes('youtube.com') || l.url.includes('youtu.be') || l.url.includes('vimeo.com')));
        }

        // Testimonies with video links
        const [testimonies] = await pool.query(`
            SELECT t.* FROM testimonies t
            JOIN product_testimonies pt ON t.id = pt.testimony_id
            WHERE pt.product_id = ?
        `, [product.id]);

        for (let testimony of testimonies) {
            const [links] = await pool.query("SELECT * FROM testimony_links WHERE testimony_id = ?", [testimony.id]);
            testimony.links = links;
            testimony.video_link = links.find(l => l.url && (l.url.includes('youtube.com') || l.url.includes('youtu.be') || l.url.includes('vimeo.com')));
        }

        // Product Images
        const [productImages] = await pool.query(
            "SELECT * FROM product_images WHERE product_id = ? ORDER BY is_main DESC, id ASC",
            [product.id]
        );

        // Fetch Company-specific Brochure
        const [brochures] = await pool.query(`
            SELECT m.* FROM marketing_materials m
            JOIN product_marketing pm ON m.id = pm.material_id
            WHERE pm.product_id = ? AND m.category = 'BROCHURE'
            AND m.company_id = ?
            ORDER BY m.created_at DESC
            LIMIT 1
        `, [product.id, res.locals.currentCompany.id]);

        res.render('public/product_detail', {
            product,
            specs,
            materials,
            events,
            testimonies,
            productImages,
            productCategories,
            supplier,
            companyBrochure: brochures.length > 0 ? brochures[0] : null
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// MDA Certificate View
router.get('/product/:id/mda-cert', async (req, res) => {
    try {
        const [products] = await pool.query(`
            SELECT p.mda_cert FROM products p
            JOIN supplier_companies sc ON p.supplier_id = sc.supplier_id
            WHERE p.id = ? AND sc.company_id = ?
        `, [req.params.id, res.locals.currentCompany.id]);
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

// Packages List
router.get('/packages', async (req, res) => {
    try {
        const { search } = req.query;
        let query = `
            SELECT DISTINCT pkg.* FROM packages pkg
            JOIN package_products pp ON pkg.id = pp.package_id
            JOIN products p ON pp.product_id = p.id
            JOIN supplier_companies sc ON p.supplier_id = sc.supplier_id
            WHERE sc.company_id = ?
        `;
        const params = [res.locals.currentCompany.id];

        if (search) {
            query += ' AND (pkg.name LIKE ? OR pkg.description LIKE ?)';
            const term = `%${search}%`;
            params.push(term, term);
        }

        query += ' ORDER BY pkg.created_at DESC';

        const [packages] = await pool.query(query, params);

        for (let pkg of packages) {
            const [products] = await pool.query(`
                SELECT p.* FROM products p
                JOIN package_products pp ON p.id = pp.product_id
                JOIN supplier_companies sc ON p.supplier_id = sc.supplier_id
                WHERE pp.package_id = ? AND sc.company_id = ?
                ORDER BY pp.sort_order ASC
            `, [pkg.id, res.locals.currentCompany.id]);

            for (let product of products) {
                const [mainImage] = await pool.query(
                    "SELECT image_path FROM product_images WHERE product_id = ? AND is_main = 1 LIMIT 1",
                    [product.id]
                );
                product.main_image = mainImage.length > 0 ? mainImage[0].image_path : product.product_image;
            }
            pkg.products = products;

            const [specs] = await pool.query(
                "SELECT * FROM package_specs WHERE package_id = ? ORDER BY sort_order ASC",
                [pkg.id]
            );
            pkg.specs = specs;
        }

        res.render('public/packages', { packages, search: search || '' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Package Detail
router.get('/package/:id', async (req, res) => {
    try {
        const [packages] = await pool.query(`
            SELECT DISTINCT pkg.* FROM packages pkg
            JOIN package_products pp ON pkg.id = pp.package_id
            JOIN products p ON pp.product_id = p.id
            JOIN supplier_companies sc ON p.supplier_id = sc.supplier_id
            WHERE pkg.id = ? AND sc.company_id = ?
        `, [req.params.id, res.locals.currentCompany.id]);

        if (packages.length === 0) return res.status(404).send('Package not found');

        const pkg = packages[0];

        const [products] = await pool.query(`
            SELECT p.* FROM products p
            JOIN package_products pp ON p.id = pp.product_id
            JOIN supplier_companies sc ON p.supplier_id = sc.supplier_id
            WHERE pp.package_id = ? AND sc.company_id = ?
            ORDER BY pp.sort_order ASC
        `, [pkg.id, res.locals.currentCompany.id]);

        for (let product of products) {
            const [mainImage] = await pool.query(
                "SELECT image_path FROM product_images WHERE product_id = ? AND is_main = 1 LIMIT 1",
                [product.id]
            );
            product.main_image = mainImage.length > 0 ? mainImage[0].image_path : product.product_image;
        }
        pkg.products = products;

        const [specs] = await pool.query(
            "SELECT * FROM package_specs WHERE package_id = ? ORDER BY sort_order ASC",
            [pkg.id]
        );
        pkg.specs = specs;

        res.render('public/package_detail', { package: pkg });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Watch Video Page
router.get('/watch/:type/:id', async (req, res) => {
    try {
        const { type, id } = req.params;
        let videoUrl = null;
        let title = '';

        if (type === 'event') {
            const [links] = await pool.query("SELECT * FROM event_links WHERE id = ?", [id]);
            if (links.length > 0) {
                videoUrl = links[0].url;
                title = links[0].title || 'Event Video';
            }
        } else if (type === 'testimony') {
            const [links] = await pool.query("SELECT * FROM testimony_links WHERE id = ?", [id]);
            if (links.length > 0) {
                videoUrl = links[0].url;
                title = links[0].title || 'Testimony Video';
            }
        }

        if (!videoUrl) return res.status(404).send('Video not found');

        // Convert YouTube URL to embed URL if needed
        let embedUrl = videoUrl;
        if (videoUrl.includes('youtube.com/watch?v=')) {
            embedUrl = videoUrl.replace('watch?v=', 'embed/');
        } else if (videoUrl.includes('youtu.be/')) {
            embedUrl = videoUrl.replace('youtu.be/', 'youtube.com/embed/');
        }

        res.render('public/watch_video', { videoUrl: embedUrl, title });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Redirect bare /company/:shortname to /company/:shortname/home
router.get('/', (req, res) => {
    res.redirect(`/${req.params.shortname}/home`);
});

module.exports = router;
