# Product Catalog System

A multi-tenant product catalog management system built with Node.js and Express. It provides an admin panel for managing products, suppliers, companies, marketing materials, and packages, along with a public-facing catalog scoped per affiliated company.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Database Schema](#database-schema)
- [Route Map](#route-map)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [Authentication and Roles](#authentication-and-roles)
- [License](#license)

---

## Features

- **Admin Dashboard** - Overview with counts, monthly deltas, and charts (products per category, top suppliers)
- **Product Management** - Full CRUD with multiple images, MDA certificates, specifications, categories, and types
- **Supplier Management** - CRUD with country association and company linking
- **Affiliated Companies** - Multi-tenant company profiles with logos and branding
- **Marketing Hub** - Materials (brochures, fliers, roll-ups, posters, backdrops), events, and testimonials linked to products
- **Package Builder** - Bundle products into packages with icons, specs, and display ordering
- **Bulk Import** - Excel file import for countries, product types, and categories
- **Public Catalog** - Company-scoped, unauthenticated product/package browsing via URL shortnames
- **Chunked File Uploads** - Large file support with chunk assembly for images, PDFs, and marketing assets
- **Role-Based Access Control** - Four roles with varying permissions across the admin panel

---

## Architecture

```mermaid
graph TB
    subgraph Client
        Browser[Browser]
    end

    subgraph Server["Node.js / Express Server"]
        MW[Middleware<br/>Session + Auth Check]
        AuthR[Auth Routes]
        AdminR[Admin Routes]
        PublicR[Public Routes]
        Views[EJS Templates]
    end

    subgraph Database["MySQL Database"]
        Tables[(Tables)]
        Sessions[(Sessions)]
    end

    subgraph Storage["File System"]
        Uploads[/public/uploads/]
        Temp[/temp/chunks/]
    end

    Browser -->|HTTP Requests| MW
    MW --> AuthR
    MW --> AdminR
    MW --> PublicR
    AuthR --> Views
    AdminR --> Views
    PublicR --> Views
    Views -->|HTML Response| Browser
    AdminR -->|SQL Queries| Tables
    PublicR -->|SQL Queries| Tables
    AuthR -->|Session Store| Sessions
    AdminR -->|File Write| Uploads
    AdminR -->|Chunk Assembly| Temp
```

### Request Flow

```mermaid
sequenceDiagram
    participant B as Browser
    participant E as Express Server
    participant S as Session Store
    participant DB as MySQL
    participant FS as File System

    B->>E: HTTP Request
    E->>S: Validate Session
    S-->>E: Session Data

    alt Authenticated (Admin)
        E->>DB: Execute Query
        DB-->>E: Result Set
        E->>FS: Read/Write Files (if upload)
        FS-->>E: File Path
        E-->>B: Rendered EJS Page
    else Unauthenticated (Public)
        E->>DB: Scoped Query (by company shortname)
        DB-->>E: Filtered Results
        E-->>B: Public Catalog Page
    else Not Logged In (Admin attempt)
        E-->>B: Redirect to /auth/login
    end
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js |
| Framework | Express 5.x |
| Templating | EJS + express-ejs-layouts |
| Database | MySQL (via mysql2) |
| Session Store | express-mysql-session |
| Authentication | bcrypt + cookie sessions |
| File Processing | Multer (uploads), Sharp (image resize/WebP) |
| Data Import | xlsx (Excel parsing) |

---

## Database Schema

```mermaid
erDiagram
    users {
        int id PK
        varchar email UK
        varchar password
        enum role
    }

    settings {
        int id PK
        varchar type
        varchar value
    }

    categories {
        int id PK
        varchar name
        int parent_id FK
    }

    affiliated_companies {
        int id PK
        varchar name
        varchar shortname UK
        varchar logo
        text contact_info
    }

    suppliers {
        int id PK
        varchar name
        int country_id FK
    }

    supplier_companies {
        int supplier_id FK
        int company_id FK
    }

    products {
        int id PK
        varchar code
        varchar model
        varchar mda_reg_no
        text description
        varchar product_image
        varchar mda_cert
        int supplier_id FK
    }

    product_categories {
        int product_id FK
        int category_id FK
    }

    product_types {
        int product_id FK
        int setting_id FK
    }

    product_specifications {
        int id PK
        int product_id FK
        varchar spec_key
        varchar spec_value
    }

    product_images {
        int id PK
        int product_id FK
        varchar image_path
        boolean is_main
    }

    marketing_materials {
        int id PK
        varchar file_path
        varchar category
        int company_id FK
    }

    product_marketing {
        int product_id FK
        int material_id FK
    }

    events {
        int id PK
        varchar title
    }

    event_links {
        int id PK
        int event_id FK
        varchar url
    }

    product_events {
        int product_id FK
        int event_id FK
    }

    testimonies {
        int id PK
        varchar title
    }

    testimony_links {
        int id PK
        int testimony_id FK
        varchar url
    }

    product_testimonies {
        int product_id FK
        int testimony_id FK
    }

    packages {
        int id PK
        varchar name
        varchar image
    }

    package_products {
        int package_id FK
        int product_id FK
        int sort_order
    }

    package_specs {
        int id PK
        int package_id FK
        varchar spec_key
        varchar spec_value
    }

    suppliers ||--o{ products : "supplies"
    suppliers }o--o{ affiliated_companies : "supplier_companies"
    settings ||--o{ suppliers : "country"
    products }o--o{ categories : "product_categories"
    products }o--o{ settings : "product_types"
    products ||--o{ product_specifications : "has"
    products ||--o{ product_images : "has"
    products }o--o{ marketing_materials : "product_marketing"
    products }o--o{ events : "product_events"
    products }o--o{ testimonies : "product_testimonies"
    packages }o--o{ products : "package_products"
    packages ||--o{ package_specs : "has"
    categories ||--o{ categories : "parent"
    marketing_materials }o--o| affiliated_companies : "scoped to"
    events ||--o{ event_links : "has"
    testimonies ||--o{ testimony_links : "has"
```

---

## Route Map

```mermaid
graph LR
    subgraph Auth
        A1["GET /auth/login"]
        A2["POST /auth/login"]
        A3["GET /auth/logout"]
    end

    subgraph Admin
        D["GET /admin - Dashboard"]
        S["Settings"]
        C["Companies"]
        SU["Suppliers"]
        P["Products"]
        M["Marketing"]
        PK["Packages"]
        I["Import"]
    end

    subgraph Public["Public Catalog"]
        PH["GET /:shortname/home"]
        PP["GET /:shortname/products"]
        PD["GET /:shortname/product/:id"]
        PPK["GET /:shortname/packages"]
        PPKD["GET /:shortname/package/:id"]
    end

    A1 --> D
    D --> S
    D --> C
    D --> SU
    D --> P
    D --> M
    D --> PK
    D --> I
```

### Admin Sub-routes

| Module | Routes |
|--------|--------|
| Settings | Categories CRUD, Countries/Product Types (via settings), User management |
| Companies | List, Add, Edit, Delete, Chunked logo upload |
| Suppliers | List, Add, Edit, Delete |
| Products | List (with filters), Create, Edit, Delete (Super Admin), Chunked upload |
| Marketing | Materials, Events, Testimonials - each with full CRUD and chunked upload |
| Packages | List, Create, Edit, Delete (Super Admin), Chunked upload |
| Import | Excel upload for countries, product types, categories |

---

## Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- MySQL server (v8.x recommended)

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd "Product Catalog System"
```

2. Install dependencies:

```bash
npm install
```

3. Create your environment file:

```bash
cp example.env .env
```

4. Configure the `.env` file with your MySQL credentials (see [Environment Variables](#environment-variables)).

5. Start the server:

```bash
npm start
```

The application will automatically create the database, tables, and seed default admin accounts on first run.

6. Open your browser and navigate to `http://localhost:3000/login`.

### Default Accounts

| Email | Password | Role |
|-------|----------|------|
| admin@admin.com | 1234567890 | Super Admin |
| superadmin@admin.com | 1234567890 | Super Admin |

**Important:** Change these credentials immediately in any non-development environment.

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DB_HOST` | Yes | - | MySQL host address |
| `DB_USER` | Yes | - | MySQL username |
| `DB_PASSWORD` | Yes | - | MySQL password |
| `DB_NAME` | No | `product_catalog` | Database name |
| `PORT` | No | `3000` | Server port |
| `SESSION_SECRET` | Yes | `secret` | Session encryption key (change in production) |
| `NODE_ENV` | No | `development` | Set to `production` for secure cookies |
| `BASE_DOMAIN` | No | `lvh.me` | Base domain used in templates |

---

## Project Structure

```
Product Catalog System/
├── config/
│   └── database.js          # DB connection pool, schema creation, migrations, seeds
├── routes/
│   ├── auth.js              # Login / logout
│   ├── dashboard.js         # Admin dashboard
│   ├── settings.js          # Categories, countries, product types, users
│   ├── companies.js         # Affiliated companies CRUD
│   ├── suppliers.js         # Suppliers CRUD
│   ├── products.js          # Products CRUD + chunked uploads
│   ├── marketing.js         # Materials, events, testimonials
│   ├── packages.js          # Packages CRUD
│   ├── import.js            # Excel bulk import
│   └── company-public.js    # Public catalog (per-company)
├── views/
│   ├── layout.ejs           # Main layout wrapper
│   ├── admin/               # Admin panel templates
│   ├── public/              # Public catalog templates
│   └── ...                  # Login, error, dashboard
├── public/
│   ├── css/                 # Stylesheets
│   └── uploads/             # Runtime file storage (products, logos, marketing)
├── server.js                # Application entry point
├── package.json             # Dependencies and scripts
├── example.env              # Environment variable template
└── .gitignore
```

---

## Authentication and Roles

```mermaid
graph TD
    Login[POST /auth/login] --> Verify{bcrypt verify}
    Verify -->|Valid| CreateSession[Create Session]
    Verify -->|Invalid| Error[Show Error]
    CreateSession --> SetCookie[Set Cookie: product_catalog_session]
    SetCookie --> Redirect[Redirect to /admin]

    subgraph "Role Hierarchy"
        SA[Super Admin]
        AD[Admin]
        PS[Product Specialist]
        GD[Graphic Designer]
    end

    SA -->|Full access + delete| AllRoutes[All Admin Routes]
    AD -->|Cannot manage Super Admins| MostRoutes[Most Admin Routes]
    PS -->|Product-focused| LimitedRoutes[Product Routes]
    GD -->|Design-focused| DesignRoutes[Marketing Routes]
```

### Role Permissions

| Action | Super Admin | Admin | Product Specialist | Graphic Designer |
|--------|:-----------:|:-----:|:-----------------:|:----------------:|
| View Dashboard | Yes | Yes | Yes | Yes |
| Manage Products | Yes | Yes | Yes | Limited |
| Delete Products | Yes | No | No | No |
| Manage Companies | Yes | Yes | Yes | Yes |
| Manage Suppliers | Yes | Yes | Yes | Yes |
| Manage Marketing | Yes | Yes | Yes | Yes |
| Manage Packages | Yes | Yes | Yes | Yes |
| Delete Packages | Yes | No | No | No |
| Manage Users | Yes | Limited | No | No |
| Delete Users | Yes | No | No | No |
| Delete Settings | Yes | No | No | No |
| Import Data | Yes | Yes | Yes | Yes |

---

## License

This project is proprietary. All rights reserved.
