const connection = require('../config/database');

exports.getAllCategories = (req, res) => {
  const showDeleted = req.query.showDeleted === 'true'; // e.g. ?showDeleted=true
  const sql = showDeleted
    ? `SELECT * FROM category ORDER BY description ASC`
    : `SELECT category_id, description FROM category WHERE deleted_at IS NULL ORDER BY description ASC`;

  try {
    connection.query(sql, (err, rows) => {
      if (err instanceof Error) {
        console.log(err);
        return res.status(500).json({
          success: false,
          error: 'Error fetching categories',
          details: err,
        });
      }

      return res.status(200).json({
        success: true,
        data: rows || [],
      });
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      error: 'Server error',
      details: error,
    });
  }
};

// Fetch all categories including deleted ones (for admin)
exports.getAllCategoriesWithDeleted = (req, res) => {
  const sql = `SELECT category_id, description, deleted_at FROM category ORDER BY description ASC`;

  connection.query(sql, (err, rows) => {
      if (err) {
          console.error(err);
          return res.status(500).json({
              success: false,
              error: 'Error fetching all categories',
              details: err
          });
      }

      return res.status(200).json({
          success: true,
          data: rows || [],
      });
  });
};



exports.getSingleCategory = (req, res) => {
    const sql = `SELECT * FROM category WHERE category_id = ?`;
    const values = [parseInt(req.params.id)];
    
    try {
        connection.execute(sql, values, (err, result, fields) => {
            if (err instanceof Error) {
                console.log(err);
                return res.status(500).json({
                    success: false,
                    error: 'Error fetching category',
                    details: err
                });
            }

            if (result.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Category not found'
                });
            }

            return res.status(200).json({
                success: true,
                result
            });
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            success: false,
            error: 'Server error',
            details: error
        });
    }
};

exports.createCategory = (req, res, next) => {
    const { description } = req.body;

    // Validate required fields
    if (!description) {
        return res.status(400).json({ 
            success: false,
            error: 'Missing required fields' 
        });
    }

    const sql = 'INSERT INTO category (description, created_at) VALUES (?, NOW())';
    const values = [description];

    try {
        connection.execute(sql, values, (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ 
                    success: false,
                    error: 'Error inserting category', 
                    details: err 
                });
            }

            // Return success response
            return res.status(201).json({
                success: true,
                message: 'Category created successfully',
                categoryId: result.insertId
            });
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            success: false,
            error: 'Server error',
            details: error
        });
    }
};

exports.updateCategory = (req, res) => {
    const { description } = req.body;
    const categoryId = req.params.id;

    if (!description) {
        return res.status(400).json({
            success: false,
            error: 'Category description is required'
        });
    }

    const sql = 'UPDATE category SET description = ?, updated_at = NOW() WHERE category_id = ?';
    const values = [description, categoryId];

    try {
        connection.execute(sql, values, (err, result) => {
            if (err) {
                console.log(err);
                return res.status(500).json({
                    success: false,
                    error: 'Error updating category',
                    details: err
                });
            }

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Category not found'
                });
            }

            return res.status(200).json({
                success: true,
                message: 'Category updated successfully'
            });
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            success: false,
            error: 'Server error',
            details: error
        });
    }
};

exports.deleteCategory = (req, res) => {
    const categoryId = req.params.id;

    // First check if category is being used by any items
    const checkSql = 'SELECT COUNT(*) as count FROM item WHERE category_id = ? AND deleted_at IS NULL';
    
    try {
        connection.execute(checkSql, [categoryId], (err, result) => {
            if (err) {
                console.log(err);
                return res.status(500).json({
                    success: false,
                    error: 'Error checking category usage',
                    details: err
                });
            }

            if (result[0].count > 0) {
                // Soft delete items first
                const softDeleteItemsSql = 'UPDATE item SET deleted_at = NOW() WHERE category_id = ? AND deleted_at IS NULL';
                connection.execute(softDeleteItemsSql, [categoryId], (itemErr, itemResult) => {
                    if (itemErr) {
                        console.log(itemErr);
                        return res.status(500).json({
                            success: false,
                            error: 'Error soft deleting items for this category',
                            details: itemErr
                        });
                    }
                    softDeleteCategory();
                });
            } else {
                // No items to soft delete, just soft delete the category
                softDeleteCategory();
            }

            function softDeleteCategory() {
                const softDeleteCategorySql = 'UPDATE category SET deleted_at = NOW() WHERE category_id = ? AND deleted_at IS NULL';
                connection.execute(softDeleteCategorySql, [categoryId], (catErr, catResult) => {
                    if (catErr) {
                        console.log(catErr);
                        return res.status(500).json({
                            success: false,
                            error: 'Error soft deleting category',
                            details: catErr
                        });
                    }

                    if (catResult.affectedRows === 0) {
                        return res.status(404).json({
                            success: false,
                            error: 'Category not found or already deleted'
                        });
                    }

                    return res.status(200).json({
                        success: true,
                        message: 'Category and related items soft deleted successfully'
                    });
                });
            }
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            success: false,
            error: 'Server error',
            details: error
        });
    }
};

exports.restoreCategory = (req, res) => {
  const categoryId = req.params.id;

  const restoreCategorySql = `
      UPDATE category
      SET deleted_at = NULL, updated_at = NOW()
      WHERE category_id = ? AND deleted_at IS NOT NULL
  `;

  try {
      connection.execute(restoreCategorySql, [categoryId], (err, result) => {
          if (err) {
              console.log(err);
              return res.status(500).json({
                  success: false,
                  error: 'Error restoring category',
                  details: err
              });
          }

          if (result.affectedRows === 0) {
              return res.status(404).json({
                  success: false,
                  message: 'Category not found or already active'
              });
          }

          return res.status(200).json({
              success: true,
              message: 'Category restored successfully'
          });
      });
  } catch (error) {
      console.log(error);
      return res.status(500).json({
          success: false,
          error: 'Server error',
          details: error
      });
  }
};

// GET /api/categories/paginated?limit=10&offset=0&showDeleted=true
exports.getCategoriesPaginated = (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const offset = parseInt(req.query.offset) || 0;
  const sortParam = req.query.sort;
  // Default to descending by category_id if no valid sort param provided
  const sort = sortParam === 'asc' ? 'ASC' : 'DESC';

  const dataSql = `
    SELECT category_id, description, deleted_at 
    FROM category 
    ORDER BY category_id ${sort}
    LIMIT ? OFFSET ?
  `;

  const countSql = `SELECT COUNT(*) AS total FROM category`;

  try {
    connection.query(dataSql, [limit, offset], (err, results) => {
      if (err) {
        console.error('Error fetching paginated categories:', err);
        return res.status(500).json({
          success: false,
          error: 'Database error',
          details: err,
        });
      }

      connection.query(countSql, (countErr, countResult) => {
        if (countErr) {
          console.error('Error counting categories:', countErr);
          return res.status(500).json({
            success: false,
            error: 'Database count error',
            details: countErr,
          });
        }

        const total = countResult[0]?.total || 0;

        return res.status(200).json({
          success: true,
          data: results || [],
          total,
        });
      });
    });
  } catch (error) {
    console.error('Server error in getCategoriesPaginated:', error);
    return res.status(500).json({
      success: false,
      error: 'Server error',
      details: error,
    });
  }
};
