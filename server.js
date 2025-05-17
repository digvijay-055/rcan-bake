// server.js

// --- 1. Import Necessary Modules ---
require('dotenv').config(); // Load environment variables from .env file
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise'); // MySQL2 promise-based library
const crypto = require('crypto'); // For generating unique IDs and later for payment signatures
const path = require('path');

// --- Razorpay and Nodemailer will be fully configured in later steps ---
// const Razorpay = require('razorpay');
// const nodemailer = require('nodemailer');

// --- 2. Initialize Express App & Configurations ---
const app = express();
const PORT = process.env.PORT || 3001;

// --- 3. Middleware Setup ---
app.use(cors()); // Enable Cross-Origin Resource Sharing
app.use(express.json()); // Parse JSON request bodies

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Redirect unknown routes to index.html (optional)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// --- 4. MySQL Connection Pool ---
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 20000 // Increased timeout
};

let pool;
try {
    pool = mysql.createPool(dbConfig);
    console.log(`[${new Date().toISOString()}] MySQL connection pool created for database: ${process.env.DB_NAME}`);
} catch (error) {
    console.error(`[${new Date().toISOString()}] FATAL ERROR creating MySQL pool:`, error.message);
    process.exit(1);
}

// --- Test DB Connection Function ---
async function testDbConnection() {
    let connection;
    try {
        connection = await pool.getConnection();
        console.log(`[${new Date().toISOString()}] Attempting to connect to MySQL database: ${process.env.DB_NAME} on host ${process.env.DB_HOST}`);
        await connection.ping();
        console.log(`[${new Date().toISOString()}] MySQL connection ping successful.`);
    } catch (err) {
        console.error(`[${new Date().toISOString()}] MySQL connection error:`, err.message);
        // Detailed error logging based on common error codes
        if (err.code) console.error(`Error Code: ${err.code}`);
        if (err.errno) console.error(`Error Number: ${err.errno}`);
        if (err.sqlState) console.error(`SQL State: ${err.sqlState}`);
    } finally {
        if (connection) connection.release();
    }
}
testDbConnection();

