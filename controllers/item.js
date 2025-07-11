const db = require('../config/database');

// --------------------
// PUBLIC ENDPOINTS
// --------------------

// Get all items for public view
const getAllItems = (req, res) => {
  const sql = `
    SELECT 
      i.item_id, 
      i.item_name, 
      i.sell_price, 
      i.image AS main_image,
      GROUP_CONCAT(ii.image_path) AS extra_images
    FROM item i
    LEFT JOIN item_images ii ON i.item_id = ii.item_id
    WHERE i.deleted_at IS NULL
      AND i.category_id IN (
        SELECT category_id FROM category WHERE deleted_at IS NULL
      )
    GROUP BY i.item_id
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error('❌ SQL Error:', err.message);
      return res.status(500).json({ status: 'error', message: 'Internal Server Error' });
    }

    const formatted = results.map(row => {
      const extra = row.extra_images ? row.extra_images.split(',') : [];
      const all = [row.main_image, ...extra].filter(Boolean);
      return {
        item_id: row.item_id,
        item_name: row.item_name,
        sell_price: row.sell_price,
        images: all
      };
    });

    res.json({ status: 'success', data: formatted });
  });
};

// Get items by category (public)
const getItemsByCategory = (req, res) => {
  const categoryId = req.params.categoryId;

  const sql = `
    SELECT 
      i.item_id, 
      i.item_name, 
      i.sell_price, 
      i.image AS main_image,
      GROUP_CONCAT(ii.image_path) AS extra_images
    FROM item i
    LEFT JOIN item_images ii ON i.item_id = ii.item_id
    WHERE i.deleted_at IS NULL 
      AND i.category_id = ? 
      AND i.category_id IN (
        SELECT category_id FROM category WHERE deleted_at IS NULL
      )
    GROUP BY i.item_id
  `;

  db.query(sql, [categoryId], (err, results) => {
    if (err) {
      console.error('❌ SQL Error:', err.message);
      return res.status(500).json({ status: 'error', message: 'Internal Server Error' });
    }

    const formatted = results.map(row => {
      const extra = row.extra_images ? row.extra_images.split(',') : [];
      const all = [row.main_image, ...extra].filter(Boolean);
      return {
        item_id: row.item_id,
        item_name: row.item_name,
        sell_price: row.sell_price,
        images: all
      };
    });

    res.json({ status: 'success', data: formatted });
  });
};

// --------------------
// ADMIN FUNCTIONS
// --------------------

// Get all items with stock and category
const getAllItemsWithStock = (req, res) => {
  const sql = `
    SELECT 
      i.item_id,
      i.item_name,
      i.description,
      i.cost_price,
      i.sell_price,
      i.image AS main_image,
      GROUP_CONCAT(ii.image_path) AS extra_images,
      i.category_id,
      i.created_at,
      i.updated_at,
      s.quantity,
      c.description AS category_name
    FROM item i
    INNER JOIN stock s ON i.item_id = s.item_id
    LEFT JOIN category c ON i.category_id = c.category_id
    LEFT JOIN item_images ii ON i.item_id = ii.item_id
    WHERE i.deleted_at IS NULL AND (c.deleted_at IS NULL OR c.category_id IS NULL)
    GROUP BY i.item_id
  `;

  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error', details: err });

    const formatted = rows.map(row => {
      const extra = row.extra_images ? row.extra_images.split(',') : [];
      const all = [row.main_image, ...extra].filter(Boolean);
      return {
        ...row,
        image: all[0] || null,
        all_images: all
      };
    });

    return res.status(200).json({ data: formatted });
  });
};

// Get single item
const getSingleItem = (req, res) => {
  const sql = `
    SELECT i.*, s.quantity, GROUP_CONCAT(ii.image_path) AS extra_images
    FROM item i
    INNER JOIN stock s ON i.item_id = s.item_id
    LEFT JOIN item_images ii ON i.item_id = ii.item_id
    WHERE i.item_id = ?
    GROUP BY i.item_id
  `;
  db.query(sql, [req.params.id], (err, result) => {
    if (err) return res.status(500).json({ error: 'Database error', details: err });

    const item = result[0];
    const extra = item.extra_images ? item.extra_images.split(',') : [];
    const all = [item.image, ...extra].filter(Boolean);
    item.all_images = all;

    return res.status(200).json({ success: true, result: [item] });
  });
};

// Create item
const createItem = (req, res) => {
  const { item_name, description, cost_price, sell_price, quantity, category_id } = req.body;
  const mainImage = req.file ? req.file.filename : null;

  if (!item_name || !description || !cost_price || !sell_price || !quantity || !category_id) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const itemSql = `
    INSERT INTO item (item_name, description, cost_price, sell_price, image, category_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `;
  const itemValues = [item_name, description, cost_price, sell_price, mainImage, category_id];

  db.execute(itemSql, itemValues, (err, result) => {
    if (err) return res.status(500).json({ error: 'Error inserting item', details: err });

    const itemId = result.insertId;

    const stockSql = `INSERT INTO stock (item_id, quantity) VALUES (?, ?)`;
    db.execute(stockSql, [itemId, quantity], (err2) => {
      if (err2) return res.status(500).json({ error: 'Error inserting stock', details: err2 });

      // Only insert into item_images if file is provided
      if (mainImage) {
        const imgSql = `INSERT INTO item_images (item_id, image_path) VALUES (?, ?)`;
        db.query(imgSql, [itemId, mainImage], (err3) => {
          if (err3) return res.status(500).json({ error: 'Error saving image path', details: err3 });
          return res.status(201).json({ success: true, message: 'Item created with image', itemId });
        });
      } else {
        return res.status(201).json({ success: true, message: 'Item created', itemId });
      }
    });
  });
};


// Update item
const updateItem = (req, res) => {
  const itemId = req.params.id;
  const { item_name, description, cost_price, sell_price, quantity, category_id } = req.body;
  const imageFiles = req.files || [];

  const itemSql = `
    UPDATE item
    SET item_name = ?, description = ?, cost_price = ?, sell_price = ?, category_id = ?
    WHERE item_id = ?
  `;
  const itemValues = [item_name, description, cost_price, sell_price, category_id, itemId];

  db.execute(itemSql, itemValues, (err) => {
    if (err) return res.status(500).json({ error: 'Error updating item', details: err });

    const stockSql = `UPDATE stock SET quantity = ? WHERE item_id = ?`;
    db.execute(stockSql, [quantity, itemId], (err2) => {
      if (err2) return res.status(500).json({ error: 'Error updating stock', details: err2 });

      if (imageFiles.length > 0) {
        const imgSql = `INSERT INTO item_images (item_id, image_path) VALUES ?`;
        const imgValues = imageFiles.map(file => [itemId, file.filename]);
        db.query(imgSql, [imgValues], (err3) => {
          if (err3) return res.status(500).json({ error: 'Error saving images', details: err3 });
          return res.status(200).json({ success: true, message: 'Item updated with new images' });
        });
      } else {
        return res.status(200).json({ success: true, message: 'Item updated' });
      }
    });
  });
};

// Delete item
const deleteItem = (req, res) => {
  const itemId = req.params.id;

  const deleteStockSql = `DELETE FROM stock WHERE item_id = ?`;
  db.execute(deleteStockSql, [itemId], (err1) => {
    if (err1) return res.status(500).json({ error: 'Error deleting stock', details: err1 });

    const deleteImagesSql = `DELETE FROM item_images WHERE item_id = ?`;
    db.execute(deleteImagesSql, [itemId], (err2) => {
      if (err2) return res.status(500).json({ error: 'Error deleting images', details: err2 });

      const deleteItemSql = `DELETE FROM item WHERE item_id = ?`;
      db.execute(deleteItemSql, [itemId], (err3) => {
        if (err3) return res.status(500).json({ error: 'Error deleting item', details: err3 });

        return res.status(200).json({ success: true, message: 'Item deleted' });
      });
    });
  });
};

// --------------------
// EXPORTS
// --------------------
module.exports = {
  getAllItems,
  getItemsByCategory,
  getAllItemsWithStock,
  getSingleItem,
  createItem,
  updateItem,
  deleteItem
};
