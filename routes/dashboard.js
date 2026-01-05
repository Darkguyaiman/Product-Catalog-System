const express = require('express');
const router = express.Router();

function isAuthenticated(req, res, next) {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/auth/login');
    }
}

router.use(isAuthenticated);

router.get('/', (req, res) => {
    res.render('dashboard');
});

module.exports = router;