async function loadProductsFromDB() {
    let connection;
    try {
        connection = await pool.getConnection();
        // Fetch products
        const [products] = await connection.query("SELECT * FROM products");

        // For each product, fetch thumbnails and attach
        for (const product of products) {
            product.thumbnails = await getThumbnailsForProduct(product.custom_id, connection);
        }

        return products;
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error loading products from DB:`, error);
        return [];
    } finally {
        if (connection) connection.release();
    }
}


// --- (Optional) Database Seeding Function for MySQL ---
const initialProductsDataForMySQL = [
    { custom_id: "1", name: "Classic Choco-Chip", description: "The timeless favorite, packed with rich chocolate chips and a soft, chewy center. Made with premium butter and Belgian chocolate.", price: 150.00, price_unit: "Box of 6", image_url: "https://placehold.co/600x400/FFFDD0/7B3F00?text=Classic+Choco-Chip", category: "Classic", stock_quantity: 50, ingredients: "All-Purpose Flour, Butter, Brown Sugar, Granulated Sugar, Eggs, Premium Chocolate Chips, Vanilla Extract, Baking Soda, Salt", allergen_info: "Contains Wheat, Eggs, Dairy. May contain traces of nuts.", storage_care: "Store in an airtight container at room temperature for up to 3-4 days. Can be refrigerated for up to a week." },
    { custom_id: "2", name: "Oatmeal Raisin Delight", description: "A wholesome classic with chewy oats, sweet raisins, and a hint of cinnamon. Perfectly balanced and satisfying.", price: 160.00, stock_quantity: 40, price_unit: "Box of 6", image_url: "https://placehold.co/600x400/FFFDD0/7B3F00?text=Oatmeal+Raisin", category: "Wholesome", ingredients: "All-Purpose Flour, Rolled Oats, Butter, Brown Sugar, Eggs, Raisins, Cinnamon, Vanilla Extract, Baking Soda, Salt", allergen_info: "Contains Wheat, Eggs, Dairy.", storage_care: "Store in an airtight container at room temperature for up to 3-4 days." },
    { custom_id: "3", name: "Double Choc Fudge", description: "For the ultimate chocolate lover - rich, fudgy, and intensely satisfying. Made with dark cocoa and chunks of decadent chocolate.", price: 180.00, stock_quantity: 30, price_unit: "Box of 6", image_url: "https://placehold.co/600x400/FFFDD0/7B3F00?text=Double+Choc+Fudge", category: "Indulgent", ingredients: "All-Purpose Flour, Dark Cocoa Powder, Butter, Sugar, Eggs, Dark Chocolate Chunks, Vanilla Extract, Baking Powder, Salt", allergen_info: "Contains Wheat, Eggs, Dairy.", storage_care: "Best enjoyed slightly warm. Store in an airtight container." },
    { custom_id: "4", name: "Peanut Butter Bliss", description: "Creamy peanut butter goodness in every soft and chewy bite. A perfect blend of sweet and salty.", price: 170.00, stock_quantity: 0, price_unit: "Box of 6", image_url: "https://placehold.co/600x400/FFFDD0/7B3F00?text=Peanut+Butter+Bliss", category: "Classic", ingredients: "All-Purpose Flour, Peanut Butter, Butter, Brown Sugar, Granulated Sugar, Eggs, Vanilla Extract, Baking Soda, Salt", allergen_info: "Contains Wheat, Eggs, Dairy, Peanuts.", storage_care: "Store in an airtight container." },
    { custom_id: "5", name: "Lemon Zest Shortbread", description: "Buttery shortbread infused with bright lemon zest for a refreshing citrusy note. Crumbly and delightful.", price: 165.00, stock_quantity: 25, price_unit: "Box of 8", image_url: "https://placehold.co/600x400/FFFDD0/7B3F00?text=Lemon+Shortbread", category: "Wholesome", ingredients: "All-Purpose Flour, Butter, Powdered Sugar, Lemon Zest, Vanilla Extract, Salt", allergen_info: "Contains Wheat, Dairy.", storage_care: "Store in an airtight container. Keeps well for a week." }
];
const initialThumbnailsData = {
    "1": ["https://placehold.co/150x120/FFFDD0/7B3F00?text=Choco-Chip+1", "https://placehold.co/150x120/FFFDD0/7B3F00?text=Choco-Chip+2", "https://placehold.co/150x120/FFFDD0/7B3F00?text=Choco-Chip+3", "https://placehold.co/150x120/FFFDD0/7B3F00?text=Choco-Chip+Packaged"],
    "2": ["https://placehold.co/150x120/FFFDD0/7B3F00?text=Oatmeal+1", "https://placehold.co/150x120/FFFDD0/7B3F00?text=Oatmeal+2"],
    "3": ["https://placehold.co/150x120/FFFDD0/7B3F00?text=Double+Choc+1"]
};

async function seedMySQLDatabase() {
    let connection;
    try {
        connection = await pool.getConnection();
        console.log(`[${new Date().toISOString()}] Checking if products table is empty for seeding...`);
        const [rows] = await connection.query("SELECT COUNT(*) as count FROM products");
        if (rows[0].count === 0 && initialProductsDataForMySQL.length > 0) {
            console.log(`[${new Date().toISOString()}] Seeding products...`);
            await connection.beginTransaction();
            for (const product of initialProductsDataForMySQL) {
                const { custom_id, name, description, price, price_unit, image_url, category, stock_quantity, ingredients, allergen_info, storage_care } = product;
                await connection.query(
                    "INSERT INTO products (custom_id, name, description, price, price_unit, image_url, category, stock_quantity, ingredients, allergen_info, storage_care) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    [custom_id, name, description, price, price_unit, image_url, category, stock_quantity, ingredients, allergen_info, storage_care]
                );
                if (initialThumbnailsData[custom_id]) {
                    for (const thumbUrl of initialThumbnailsData[custom_id]) {
                        await connection.query(
                            "INSERT INTO product_thumbnails (product_custom_id, thumbnail_url) VALUES (?, ?)",
                            [custom_id, thumbUrl]
                        );
                    }
                }
            }
            await connection.commit();
            console.log(`[${new Date().toISOString()}] ${initialProductsDataForMySQL.length} products and their thumbnails seeded.`);
        } else {
            console.log(`[${new Date().toISOString()}] Products table not empty or no initial data for seeding. Seeding skipped.`);
        }
    } catch (error) {
        if (connection) await connection.rollback();
        console.error(`[${new Date().toISOString()}] Error seeding MySQL database:`, error);
    } finally {
        if (connection) connection.release();
    }
}
// seedMySQLDatabase(); // <<<< IMPORTANT: RUN THIS ONCE with your data, THEN COMMENT IT OUT

// --- Helper function to fetch thumbnails for a product ---
async function getThumbnailsForProduct(productCustomId, dbConnection) {
    const conn = dbConnection || await pool.getConnection(); // Use passed connection or get new
    try {
        const [thumbnails] = await conn.query("SELECT thumbnail_url FROM product_thumbnails WHERE product_custom_id = ?", [productCustomId]);
        return thumbnails.map(t => t.thumbnail_url);
    } finally {
        if (!dbConnection && conn) conn.release(); // Release only if new connection was made
    }
}

// --- 5. API Endpoints ---

// GET /api/products
app.get('/api/products', async (req, res) => {
    const logPrefix = `[${new Date().toISOString()}] GET /api/products:`;
    let connection;
    try {
        connection = await pool.getConnection();
        const [productsFromDB] = await connection.query("SELECT * FROM products");
        const productsWithThumbnails = await Promise.all(productsFromDB.map(async (p) => {
            const thumbnails = await getThumbnailsForProduct(p.custom_id, connection);
            return { ...p, id: p.custom_id, imageUrl: p.image_url, stockQuantity: p.stock_quantity, priceUnit: p.price_unit, thumbnails };
        }));
        console.log(`${logPrefix} Responding with ${productsWithThumbnails.length} products.`);
        res.json(productsWithThumbnails);
    } catch (error) {
        console.error(`${logPrefix} Error fetching products:`, error);
        res.status(500).json({ success: false, message: "Failed to fetch products from database." });
    } finally {
        if (connection) connection.release();
    }
});

// GET /api/products/:id
app.get('/api/products/:id', async (req, res) => {
    const productCustomId = req.params.id;
    const logPrefix = `[${new Date().toISOString()}] GET /api/products/${productCustomId}:`;
    let connection;
    try {
        connection = await pool.getConnection();
        const [productsFromDB] = await connection.query("SELECT * FROM products WHERE custom_id = ?", [productCustomId]);
        if (productsFromDB.length > 0) {
            const product = productsFromDB[0];
            const thumbnails = await getThumbnailsForProduct(product.custom_id, connection);
            console.log(`${logPrefix} Found product: ${product.name}`);
            res.json({ ...product, id: product.custom_id, imageUrl: product.image_url, stockQuantity: product.stock_quantity, priceUnit: product.price_unit, thumbnails });
        } else {
            console.log(`${logPrefix} Product not found.`);
            res.status(404).json({ success: false, message: "Product not found" });
        }
    } catch (error) {
        console.error(`${logPrefix} Error fetching product:`, error);
        res.status(500).json({ success: false, message: "Failed to fetch product details." });
    } finally {
        if (connection) connection.release();
    }
});

// POST /api/products
app.post('/api/products', async (req, res) => {
    const logPrefix = `[${new Date().toISOString()}] POST /api/products:`;
    const { name, description, price, priceUnit, imageUrl, category, ingredients, allergenInfo, storageCare, stockQuantity, thumbnails } = req.body;

    if (!name || !description || price == null || stockQuantity == null) {
        return res.status(400).json({ success: false, message: "Missing required fields: name, description, price, stockQuantity." });
    }
    if (isNaN(parseFloat(price)) || parseFloat(price) <= 0 || isNaN(parseInt(stockQuantity)) || parseInt(stockQuantity) < 0) {
        return res.status(400).json({ success: false, message: "Price must be a positive number and stock quantity non-negative." });
    }

    const newCustomId = `PROD-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const effectiveImageUrl = imageUrl || `https://placehold.co/600x400/FFFDD0/7B3F00?text=${encodeURIComponent(name)}`;
    const ingredientsString = Array.isArray(ingredients) ? ingredients.join(', ') : (ingredients || '');

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        const [result] = await connection.query(
            "INSERT INTO products (custom_id, name, description, price, price_unit, image_url, category, stock_quantity, ingredients, allergen_info, storage_care) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [newCustomId, name, description, parseFloat(price), priceUnit || 'each', effectiveImageUrl, category || 'Uncategorized', parseInt(stockQuantity), ingredientsString, allergenInfo || '', storageCare || '']
        );
        if (Array.isArray(thumbnails) && thumbnails.length > 0) {
            for (const thumbUrl of thumbnails) {
                if (thumbUrl && typeof thumbUrl === 'string' && thumbUrl.trim() !== '') {
                    await connection.query("INSERT INTO product_thumbnails (product_custom_id, thumbnail_url) VALUES (?, ?)", [newCustomId, thumbUrl.trim()]);
                }
            }
        }
        await connection.commit();
        console.log(`${logPrefix} Product "${name}" (Custom ID: ${newCustomId}, DB ID: ${result.insertId}) added.`);
        const [newProductRows] = await connection.query("SELECT * FROM products WHERE custom_id = ?", [newCustomId]);
        const productDataForResponse = newProductRows[0];
        res.status(201).json({ success: true, message: "Product added successfully", product: { ...productDataForResponse, id: newCustomId, imageUrl: productDataForResponse.image_url, stockQuantity: productDataForResponse.stock_quantity, priceUnit: productDataForResponse.price_unit, thumbnails: thumbnails || [] } });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error(`${logPrefix} Error adding product:`, error);
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: "Product with this Custom ID already exists." });
        res.status(500).json({ success: false, message: "Failed to add product due to a server error." });
    } finally {
        if (connection) connection.release();
    }
});

