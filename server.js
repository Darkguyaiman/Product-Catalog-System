const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const path = require('path');
const fs = require('fs');
const { initializeDatabase, sessionStoreConfig } = require('./config/database');
const app = express();
require('dotenv').config();

// Create MySQL session store
const sessionStore = new MySQLStore(sessionStoreConfig);

// Initialize Database
initializeDatabase();

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Ensure upload directories exist
['public/uploads/products', 'public/uploads/logos', 'public/uploads/marketing'].forEach(dir => {
  try {
    fs.mkdirSync(path.join(__dirname, dir), { recursive: true });
  } catch (e) { }
});

app.use(express.static(path.join(__dirname, 'public')));

// Session Setup with MySQL Store
app.use(session({
  key: 'product_catalog_session',
  secret: process.env.SESSION_SECRET || 'secret',
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 86400000 // 24 hours
  }
}));

const expressLayouts = require('express-ejs-layouts');

// View Engine
app.use(expressLayouts);
app.set('layout', 'layout');
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Global Middleware for User Session
app.use(async (req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.path = req.path;
  res.locals.query = req.query;
  res.locals.port = process.env.PORT || 3000;
  res.locals.baseDomain = process.env.BASE_DOMAIN || 'lvh.me';

  // Default values
  res.locals.brandLogo = '/QSS Healthcare.png';
  res.locals.brandName = 'Product Catalog';

  next();
});

// Routes
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const settingsRoutes = require('./routes/settings');
const companyRoutes = require('./routes/companies');
const supplierRoutes = require('./routes/suppliers');
const productRoutes = require('./routes/products');
const marketingRoutes = require('./routes/marketing');
const packageRoutes = require('./routes/packages');
const companyPublicRoutes = require('./routes/company-public');

app.use('/auth', authRoutes);
app.use('/admin', dashboardRoutes);
app.use('/admin/settings', settingsRoutes);
app.use('/admin/companies', companyRoutes);
app.use('/admin/suppliers', supplierRoutes);
app.use('/admin/products', productRoutes);
app.use('/admin/marketing', marketingRoutes);
app.use('/admin/packages', packageRoutes);

// Shortcut for login
app.get('/login', (req, res) => {
  res.redirect('/auth/login');
});

// Root - show 404
app.get('/', (req, res) => {
  res.status(404).render('error', { layout: false });
});

// Company-specific public routes (path-based branding) - MUST be last
app.use('/:shortname', companyPublicRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
