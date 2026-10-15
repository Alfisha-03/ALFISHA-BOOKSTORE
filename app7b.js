require("dotenv").config();
const express = require("express");
const mysql = require("mysql8");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const publicFolder = path.join(__dirname, "public");

// ===============================
// MYSQL DATABASE CONNECTION
// ===============================

const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "root",
    database: "bookstore"
});


db.connect((err) => {
    if (err) {
        console.error("Database connection failed:", err.message);
        return;
    }

    console.log("Connected to Bookstore database!");
});

// ===============================
// ESCAPE HTML VALUES
// ===============================
function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

// ===============================
// CHECK BOOK STOCK STATUS
// ===============================
function stockStatus(stock) {
    const quantity = Number(stock || 0);

    if (quantity === 0) {
        return {
            label: "Out of Stock",
            className: "out"
        };
    }

    if (quantity <= 5) {
        return {
            label: "Low Stock",
            className: "low"
        };
    }

    return {
        label: "In Stock",
        className: "available"
    };
}

// ===============================
// HOME PAGE
// ===============================
app.get("/", (req, res) => {
    res.sendFile(path.join(publicFolder, "index.html"));
});

// ===============================
// API: FETCH ALL BOOKS
// Uses consistent lowercase API field names.
// The actual database columns remain unchanged.
// ===============================
app.get("/api/books", (req, res) => {
    const sql = `
        SELECT
            Book_id AS book_id,
            Title AS title,
            Author AS author,
            category,
            price,
            stock
        FROM books
        ORDER BY Book_id DESC
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error("Error fetching books:", err.message);

            return res.status(500).json({
                message: "Failed to fetch books"
            });
        }

        res.json(results);
    });
});

// ===============================
// INVENTORY PAGE
// ===============================
app.get("/inventory.html", (req, res) => {
    const bookId = String(req.query.bookId || "all");

    const allowedStatuses = ["all", "available", "low", "out"];
    const requestedStatus = String(req.query.status || "all");

    const statusFilter = allowedStatuses.includes(requestedStatus)
        ? requestedStatus
        : "all";

    fs.readFile(
        path.join(publicFolder, "inventory.html"),
        "utf8",
        (fileError, html) => {
            if (fileError) {
                console.error(
                    "Error reading inventory.html:",
                    fileError.message
                );

                return res.status(500).send(
                    "Could not load inventory.html."
                );
            }

            db.query(
"SELECT * FROM books ORDER BY Book_id DESC",
                (dbError, books) => {
                    if (dbError) {
                        console.error(
                            "Error fetching inventory:",
                            dbError.message
                        );

                        return res.status(500).send(
                            "Could not load book inventory."
                        );
                    }

                    // Inventory summary
                    const totalBooks = books.length;

                    const totalStock = books.reduce(
                        (sum, book) =>
                            sum + Number(book.stock || 0),
                        0
                    );

                    const lowStock = books.filter((book) => {
                        const stock = Number(book.stock || 0);
                        return stock > 0 && stock <= 5;
                    }).length;

                    const outOfStock = books.filter(
                        (book) =>
                            Number(book.stock || 0) === 0
                    ).length;

                    // Book dropdown options
                    const bookOptions = books.map((book) => {
                        const id = String(book.Book_id);
                        const title = book.Title || "Untitled Book";

                        const label = `${title} — ID: ${id}`;

                        return `
                            <option
                                value="${escapeHTML(id)}"
                                ${bookId === id ? "selected" : ""}>
                                ${escapeHTML(label)}
                            </option>
                        `;
                    }).join("");

                    // Filter books by ID and stock status
                    const filteredBooks = books.filter((book) => {
                        const matchesBook =
                            bookId === "all" ||
                            String(book.Book_id) === bookId;

                        const status = stockStatus(book.stock);

                        const matchesStatus =
                            statusFilter === "all" ||
                            statusFilter === status.className;

                        return matchesBook && matchesStatus;
                    });

                    // Generate inventory table rows
                    const rows = filteredBooks.map((book) => {
                        const id = book.Book_id;
                        const title = book.Title || "Untitled Book";
                        const author = book.Author || "Author not specified";
                        const stock = Number(book.stock || 0);
                        const status = stockStatus(stock);

                        return `
                            <tr>
                                <td>${escapeHTML(id)}</td>

                                <td>
                                    <strong>${escapeHTML(title)}</strong>
                                    <br>
                                    <small>${escapeHTML(author)}</small>
                                </td>

                                <td>${escapeHTML(book.category)}</td>

                                <td>
                                    ₹${Number(book.price || 0).toFixed(2)}
                                </td>

                                <td>${stock}</td>

                                <td>
                                    <span class="stock-status ${status.className}">
                                        ${status.label}
                                    </span>
                                </td>

                                <td>
                                    <a
                                        class="inventory-action"
                                        href="update-book.html?id=${encodeURIComponent(id)}">
                                        Update
                                    </a>
                                </td>
                            </tr>
                        `;
                    }).join("");

                    // Replace HTML placeholders
                    const replacements = {
                        "{{TOTAL_BOOKS}}": totalBooks,
                        "{{TOTAL_STOCK}}": totalStock,
                        "{{LOW_STOCK}}": lowStock,
                        "{{OUT_STOCK}}": outOfStock,

                        "{{BOOK_OPTIONS}}": bookOptions,

                        "{{ALL_BOOKS_SELECTED}}":
                            bookId === "all" ? "selected" : "",

                        "{{ALL_SELECTED}}":
                            statusFilter === "all" ? "selected" : "",

                        "{{AVAILABLE_SELECTED}}":
                            statusFilter === "available" ? "selected" : "",

                        "{{LOW_SELECTED}}":
                            statusFilter === "low" ? "selected" : "",

                        "{{OUT_SELECTED}}":
                            statusFilter === "out" ? "selected" : "",

                        "{{BOOK_ROWS}}": rows || `
                            <tr>
                                <td colspan="7" class="inventory-empty">
                                    No books match your selection.
                                </td>
                            </tr>
                        `,

                        "{{RESULT_COUNT}}": filteredBooks.length
                    };

                    for (const [placeholder, value] of Object.entries(
                        replacements
                    )) {
                        html = html
                            .split(placeholder)
                            .join(String(value));
                    }

                    res.send(html);
                }
            );
        }
    );
});
// ===============================
// GET ONE BOOK FOR UPDATING
// ===============================
app.get("/api/books/:id", (req, res) => {
    const bookId = req.params.id;

    if (!/^\d+$/.test(bookId)) {
        return res.status(400).json({
            message: "Invalid book ID."
        });
    }

    const sql = `
        SELECT
            Book_id AS book_id,
            Title AS title,
            Author AS author,
            category,
            price,
            stock
        FROM books
        WHERE Book_id = ?
    `;

    db.query(sql, [bookId], (err, results) => {
        if (err) {
            console.error("Error fetching book:", err.message);

            return res.status(500).json({
                message: "Failed to fetch book details."
            });
        }

        if (results.length === 0) {
            return res.status(404).json({
                message: "Book not found."
            });
        }

        res.json(results[0]);
    });
});


// ===============================
// UPDATE EXISTING BOOK
// ===============================
app.post("/books/update", (req, res) => {
    const { book_id, title, author, category, price, stock } = req.body;

    if (
        !/^\d+$/.test(String(book_id || "")) ||
        typeof title !== "string" || !title.trim() ||
        typeof author !== "string" || !author.trim() ||
        typeof category !== "string" || !category.trim() ||
        price === undefined || price === "" ||
        stock === undefined || stock === ""
    ) {
        return res.status(400).send(
            "Please enter all book details correctly."
        );
    }

    const bookPrice = Number(price);
    const bookStock = Number(stock);

    if (
        !Number.isFinite(bookPrice) ||
        bookPrice < 0 ||
        !Number.isInteger(bookStock) ||
        bookStock < 0
    ) {
        return res.status(400).send(
            "Price must be zero or greater, and stock must be a whole number zero or greater."
        );
    }

    const sql = `
        UPDATE books
        SET Title = ?,
            Author = ?,
            category = ?,
            price = ?,
            stock = ?
        WHERE Book_id = ?
    `;

    const values = [
        title.trim(),
        author.trim(),
        category.trim(),
        bookPrice,
        bookStock,
        book_id
    ];

    db.query(sql, values, (err, result) => {
        if (err) {
            console.error("Error updating book:", err.message);

            return res.status(500).send(
                "Could not update the book. Check the VS Code terminal."
            );
        }

        if (result.affectedRows === 0) {
            return res.status(404).send(
                "Book not found. No changes were saved."
            );
        }

        res.redirect("/inventory.html");
    });
});
// ===============================
// DELETE A BOOK
// ===============================
app.post("/books/delete", (req, res) => {
    
    const bookId = String(req.body.book_id || "");

    if (!/^\d+$/.test(bookId)) {
        return res.status(400).send(
            "Invalid book ID. Please return to Inventory."
        );
    }

    const sql = "DELETE FROM books WHERE Book_id = ?";

    db.query(sql, [bookId], (err, result) => {
        if (err) {
            console.error("Error deleting book:", err.message);

            return res.status(500).send(
                "Could not delete the book. Check the VS Code terminal."
            );
        }

        if (result.affectedRows === 0) {
            return res.status(404).send(
                "Book not found. It may have already been deleted."
            );
        }

        res.redirect("/inventory.html");
    });
});

// ===============================
// ADD A NEW BOOK
// ===============================
app.post("/books/add", (req, res) => {
    const { title, author, category, price, stock } = req.body;

    // Validate required fields
    if (
        typeof title !== "string" || !title.trim() ||
        typeof author !== "string" || !author.trim() ||
        typeof category !== "string" || !category.trim() ||
        price === undefined || price === "" ||
        stock === undefined || stock === ""
    ) {
        return res.status(400).send(
            "Please fill in all required fields."
        );
    }

    const bookPrice = Number(price);
    const bookStock = Number(stock);

    // Validate price and stock
    if (
        !Number.isFinite(bookPrice) ||
        bookPrice < 0 ||
        !Number.isInteger(bookStock) ||
        bookStock < 0
    ) {
        return res.status(400).send(
            "Please enter a valid price and stock quantity."
        );
    }

    // Insert book using the existing database columns
    const sql = `
        INSERT INTO books
            (Title, Author, category, price, stock)
        VALUES (?, ?, ?, ?, ?)
    `;

    const values = [
        title.trim(),
        author.trim(),
        category.trim(),
        bookPrice,
        bookStock
    ];

    db.query(sql, values, (err) => {
        if (err) {
            console.error("Error adding book:", err.message);

            return res.status(500).send(
                "Could not add the book. Check the VS Code terminal for the database error."
            );
        }

        res.redirect("/inventory.html");
    });
});
 // ===============================
 // CREATE A SALE AND UPDATE STOCK
 // ===============================
app.post("/sales/create", (req, res) => {
    const customerName = String(req.body.customer_name || "").trim();
    const customerId = req.body.customer_id;
    const items = req.body.items;

    if ((!customerName && !customerId) ||
        !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
            message: "Select a customer and add at least one book."
        });
    }

    // Validate and combine repeated book IDs.
    const quantities = new Map();

    for (const item of items) {
        const id = String(item.book_id || "");
        const qty = Number(item.quantity);

        if (!/^\d+$/.test(id) ||
            !Number.isSafeInteger(qty) || qty < 1) {
            return res.status(400).json({
                message: "Invalid book ID or quantity."
            });
        }

        quantities.set(
            id,
            (quantities.get(id) || 0) + qty
        );
    }

    for (const qty of quantities.values()) {
        if (!Number.isSafeInteger(qty)) {
            return res.status(400).json({
                message: "Quantity is too large."
            });
        }
    }

    const bookIds = [...quantities.keys()];

    db.beginTransaction((transactionError) => {
        if (transactionError) {
            console.error(transactionError.message);
            return res.status(500).json({
                message: "Could not start the sale."
            });
        }

        function fail(status, message) {
            return db.rollback(() => {
                res.status(status).json({ message });
            });
        }

        // Find an existing customer.
        const customerSql = customerId
            ? "SELECT customer_id FROM customers WHERE customer_id = ?"
            : "SELECT customer_id FROM customers WHERE name = ? LIMIT 1";

        const customerValue = customerId
            ? customerId
            : customerName;

        db.query(customerSql, [customerValue], (err, customers) => {
            if (err) {
                console.error(err.message);
                return fail(500, "Could not find the customer.");
            }

            if (customers.length === 0) {
                return fail(
                    404,
                    "Customer not found. Add the customer first."
                );
            }

            const actualCustomerId = customers[0].customer_id;
            const placeholders = bookIds.map(() => "?").join(",");

            // Lock book records while checking stock.
            const bookSql = `
                SELECT
                    Book_id AS book_id,
                    Title AS title,
                    price,
                    stock
                FROM books
                WHERE Book_id IN (${placeholders})
                FOR UPDATE
            `;

            db.query(bookSql, bookIds, (bookError, books) => {
                if (bookError) {
                    console.error(bookError.message);
                    return fail(500, "Could not check book stock.");
                }

                if (books.length !== bookIds.length) {
                    return fail(404, "One or more books were not found.");
                }

                let total = 0;

                for (const book of books) {
                    const qty = quantities.get(String(book.book_id));
                    const price = Number(book.price);
                    const stock = Number(book.stock);

                    if (!Number.isFinite(price) || price < 0) {
                        return fail(400, "A book has an invalid price.");
                    }

                    if (!Number.isInteger(stock) || stock < qty) {
                        return fail(
                            400,
                            `Insufficient stock for "${book.title}".`
                        );
                    }

                    total += price * qty;
                }

                if (!Number.isFinite(total) ||
                    total > 99999999.99) {
                    return fail(400, "The bill total is too large.");
                }

                total = Math.round(total * 100) / 100;

                // Save the main bill.
                db.query(
                    `INSERT INTO sales (customer_id, total_amount)
                     VALUES (?, ?)`,
                    [actualCustomerId, total],
                    (saleError, saleResult) => {
                        if (saleError) {
                            console.error(saleError.message);
                            return fail(500, "Could not save the sale.");
                        }

                        const saleId = saleResult.insertId;
                        let index = 0;

                        // Save each item and reduce its stock.
                        function saveNextItem() {
                            if (index >= books.length) {
                                return db.commit((commitError) => {
                                    if (commitError) {
                                        console.error(commitError.message);
                                        return fail(
                                            500,
                                            "Could not complete the sale."
                                        );
                                    }

                                    res.json({
                                        message: "Sale completed successfully.",
                                        sale_id: saleId,
                                        total_amount: total
                                    });
                                });
                            }

                            const book = books[index];
                            const qty = quantities.get(
                                String(book.book_id)
                            );

                            db.query(
                                `INSERT INTO sale_items
                                 (sale_id, book_id, quantity)
                                 VALUES (?, ?, ?)`,
                                [saleId, book.book_id, qty],
                                (itemError) => {
                                    if (itemError) {
                                        console.error(itemError.message);
                                        return fail(
                                            500,
                                            "Could not save sale items."
                                        );
                                    }

                                    db.query(
                                        `UPDATE books
                                         SET stock = stock - ?
                                         WHERE Book_id = ? AND stock >= ?`,
                                        [qty, book.book_id, qty],
                                        (stockError, stockResult) => {
                                            if (stockError ||
                                                stockResult.affectedRows !== 1) {
                                                console.error(
                                                    stockError?.message ||
                                                    "Stock update failed."
                                                );

                                                return fail(
                                                    500,
                                                    "Could not update book stock."
                                                );
                                            }

                                            index++;
                                            saveNextItem();
                                        }
                                    );
                                }
                            );
                        }

                        saveNextItem();
                    }
                );
            });
        });
    });
});


// ===============================
// SERVE HTML, CSS, JAVASCRIPT,
// AND IMAGES FROM THE PUBLIC FOLDER
// ===============================
app.use(express.static(publicFolder));

// ===============================
// START SERVER
// ===============================
app.listen(PORT, () => {
    console.log(
        `ALFISHA BOOKSTORE running at http://localhost:${PORT}`
    );
});