// PUT /api/products/:id
app.put('/api/products/:id', async (req, res) => {
    const productCustomId = req.params.id;
    const logPrefix = `[${new Date().toISOString()}] PUT /api/products/${productCustomId}:`;
    const { name, description, price, priceUnit, imageUrl, category, ingredients, allergenInfo, storageCare, stockQuantity, thumbnails } = req.body;

    if (!name || !description || price == null || stockQuantity == null) return res.status(400).json({ success: false, message: "Missing required fields for update." });
    if (isNaN(parseFloat(price)) || parseFloat(price) <= 0 || isNaN(parseInt(stockQuantity)) || parseInt(stockQuantity) < 0) return res.status(400).json({ success: false, message: "Invalid price or stock quantity." });

    const ingredientsString = Array.isArray(ingredients) ? ingredients.join(', ') : (ingredients || '');
    const effectiveImageUrl = imageUrl || `https://placehold.co/600x400/FFFDD0/7B3F00?text=${encodeURIComponent(name)}`;

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        const [result] = await connection.query(
            "UPDATE products SET name = ?, description = ?, price = ?, price_unit = ?, image_url = ?, category = ?, stock_quantity = ?, ingredients = ?, allergen_info = ?, storage_care = ? WHERE custom_id = ?",
            [name, description, parseFloat(price), priceUnit || 'each', effectiveImageUrl, category || 'Uncategorized', parseInt(stockQuantity), ingredientsString, allergenInfo || '', storageCare || '', productCustomId]
        );
        if (result.affectedRows === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: "Product not found for update." });
        }
        await connection.query("DELETE FROM product_thumbnails WHERE product_custom_id = ?", [productCustomId]);
        if (Array.isArray(thumbnails) && thumbnails.length > 0) {
            for (const thumbUrl of thumbnails) {
                if (thumbUrl && typeof thumbUrl === 'string' && thumbUrl.trim() !== '') {
                    await connection.query("INSERT INTO product_thumbnails (product_custom_id, thumbnail_url) VALUES (?, ?)", [productCustomId, thumbUrl.trim()]);
                }
            }
        }
        await connection.commit();
        console.log(`${logPrefix} Product "${name}" updated.`);
        const [updatedProductRows] = await connection.query("SELECT * FROM products WHERE custom_id = ?", [productCustomId]);
        const productDataForResponse = updatedProductRows[0];
        res.json({ success: true, message: `Product "${name}" updated successfully.`, product: { ...productDataForResponse, id: productCustomId, imageUrl: productDataForResponse.image_url, stockQuantity: productDataForResponse.stock_quantity, priceUnit: productDataForResponse.price_unit, thumbnails: thumbnails || [] } });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error(`${logPrefix} Error updating product:`, error);
        res.status(500).json({ success: false, message: "Failed to update product." });
    } finally {
        if (connection) connection.release();
    }
});

