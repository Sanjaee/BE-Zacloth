/**
 * Generate a URL-friendly slug from a string
 * @param {string} text - The text to convert to slug
 * @returns {string} - The generated slug
 */
function generateSlug(text) {
  if (!text) return "";

  return (
    text
      .toLowerCase()
      .trim()
      // Replace spaces and special characters with hyphens
      .replace(/[\s\W-]+/g, "-")
      // Remove leading and trailing hyphens
      .replace(/^-+|-+$/g, "")
      // Limit length to 100 characters
      .substring(0, 100)
  );
}

/**
 * Generate a unique slug by appending a number if the slug already exists
 * @param {string} baseSlug - The base slug
 * @param {Function} checkExists - Function to check if slug exists
 * @returns {Promise<string>} - The unique slug
 */
async function generateUniqueSlug(baseSlug, checkExists) {
  let slug = baseSlug;
  let counter = 1;

  while (await checkExists(slug)) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
}

module.exports = {
  generateSlug,
  generateUniqueSlug,
};
