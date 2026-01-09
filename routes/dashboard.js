const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

function isAuthenticated(req, res, next) {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/auth/login');
    }
}

router.use(isAuthenticated);

const getPercentageChange = (current, last) => {
    if (last === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - last) / last) * 100);
};

router.get('/', async (req, res) => {
    try {
        // Basic Stats
        const [[{ count: totalProducts }]] = await pool.query("SELECT COUNT(*) as count FROM products");
        const [[{ count: totalCompanies }]] = await pool.query("SELECT COUNT(*) as count FROM affiliated_companies");
        const [[{ count: totalSuppliers }]] = await pool.query("SELECT COUNT(*) as count FROM suppliers");

        // Materials Stats & Change
        const [[{ count: totalMaterials }]] = await pool.query("SELECT COUNT(*) as count FROM marketing_materials");
        const [[{ count: currentMaterials }]] = await pool.query("SELECT COUNT(*) as count FROM marketing_materials WHERE MONTH(created_at) = MONTH(CURRENT_DATE()) AND YEAR(created_at) = YEAR(CURRENT_DATE())");
        const [[{ count: lastMaterials }]] = await pool.query("SELECT COUNT(*) as count FROM marketing_materials WHERE MONTH(created_at) = MONTH(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH)) AND YEAR(created_at) = YEAR(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH))");
        const materialsChange = getPercentageChange(currentMaterials, lastMaterials);

        // Events Stats & Change
        const [[{ count: totalEvents }]] = await pool.query("SELECT COUNT(*) as count FROM events");
        const [[{ count: currentEvents }]] = await pool.query("SELECT COUNT(*) as count FROM events WHERE MONTH(created_at) = MONTH(CURRENT_DATE()) AND YEAR(created_at) = YEAR(CURRENT_DATE())");
        const [[{ count: lastEvents }]] = await pool.query("SELECT COUNT(*) as count FROM events WHERE MONTH(created_at) = MONTH(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH)) AND YEAR(created_at) = YEAR(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH))");
        const eventsChange = getPercentageChange(currentEvents, lastEvents);

        // Testimonials Stats & Change
        const [[{ count: totalTestimonials }]] = await pool.query("SELECT COUNT(*) as count FROM testimonies");
        const [[{ count: currentTestimonials }]] = await pool.query("SELECT COUNT(*) as count FROM testimonies WHERE MONTH(created_at) = MONTH(CURRENT_DATE()) AND YEAR(created_at) = YEAR(CURRENT_DATE())");
        const [[{ count: lastTestimonials }]] = await pool.query("SELECT COUNT(*) as count FROM testimonies WHERE MONTH(created_at) = MONTH(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH)) AND YEAR(created_at) = YEAR(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH))");
        const testimonialsChange = getPercentageChange(currentTestimonials, lastTestimonials);

        // Chart Data: Products per Category
        const [categoriesData] = await pool.query(`
            SELECT c.name, COUNT(pc.product_id) as count 
            FROM categories c 
            LEFT JOIN product_categories pc ON c.id = pc.category_id 
            GROUP BY c.id, c.name
            HAVING count > 0
        `);

        // Chart Data: Top 10 Suppliers
        const [suppliersData] = await pool.query(`
            SELECT s.name, COUNT(p.id) as product_count 
            FROM suppliers s 
            LEFT JOIN products p ON s.id = p.supplier_id 
            GROUP BY s.id, s.name 
            ORDER BY product_count DESC 
            LIMIT 10
        `);

        res.render('dashboard', {
            totalProducts,
            totalCompanies,
            totalSuppliers,
            totalMaterials,
            materialsChange,
            totalEvents,
            eventsChange,
            totalTestimonials,
            testimonialsChange,
            categoriesData,
            suppliersData
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Dashboard data error");
    }
});

module.exports = router;