// DELETE /api/products/:id
app.delete('/api/products/:id', async (req, res) => {
    const productCustomId = req.params.id;
    const logPrefix = `[${new Date().toISOString()}] DELETE /api/products/${productCustomId}:`;
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        // Thumbnails are deleted by ON DELETE CASCADE in DB schema. If not, delete manually:
        // await connection.query("DELETE FROM product_thumbnails WHERE product_custom_id = ?", [productCustomId]);
        const [result] = await connection.query("DELETE FROM products WHERE custom_id = ?", [productCustomId]);
        if (result.affectedRows === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: "Product not found for deletion." });
        }
        await connection.commit();
        console.log(`${logPrefix} Product with custom_id ${productCustomId} deleted.`);
        res.json({ success: true, message: `Product deleted successfully.` });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error(`${logPrefix} Error deleting product:`, error);
        if (error.code === 'ER_ROW_IS_REFERENCED_2') return res.status(400).json({ success: false, message: "Cannot delete product: it's referenced in existing orders." });
        res.status(500).json({ success: false, message: "Failed to delete product." });
    } finally {
        if (connection) connection.release();
    }
});

// POST /api/cart/add (Stock check)
app.post('/api/cart/add', async (req, res) => {
    const { productId, quantity } = req.body; // productId is custom_id
    const logPrefix = `[${new Date().toISOString()}] POST /api/cart/add (Product Custom ID: ${productId}):`;
    if (!productId || !quantity || isNaN(parseInt(quantity)) || parseInt(quantity) < 1) return res.status(400).json({ success: false, message: "Invalid product ID or quantity." });

    let connection;
    try {
        connection = await pool.getConnection();
        const [products] = await connection.query("SELECT name, stock_quantity FROM products WHERE custom_id = ?", [productId]);
        if (products.length === 0) return res.status(404).json({ success: false, message: "Product not found." });
        
        const product = products[0];
        const requestedQuantity = parseInt(quantity);
        if (product.stock_quantity < requestedQuantity) {
            return res.json({
                success: product.stock_quantity > 0, // Success if some stock, even if less than requested
                message: product.stock_quantity > 0 ? `Limited stock for ${product.name}. Only ${product.stock_quantity} available.` : `${product.name} is out of stock.`,
                availableStock: product.stock_quantity
            });
        }
        res.json({ success: true, message: `${product.name} (x${requestedQuantity}) stock check OK.` });
    } catch (error) {
        console.error(`${logPrefix} Error checking stock:`, error);
        res.status(500).json({ success: false, message: "Server error checking product stock." });
    } finally {
        if (connection) connection.release();
    }
});

