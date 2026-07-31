(function () {
  "use strict";

  const fallbackProducts = Array.isArray(window.ARVEL_PRODUCTS)
    ? window.ARVEL_PRODUCTS
    : [];

  function mapProduct(row) {
    const variants = [...(row.product_variants || [])];
    const images = [...(row.product_images || [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((image) => image.public_url);
    const stockByVariant = {};
    const variantIdByKey = {};

    variants.forEach((variant) => {
      const key = `${variant.size}|${variant.color}`;
      stockByVariant[key] = Number(variant.stock) || 0;
      variantIdByKey[key] = variant.id;
    });

    const stock = Object.values(stockByVariant).reduce(
      (total, value) => total + value,
      0
    );

    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      sku: row.sku,
      category: row.category,
      collection: row.collection || "",
      price: Number(row.price) || 0,
      oldPrice: null,
      discount: 0,
      shortDescription: row.short_description || "",
      description: row.description || "",
      material: row.material || "",
      care: row.care || "",
      measurements: row.measurements || {},
      sizes: row.sizes?.length
        ? row.sizes
        : [...new Set(variants.map((item) => item.size))],
      colors: row.colors?.length
        ? row.colors
        : [...new Set(variants.map((item) => item.color))],
      tags: row.tags || [],
      condition: row.condition || "Custom",
      featured: Boolean(row.featured),
      uniquePiece: Boolean(row.unique_piece),
      images,
      stock,
      stockByVariant,
      variantIdByKey,
      soldOut: stock <= 0,
      archived: false,
      status: row.status,
      createdAt: row.created_at
    };
  }

  async function loadCatalog() {
    if (!window.ArvelSupabase?.isConfigured) return fallbackProducts;

    const { data, error } = await window.ArvelSupabase.client
      .from("products")
      .select(`
        *,
        product_variants (id, size, color, stock, sku),
        product_images (id, storage_path, public_url, alt_text, sort_order)
      `)
      .eq("status", "published")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("No se pudo cargar el catálogo publicado.", error);
      return fallbackProducts;
    }

    const products = (data || []).map(mapProduct);
    window.ARVEL_PRODUCTS = products;
    return products;
  }

  window.ArvelCatalogReady = loadCatalog();
})();