// POST /api/orders (Initialize order, update stock)
app.post('/api/orders', async (req, res) => {
    const { shippingInfo, paymentMethod, cartItems } = req.body;
    const logPrefix = `[${new Date().toISOString()}] POST /api/orders:`;
    if (!shippingInfo || !paymentMethod || !cartItems || cartItems.length === 0) return res.status(400).json({ success: false, message: "Missing required order information." });

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        let subtotal = 0;
        let orderItemsForDB = [];

        for (const item of cartItems) {
            const [products] = await connection.query("SELECT name, price, stock_quantity FROM products WHERE custom_id = ?", [item.productId]);
            if (products.length === 0) throw new Error(`Product ${item.name || item.productId} not found.`);
            
            const productInDb = products[0];
            const requestedQuantity = parseInt(item.quantity);
            if (productInDb.stock_quantity < requestedQuantity) throw new Error(`Insufficient stock for ${productInDb.name}. Requested: ${requestedQuantity}, Available: ${productInDb.stock_quantity}.`);
            
            const [updateResult] = await connection.query(
                "UPDATE products SET stock_quantity = stock_quantity - ? WHERE custom_id = ? AND stock_quantity >= ?",
                [requestedQuantity, item.productId, requestedQuantity]
            );
            if (updateResult.affectedRows === 0) throw new Error(`Failed to update stock for ${productInDb.name}.`);
            
            const priceAtPurchase = parseFloat(item.priceAtPurchase || productInDb.price);
            subtotal += priceAtPurchase * requestedQuantity;
            orderItemsForDB.push({ product_custom_id: item.productId, product_name: productInDb.name, quantity: requestedQuantity, price_at_purchase: priceAtPurchase });
        }

        const SHIPPING_COST = (subtotal > 0 && subtotal < 500) ? 50 : 0;
        const totalAmount = subtotal + SHIPPING_COST;
        const generatedOrderId = `RBO-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

        const [orderInsertResult] = await connection.query(
            "INSERT INTO orders (order_id, full_name, email, phone, address, city, pincode, delivery_notes, payment_method, subtotal, shipping_cost, total_amount, order_status, payment_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [generatedOrderId, shippingInfo.fullName, shippingInfo.email, shippingInfo.phone, shippingInfo.address, shippingInfo.city, shippingInfo.pincode, shippingInfo.deliveryNotes || null, paymentMethod, subtotal, SHIPPING_COST, totalAmount, 'Pending Payment', 'Pending']
        );
        const newOrderInternalId = orderInsertResult.insertId;

        for (const dbItem of orderItemsForDB) {
            await connection.query(
                "INSERT INTO order_items (order_internal_id, product_custom_id, product_name, quantity, price_at_purchase) VALUES (?, ?, ?, ?, ?)",
                [newOrderInternalId, dbItem.product_custom_id, dbItem.product_name, dbItem.quantity, dbItem.price_at_purchase]
            );
        }
        await connection.commit();
        console.log(`${logPrefix} Order ${generatedOrderId} initialized (DB ID: ${newOrderInternalId}).`);
        res.status(201).json({ success: true, message: "Order initialized. Proceed to payment or confirm COD.", orderId: generatedOrderId, totalAmount: totalAmount });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error(`${logPrefix} Error initializing order:`, error.message);
        res.status(400).json({ success: false, message: error.message || "Failed to initialize order." });
    } finally {
        if (connection) connection.release();
    }
});

// --- Stubs for Payment Gateway and Email (To be implemented in Steps 2 & 3) ---
app.post('/api/payment/create-order', (req, res) => res.status(501).json({ success: false, message: "Payment order creation not implemented." }));
app.post('/api/payment/verify', (req, res) => res.status(501).json({ success: false, message: "Payment verification not implemented." }));
app.post('/api/payment/webhook', (req, res) => res.status(200).json({ status: "ok (webhook stub)" }));
app.post('/api/contact', (req, res) => res.json({ success: true, message: "Contact message stub: Email not sent yet." }));

//--- 6. Basic Error Handling Middleware ---
app.use((err, req, res, next) => {
    console.error(`[${new Date().toISOString()}] SERVER ERROR:`, err.message, err.stack);
    res.status(500).json({ success: false, message: 'An unexpected server error occurred.' });
});

// --- 7.  Start Server ---
let products = []; // Initialize as empty array (or fetch real products before starting server)

app.listen(PORT, () => {
    console.log(`Rcan Bakes backend server running on http://localhost:${PORT}`);
    console.log(`Connected to MySQL DB: ${process.env.DB_NAME} on host ${process.env.DB_HOST}`);
    console.log(`Server is running on port ${PORT}`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log(`Current Products in memory: ${products.length}`);
    console.log(`Available endpoints:`);
    console.log(`  GET    /api/products`);
    console.log(`  POST   /api/products (to add a new product)`);
    console.log(`  GET    /api/products/:id`);
    console.log(`  PUT    /api/products/:id (to update a product)`);
    console.log(`  DELETE /api/products/:id (to delete a product)`);
    console.log(`  POST   /api/cart/add`);
    console.log(`  POST   /api/orders`);
});
